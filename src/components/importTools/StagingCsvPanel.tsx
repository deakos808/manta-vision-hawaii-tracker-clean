import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Summary = {
  catalog_rows?: number;
  catalog_dupe_pk?: number;
  catalog_type_warnings?: number;
  catalog_missing_required?: number;
  mantas_rows?: number;
  mantas_dupe_pk?: number;
  mantas_missing_fk_catalog?: number;
  mantas_missing_fk_sighting?: number;
  photos_rows?: number;
  photos_missing_fk_manta?: number;
};

type TableChoice = "stg_catalog" | "stg_mantas" | "stg_photos";

const CHUNK_SIZE = 1000;

export default function StagingCsvPanel() {
  const [selectedTable, setSelectedTable] = useState<TableChoice>("stg_catalog");
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dupeRows, setDupeRows] = useState<any[]>([]);
  const [warnRows, setWarnRows] = useState<any[]>([]);
  const [mergePreview, setMergePreview] = useState<any | null>(null);
  const [targetColumns, setTargetColumns] = useState<string[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [keyConfirmed, setKeyConfirmed] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [lastSha, setLastSha] = useState<string | null>(null);

  const targetBaseTable = useMemo(() => {
    if (selectedTable === "stg_catalog") return "catalog";
    if (selectedTable === "stg_mantas") return "mantas";
    return "photos";
  }, [selectedTable]);

  const derivedIgnoreSet = useMemo(() => {
    if (selectedTable !== "stg_catalog") return new Set<string>();
    return new Set<string>([
      "date_last_sighted","date_first_sighted",
      "days_between_first_last_sighting","days_since_last_sighitng","days_since_last_sighting",
      "last_sex","c_last_size","last_age_class","last_size",
      "list_unique_locations","list_unique_regions","list_years_sighted",
      "total_biopsies","total_sightings","total_tags","count_unique_years_sighted",
      "unnamed: 18","unnamed:18"
    ]);
  }, [selectedTable]);

  function toLcHeaders(headers: string[]) {
    return headers.map(h => h.trim().toLowerCase());
  }

  async function computeSha256Hex(f: File) {
    const buf = await f.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    const bytes = Array.from(new Uint8Array(hash));
    return bytes.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function loadTargetColumns() {
    const { data, error } = await supabase
      .from("v_db_columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", targetBaseTable)
      .order("ordinal_position", { ascending: true });
    if (error) {
      console.error(error);
      toast.error("Failed to load table columns");
      return;
    }
    setTargetColumns((data || []).map((r: any) => String(r.column_name).toLowerCase()));
  }

  async function stageCsv() {
    if (!file) {
      toast.error("Choose a CSV file first");
      return;
    }
    setLoading(true);
    try {
      const sha = await computeSha256Hex(file);
      setLastSha(sha);

      await loadTargetColumns();

      const parsed = await new Promise<{ rows: any[], headers: string[] }>((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.trim(),
          transform: (v) => (typeof v === "string" ? v.trim() : v),
          complete: (res) => {
            const rows = res.data as Record<string, any>[];
            const headers = res.meta.fields ? res.meta.fields as string[] : Object.keys(rows[0] || {});
            resolve({ rows, headers });
          },
          error: (err) => reject(err),
        });
      });

      const lcHeaders = toLcHeaders(parsed.headers);
      setCsvHeaders(lcHeaders);

      // append src_file and normalize known typos
      const stamped = (parsed.rows || []).map((r) => {
        const copy: Record<string, any> = { src_file: file.name, ...r };
        if (copy["days_since_last_sighitng"] !== undefined && copy["days_since_last_sighting"] === undefined) {
          copy["days_since_last_sighting"] = copy["days_since_last_sighitng"];
        }
        return copy;
      });

      // Insert in small batches to the selected staging table
      for (let i = 0; i < stamped.length; i += CHUNK_SIZE) {
        const chunk = stamped.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from(selectedTable).insert(chunk, { returning: "minimal" });
        if (error) {
          console.error(error);
          throw new Error(`Insert failed at batch ${Math.floor(i / CHUNK_SIZE) + 1}: ${error.message}`);
        }
      }

      toast.success(`Staged ${stamped.length} rows into ${selectedTable}`);
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

    // Load error-view samples
    const dupeView =
      selectedTable === "stg_catalog" ? "stg_v_catalog_dupe_pk" :
      selectedTable === "stg_mantas" ? "stg_v_mantas_dupe_pk" : null;

    const warnView =
      selectedTable === "stg_catalog" ? "stg_v_catalog_type_warnings" :
      selectedTable === "stg_mantas" ? "stg_v_mantas_missing_fk_catalog" :
      "stg_v_photos_missing_fk_manta";

    if (dupeView) {
      const { data } = await supabase.from(dupeView).select("*").limit(25);
      setDupeRows(data || []);
    } else {
      setDupeRows([]);
    }

    if (warnView) {
      const { data } = await supabase.from(warnView).select("*").limit(25);
      setWarnRows(data || []);
    } else {
      setWarnRows([]);
    }

    if (selectedTable === "stg_catalog") {
      const { data: mp } = await supabase.from("stg_merge_preview_catalog").select("*").maybeSingle();
      setMergePreview(mp || null);
    } else {
      setMergePreview(null);
    }
  }

  function classifyFields() {
    const lcTarget = new Set(targetColumns);
    const lcCsv = new Set(csvHeaders);
    const present = [...lcCsv].filter(h => lcTarget.has(h) && !derivedIgnoreSet.has(h));
    const derived = [...lcCsv].filter(h => derivedIgnoreSet.has(h));
    const newFields = [...lcCsv].filter(h => !lcTarget.has(h) && !derivedIgnoreSet.has(h));
    return { present, derived, newFields };
  }

  async function commit() {
    setLoading(true);
    try {
      if (selectedTable === "stg_catalog") {
        const { data, error } = await supabase.rpc("fn_imports_commit_catalog", {
          p_src_file: file?.name || null,
          p_file_sha256: lastSha || null,
        });
        if (error) throw error;
        toast.success(`Catalog committed: +${data.inserted_catalog} new, ~${data.updated_catalog} updated`);
      } else {
        const { data, error } = await supabase.rpc("fn_imports_commit", {
          p_src_file: file?.name || null,
          p_file_sha256: lastSha || null,
        });
        if (error) throw error;
        toast.success(`Committed: Mantas +${data.inserted_mantas}/~${data.updated_mantas}, Photos +${data.inserted_photos}/~${data.updated_photos}`);
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
      toast.success("Staging tables truncated");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Clear staging failed");
    } finally {
      setLoading(false);
    }
  }

  const { present, derived, newFields } = classifyFields();

  const commitDisabled = (() => {
    if (!summary) return true;
    if (selectedTable === "stg_catalog") {
      const errs = (summary.catalog_dupe_pk || 0) + (summary.catalog_missing_required || 0);
      return loading || !keyConfirmed || errs > 0;
    }
    const errs = (summary.mantas_dupe_pk || 0) + (summary.mantas_missing_fk_catalog || 0) + (summary.mantas_missing_fk_sighting || 0) + (summary.photos_missing_fk_manta || 0);
    return loading || errs > 0;
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-sm font-medium mb-1">Target staging table</label>
          <select
            className="w-full border rounded px-2 py-1"
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value as TableChoice)}
          >
            <option value="stg_catalog">stg_catalog</option>
            <option value="stg_mantas">stg_mantas</option>
            <option value="stg_photos">stg_photos</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">CSV file</label>
          <Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        <div className="flex gap-2">
          <Button onClick={stageCsv} disabled={!file || loading}>{loading ? "Working…" : "Stage CSV"}</Button>
          <Button variant="outline" onClick={refreshDryRun} disabled={loading}>Refresh Dry-Run</Button>
        </div>
      </div>

      <div className="rounded border p-4">
        <h3 className="font-semibold mb-2">Field Classification (CSV → {targetBaseTable})</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Will import (existing columns)</div>
            <ul className="list-disc pl-5">{present.map(h => <li key={h}>{h}</li>)}</ul>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Derived/ignored (computed from sightings)</div>
            <ul className="list-disc pl-5">{derived.map(h => <li key={h}>{h}</li>)}</ul>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Not in table (no DDL is run)</div>
            <ul className="list-disc pl-5">{newFields.map(h => <li key={h}>{h}</li>)}</ul>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">We will <b>not</b> create new columns automatically and will never overwrite derived data. Commit affects only allowed columns (e.g., catalog: pk_catalog_id, species, name).</p>
      </div>

      {selectedTable === "stg_catalog" && (
        <div className="rounded border p-4">
          <h3 className="font-semibold mb-2">Key Confirmation</h3>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={keyConfirmed} onChange={(e) => setKeyConfirmed(e.target.checked)} />
            I confirm <code>pk_catalog_id</code> is the primary key for rows in this file.
          </label>
        </div>
      )}

      {summary && (
        <div className="rounded border p-4 space-y-3">
          <h3 className="font-semibold">Dry-Run Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            {selectedTable === "stg_catalog" && (
              <>
                <Stat label="Catalog rows" value={summary.catalog_rows} />
                <Stat label="Dupe pk" value={summary.catalog_dupe_pk} warn />
                <Stat label="Missing required" value={summary.catalog_missing_required} warn />
                <Stat label="Type warnings" value={summary.catalog_type_warnings} warn />
              </>
            )}
            {selectedTable !== "stg_catalog" && (
              <>
                <Stat label="Mantas rows" value={summary.mantas_rows} />
                <Stat label="Mantas dupe pk" value={summary.mantas_dupe_pk} warn />
                <Stat label="Missing fk catalog" value={summary.mantas_missing_fk_catalog} warn />
                <Stat label="Missing fk sighting" value={summary.mantas_missing_fk_sighting} warn />
                <Stat label="Photos rows" value={summary.photos_rows} />
                <Stat label="Photos missing fk manta" value={summary.photos_missing_fk_manta} warn />
              </>
            )}
          </div>

          {mergePreview && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Stat label="Will insert" value={mergePreview.will_insert} />
              <Stat label="Will update" value={mergePreview.will_update} />
              <Stat label="Updates with changes" value={mergePreview.will_update_changed_only} />
              <Stat label="Total staged" value={mergePreview.total_staged} />
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={commit} disabled={commitDisabled}>Commit Import</Button>
            <Button variant="outline" onClick={clearStaging} disabled={loading}>Clear Staging</Button>
          </div>
        </div>
      )}

      {(dupeRows.length > 0 || warnRows.length > 0) && (
        <div className="space-y-6">
          {dupeRows.length > 0 && <TableBlock title="Duplicate PK (sample)" rows={dupeRows} />}
          {warnRows.length > 0 && <TableBlock title="Warnings / Missing FK (sample)" rows={warnRows} />}
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
    <div>
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
