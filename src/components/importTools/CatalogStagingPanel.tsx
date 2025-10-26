import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FieldMapper, { MappingPlan } from "@/components/importTools/FieldMapper";

type Summary = {
  catalog_rows?: number;
  catalog_dupe_pk?: number;
  catalog_type_warnings?: number;
  catalog_missing_required?: number;
};

type GtRow = {
  field: string;
  formula: string;
  total_rows: number;
  matches: number;
  mismatches: number;
  null_in_csv: number;
  missing_dependencies: boolean;
};

const CHUNK_SIZE = 1000;

export default function CatalogStagingPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dupeRows, setDupeRows] = useState<any[]>([]);
  const [warnRows, setWarnRows] = useState<any[]>([]);
  const [mergePreview, setMergePreview] = useState<any | null>(null);
  const [targetColumns, setTargetColumns] = useState<string[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [keyConfirmed, setKeyConfirmed] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [lastSha, setLastSha] = useState<string | null>(null);
  const [replaceStagedByFile, setReplaceStagedByFile] = useState<boolean>(true);
  const [plan, setPlan] = useState<MappingPlan | null>(null);
  const [gtRows, setGtRows] = useState<GtRow[]>([]);
  const [savingVis, setSavingVis] = useState(false);

  const [showDdl, setShowDdl] = useState(false);
  const [showComputed, setShowComputed] = useState(false);
  const [updatesOnly, setUpdatesOnly] = useState(false);

  async function computeSha256Hex(f: File) {
    const buf = await f.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    const bytes = Array.from(new Uint8Array(hash));
    return bytes.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function loadCatalogColumns() {
    const { data: baseCols, error } = await supabase
      .from("v_db_columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", "catalog")
      .order("ordinal_position", { ascending: true });
    if (error) {
      console.error(error);
      toast.error("Failed to load table columns");
      return;
    }
    setTargetColumns((baseCols || []).map((r: any) => String(r.column_name).toLowerCase()));
  }

  async function stageCsv() {
    if (!file) {
      toast.error("Choose a CSV file first");
      return;
    }
    setLoading(true);
    try {
      await loadCatalogColumns();
      const sha = await computeSha256Hex(file);
      setLastSha(sha);

      const parsed = await new Promise<{ rows: any[]; headers: string[] }>((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
          transform: (v) => (typeof v === "string" ? v.trim() : v),
          complete: (res) => {
            const rows = res.data as Record<string, any>[];
            const headers = res.meta.fields ? (res.meta.fields as string[]) : Object.keys(rows[0] || {});
            resolve({ rows, headers });
          },
          error: (err) => reject(err),
        });
      });

      const lcHeaders = parsed.headers.map(h => h.toLowerCase().trim());
      setCsvHeaders(lcHeaders);
      setSampleRows(parsed.rows.slice(0, 200));

      // pull staging columns on-demand (avoid race with state)
      const { data: _stgColsQ } = await supabase
        .from("v_db_columns")
        .select("column_name")
        .eq("table_schema", "public")
        .eq("table_name", "stg_catalog")
        .order("ordinal_position", { ascending: true });
      const _stgCols = (_stgColsQ || []).map((r: any) => String(r.column_name).toLowerCase());
      const allowed = new Set([..._stgCols, "src_file", "pk_catalog_id"]);

      
      // Optional: remove any previously staged rows for this file to avoid duplicate PKs
      if (replaceStagedByFile && file?.name) {
        const { error: delErr } = await supabase
          .from('stg_catalog')
          .delete()
          .eq('src_file', file.name);
        if (delErr) { console.warn('Warning: could not clear previous staged rows for file', delErr.message); }
      }

const stagedRows = parsed.rows.map((r) => {
        const copy: Record<string, any> = { src_file: file.name, ...r };
        // normalize common typo
        if (copy["days_since_last_sighitng"] !== undefined && copy["days_since_last_sighting"] === undefined) {
          copy["days_since_last_sighting"] = copy["days_since_last_sighitng"];
        }
        return copy;
      });

      const filtered = stagedRows.map((row) => {
        const o: Record<string, any> = {};
        for (const k of Object.keys(row)) {
          const lc = k.replace(/^\uFEFF/, "").trim().toLowerCase();
          if (allowed.has(lc)) o[lc] = row[k];
        }
        return o;
      });

      let total = 0;
      for (let i = 0; i < filtered.length; i += CHUNK_SIZE) {
        const chunk = filtered.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from("stg_catalog").insert(chunk, { returning: "minimal" });
        if (error) throw new Error(`Insert failed at batch ${Math.floor(i / CHUNK_SIZE) + 1}: ${error.message}`);
        total += chunk.length;
      }
      toast.success(`Staged ${total} rows into stg_catalog`);
      await refreshDryRun();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Staging failed");
    } finally {
      setLoading(false);
    }
  }

  async function refreshDryRun() {
    const { data: sum, error } = await supabase.from("stg_summary").select("*").single();
    if (error) {
      console.error(error);
      toast.error("Failed to load dry-run summary");
      return;
    }
    setSummary(sum as Summary);

    const { data: d } = await supabase.from("stg_v_catalog_dupe_pk").select("*").limit(25);
    setDupeRows(d || []);

    const { data: w } = await supabase.from("stg_v_catalog_type_warnings").select("*").limit(25);
    setWarnRows(w || []);

    const { data: mp } = await supabase.from("stg_merge_preview_catalog").select("*").maybeSingle();
    setMergePreview(mp || null);
  }

  function presentCreatePending(p: MappingPlan | null) {
    if (!p) return { pendingCreates: 0, updateCols: [] as string[] };
    const mappedExisting = p.mappings
      .filter(m => m.action === "map_existing" && m.target)
      .map(m => String(m.target).toLowerCase());
    const pendingCreates = p.mappings.filter(m => m.action === "create_new" && !m.asComputed).length;
    const updateCols = Array.from(new Set(mappedExisting.filter(c => c !== "pk_catalog_id")));
    return { pendingCreates, updateCols };
  }

  async function commit() {
    if (!plan) return;
    const { pendingCreates, updateCols } = presentCreatePending(plan);
    if (pendingCreates > 0) { toast.error("Apply DDL for new columns, refresh, then commit."); return; }
    if (updateCols.length === 0) { toast.error("Select at least one column to update."); return; }
    if (!keyConfirmed) { toast.error("Confirm pk_catalog_id as primary key."); return; }
    setLoading(true);
    try {
      const fn = updatesOnly
        ? "fn_imports_commit_catalog_cols_updates_only"
        : "fn_imports_commit_catalog_cols";
      const { data, error } = await supabase.rpc(fn, {
        p_columns: updateCols,
        p_src_file: file?.name || null,
        p_file_sha256: lastSha || null,
      });
      if (error) throw error;
      if (updatesOnly) {
        toast.success(`Catalog committed (updates-only): ~${(data?.updated_catalog ?? 0)} updated`);
      } else {
        toast.success(`Catalog committed: +${(data?.inserted_catalog ?? 0)} new, ~${(data?.updated_catalog ?? 0)} updated`);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Commit failed");
    } finally {
      setLoading(false);
    }
  }

  async function clearStaging() {
    setLoading(true);
    try {
      const { error } = await supabase.rpc("fn_imports_clear_staging");
      if (error) throw error;
      setSummary(null);
      setDupeRows([]);
      setWarnRows([]);
      setMergePreview(null);
      setFile(null);
      setLastSha(null);
      setKeyConfirmed(false);
      setPlan(null);
      setGtRows([]);
      toast.success("Staging tables truncated");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Clear staging failed");
    } finally {
      setLoading(false);
    }
  }

  async function runGroundtruth() {
    try {
      const checks = plan?.mappings
        .filter(m => m.asComputed)
        .map(m => (m.target || m.csvHeader).toLowerCase()) || null;

      const { data, error } = await supabase.rpc("fn_imports_groundtruth_catalog", {
        p_checks: checks && checks.length ? checks : null
      });
      if (error) throw error;
      setGtRows(data || []);
      const hasMismatch = (data || []).some((r: GtRow) => r.mismatches > 0 && !r.missing_dependencies);
      if (hasMismatch) toast.warning("Groundtruth: some calculated fields differ from CSV values.");
      else toast.success("Groundtruth: all computable calculated fields match CSV values.");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Groundtruth failed");
    }
  }

  async function saveAdminVisibility() {
    if (!plan) return;
    setSavingVis(true);
    try {
      const map: Record<string, boolean> = {};
      for (const m of plan.mappings) {
        const col = String(m.target || m.csvHeader).toLowerCase();
        if (!col || col === "pk_catalog_id") continue;
        const isRealColumn = (m.action === "map_existing") || (m.action === "create_new" && !m.asComputed);
        if (isRealColumn) map[col] = !!m.adminOnly;
      }
      const { error } = await supabase.rpc("fn_set_field_visibility", {
        p_table: "catalog",
        p_map: map
      });
      if (error) throw error;
      toast.success("Admin-only visibility saved");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Save visibility failed");
    } finally {
      setSavingVis(false);
    }
  }

  const commitDisabled = useMemo(() => {
    if (!summary) return true;
    const errs = (summary.catalog_dupe_pk || 0) + (summary.catalog_missing_required || 0);
    const { pendingCreates, updateCols } = presentCreatePending(plan);
    return loading || !keyConfirmed || errs > 0 || pendingCreates > 0 || updateCols.length === 0;
  }, [summary, plan, keyConfirmed, loading]);

  const ddlText = useMemo(() => (plan?.ddl || []).join("\n"), [plan]);
  const computedText = useMemo(() => plan?.computedSql || "", [plan]);

  function copyText(txt: string, label: string) {
    if (!txt) { toast.error(`No ${label} to copy`); return; }
    navigator.clipboard.writeText(txt).then(() => toast.success(`${label} copied`));
  }
  function downloadText(txt: string, filename: string) {
    if (!txt) return;
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Catalog CSV file</label>
          <Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        <div className="flex gap-2 items-center"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={replaceStagedByFile} onChange={e=>setReplaceStagedByFile(e.target.checked)} />Replace staged rows for this file</label>
          <Button onClick={stageCsv} disabled={!file || loading}>{loading ? "Working…" : "Stage CSV"}</Button>
          <Button variant="outline" onClick={refreshDryRun} disabled={loading}>Refresh Dry-Run</Button>
        </div>
      </div>

      <div className="rounded border p-4">
        <h3 className="font-semibold mb-2">Key Confirmation</h3>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={keyConfirmed} onChange={(e) => setKeyConfirmed(e.target.checked)} />
          I confirm <code>pk_catalog_id</code> is the primary key for rows in this file.
        </label>
      </div>

      <div className="rounded border p-4">
        <h3 className="font-semibold mb-2">Dry-Run Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <Stat label="Catalog rows" value={summary?.catalog_rows} />
          <Stat label="Dupe pk" value={summary?.catalog_dupe_pk} warn />
          <Stat label="Missing required" value={summary?.catalog_missing_required} warn />
          <Stat label="Type warnings" value={summary?.catalog_type_warnings} warn />
        </div>
        {mergePreview && (
          

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mt-3">
            <Stat label={`Will insert${updatesOnly ? " (ignored)" : ""}`} value={mergePreview?.will_insert ?? 0} />
            <Stat label="Will update" value={mergePreview?.will_update ?? 0} />
            <Stat label="Updates with changes" value={mergePreview?.will_update_changed_only ?? 0} />
            <Stat label="Total staged" value={mergePreview?.total_staged ?? 0} />
          </div>
        )}
      </div>

      {csvHeaders.length > 0 && (
        <FieldMapper
          csvHeaders={csvHeaders}
          sampleRows={sampleRows}
          existingColumns={targetColumns}
          onPlanChange={setPlan}
        />
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <label className="flex items-center gap-2 text-sm mr-2">
          <input type="checkbox" checked={updatesOnly} onChange={e=>setUpdatesOnly(e.target.checked)} />
          Updates only (ignore new rows)
        </label>
        <Button onClick={commit} disabled={commitDisabled}>Commit Import</Button>
        <Button variant="outline" onClick={clearStaging} disabled={loading}>Clear Staging</Button>
        <Button variant="outline" onClick={runGroundtruth} disabled={loading || (csvHeaders.length === 0)}>Run Groundtruth</Button>
        <Button variant="outline" onClick={saveAdminVisibility} disabled={savingVis || !plan}>Save Admin Visibility</Button>
        <Button variant="outline" onClick={() => setShowDdl(v => !v)} disabled={!ddlText}>{showDdl ? "Hide DDL" : "Show DDL"}</Button>
        <Button variant="outline" onClick={() => setShowComputed(v => !v)} disabled={!computedText}>{showComputed ? "Hide Computed View" : "Show Computed View"}</Button>
      </div>

      {showDdl && (
        <div className="rounded border p-4">
          <h3 className="font-semibold mb-2">DDL Preview</h3>
          <p className="text-xs text-muted-foreground mb-2">Run these in the SQL editor, then <b>Clear Staging</b> and re-stage.</p>
          <div className="flex gap-2 mb-2">
            <Button variant="outline" onClick={() => copyText(ddlText, "DDL")}>Copy</Button>
            <Button variant="outline" onClick={() => downloadText(ddlText, "catalog_ddl_preview.sql")}>Download</Button>
          </div>
          <pre className="whitespace-pre-wrap text-xs bg-gray-50 p-3 rounded border">{ddlText || "No DDL to show."}</pre>
        </div>
      )}

      {showComputed && (
        <div className="rounded border p-4">
          <h3 className="font-semibold mb-2">Computed View Preview</h3>
          <p className="text-xs text-muted-foreground mb-2">
            Paste this SQL into the Supabase SQL editor to create/update the computed view. You can edit formulas before running.
          </p>
          <div className="flex gap-2 mb-2">
            <Button variant="outline" onClick={() => copyText(computedText, "computed view")}>Copy</Button>
            <Button variant="outline" onClick={() => downloadText(computedText, "catalog_computed_view.sql")}>Download</Button>
          </div>
          <pre className="whitespace-pre-wrap text-xs bg-gray-50 p-3 rounded border">{computedText || "No computed SQL to show."}</pre>
        </div>
      )}

      {(gtRows.length > 0) && (
        <div className="rounded border p-4">
          <h3 className="font-semibold mb-2">Groundtruth Results</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-2 py-1 border-b">Field</th>
                  <th className="text-left px-2 py-1 border-b">Formula</th>
                  <th className="text-right px-2 py-1 border-b">Total</th>
                  <th className="text-right px-2 py-1 border-b">Matches</th>
                  <th className="text-right px-2 py-1 border-b">Mismatches</th>
                  <th className="text-right px-2 py-1 border-b">Null in CSV</th>
                  <th className="text-left px-2 py-1 border-b">Dependencies</th>
                </tr>
              </thead>
              <tbody>
                {gtRows.map((r, i) => (
                  <tr key={i} className="odd:bg-white even:bg-gray-50">
                    <td className="px-2 py-1 border-b">{r.field}</td>
                    <td className="px-2 py-1 border-b font-mono text-xs">{r.formula}</td>
                    <td className="px-2 py-1 border-b text-right">{r.total_rows}</td>
                    <td className={`px-2 py-1 border-b text-right ${r.mismatches ? '' : 'text-green-700'}`}>{r.matches}</td>
                    <td className={`px-2 py-1 border-b text-right ${r.mismatches ? 'text-amber-700 font-semibold' : ''}`}>{r.mismatches}</td>
                    <td className="px-2 py-1 border-b text-right">{r.null_in_csv}</td>
                    <td className="px-2 py-1 border-b">{r.missing_dependencies ? "missing deps" : "ok"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(dupeRows.length > 0 || warnRows.length > 0) && (
        <div className="space-y-6">
          {dupeRows.length > 0 && <TableBlock title="Duplicate PK (sample)" rows={dupeRows} />}
          {warnRows.length > 0 && <TableBlock title="Warnings (sample)" rows={warnRows} />}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: any; warn?: boolean }) {
  return (
    <div className="bg-gray-50 rounded p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={warn && value ? "font-semibold text-amber-600" : "font-semibold"}>{value ?? 0}</div>
    </div>
  );
}

function TableBlock({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div className="rounded border p-4">
      <h3 className="font-semibold mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              {Object.keys(rows[0]).map((h) => (
                <th key={h} className="text-left px-2 py-1 border-b">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                {Object.values(r).map((v, j) => (
                  <td key={j} className="px-2 py-1 border-b">{String(v ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
