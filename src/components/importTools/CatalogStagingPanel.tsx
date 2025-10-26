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

const CHUNK_SIZE = 1000;

export default function CatalogStagingPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dupeRows, setDupeRows] = useState<any[]>([]);
  const [warnRows, setWarnRows] = useState<any[]>([]);
  const [mergePreview, setMergePreview] = useState<any | null>(null);
  const [targetColumns, setTargetColumns] = useState<string[]>([]);
  const [stagingColumns, setStagingColumns] = useState<string[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [keyConfirmed, setKeyConfirmed] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [lastSha, setLastSha] = useState<string | null>(null);
  const [plan, setPlan] = useState<MappingPlan | null>(null);

  async function computeSha256Hex(f: File) {
    const buf = await f.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    const bytes = Array.from(new Uint8Array(hash));
    return bytes.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function loadColumns() {
    const { data: baseCols } = await supabase
      .from("v_db_columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", "catalog")
      .order("ordinal_position", { ascending: true });
    setTargetColumns((baseCols || []).map((r: any) => String(r.column_name).toLowerCase()));

    const { data: stgCols } = await supabase
      .from("v_db_columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", "stg_catalog")
      .order("ordinal_position", { ascending: true });
    setStagingColumns((stgCols || []).map((r: any) => String(r.column_name).toLowerCase()));
  }

  async function stageCsv() {
    if (!file) {
      toast.error("Choose a CSV file first");
      return;
    }
    setLoading(true);
    try {
      await loadColumns();
      const sha = await computeSha256Hex(file);
      setLastSha(sha);

      const parsed = await new Promise<{ rows: any[]; headers: string[] }>((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.trim(),
          transform: (v) => (typeof v === "string" ? v.trim() : v),
          complete: (res) => {
            const rows = res.data as Record<string, any>[];
            const headers = res.meta.fields ? (res.meta.fields as string[]) : Object.keys(rows[0] || {});
            resolve({ rows, headers });
          },
          error: (err) => reject(err),
        });
      });

      const lcHeaders = parsed.headers.map(h => h.toLowerCase());
      setCsvHeaders(lcHeaders);
      setSampleRows(parsed.rows.slice(0, 200));

      const stagedRows = parsed.rows.map((r) => {
        const copy: Record<string, any> = { src_file: file.name, ...r };
        if (copy["days_since_last_sighitng"] !== undefined && copy["days_since_last_sighting"] === undefined) {
          copy["days_since_last_sighting"] = copy["days_since_last_sighitng"];
        }
        return copy;
      });

      const allowed = new Set([...stagingColumns, "src_file"]);
      const filtered = stagedRows.map((row) => {
        const o: Record<string, any> = {};
        for (const k of Object.keys(row)) {
          const lc = k.toLowerCase();
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
    await loadColumns();
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

  function presentCreatePending(plan: MappingPlan | null) {
    if (!plan) return { pendingCreates: 0, updateCols: [] as string[] };
    const mappedExisting = plan.mappings
      .filter(m => m.action === "map_existing" && m.target)
      .map(m => String(m.target).toLowerCase());
    const pendingCreates = plan.mappings.filter(m => m.action === "create_new").length;
    const updateCols = Array.from(new Set(mappedExisting.filter(c => c !== "pk_catalog_id")));
    return { pendingCreates, updateCols };
  }

  async function commit() {
    if (!plan) return;
    const { pendingCreates, updateCols } = presentCreatePending(plan);
    if (pendingCreates > 0) {
      toast.error("Apply DDL for new columns, refresh, then commit.");
      return;
    }
    if (updateCols.length === 0) {
      toast.error("Select at least one column to update.");
      return;
    }
    if (!keyConfirmed) {
      toast.error("Confirm pk_catalog_id as primary key.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("fn_imports_commit_catalog_cols", {
        p_columns: updateCols,
        p_src_file: file?.name || null,
        p_file_sha256: lastSha || null,
      });
      if (error) throw error;
      toast.success(`Catalog committed: +${data.inserted_catalog} new, ~${data.updated_catalog} updated`);
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
      toast.success("Staging tables truncated");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Clear staging failed");
    } finally {
      setLoading(false);
    }
  }

  const commitDisabled = useMemo(() => {
    if (!summary) return true;
    const errs = (summary.catalog_dupe_pk || 0) + (summary.catalog_missing_required || 0);
    const { pendingCreates, updateCols } = presentCreatePending(plan);
    return loading || !keyConfirmed || errs > 0 || pendingCreates > 0 || updateCols.length === 0;
  }, [summary, plan, keyConfirmed, loading]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Catalog CSV file</label>
          <Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        <div className="flex gap-2">
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
            <Stat label="Will insert" value={mergePreview.will_insert} />
            <Stat label="Will update" value={mergePreview.will_update} />
            <Stat label="Updates with changes" value={mergePreview.will_update_changed_only} />
            <Stat label="Total staged" value={mergePreview.total_staged} />
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

      <div className="flex gap-2">
        <Button onClick={commit} disabled={commitDisabled}>Commit Import</Button>
        <Button variant="outline" onClick={clearStaging} disabled={loading}>Clear Staging</Button>
      </div>

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
