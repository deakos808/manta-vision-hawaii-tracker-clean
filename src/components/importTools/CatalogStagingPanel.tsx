import React, { useMemo, useRef, useState } from "react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [dupeRows, setDupeRows] = useState<any[]>([]);
  const [warnRows, setWarnRows] = useState<any[]>([]);
  const [gtRows, setGtRows] = useState<GtRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [replaceStagedByFile, setReplaceStagedByFile] = useState(true);

  const hasData = useMemo(
    () => (summary?.catalog_rows ?? 0) > 0 || dupeRows.length > 0 || warnRows.length > 0 || gtRows.length > 0,
    [summary, dupeRows, warnRows, gtRows]
  );

  async function stageCsv() {
    if (!file) { toast.error("Choose a CSV file first"); return; }
    setLoading(true);
    try {
      // Parse CSV
      const parsed = await new Promise<{ rows: any[]; headers: string[] }>((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => (h ?? "").toString().replace(/^\uFEFF/, "").trim(),
          transform: (v) => (typeof v === "string" ? v.trim() : v),
          complete: (res) => {
            const rows = (res.data as any[]) || [];
            const headers = (res.meta?.fields as string[]) ?? (rows.length ? Object.keys(rows[0]) : []);
            resolve({ rows, headers });
          },
          error: (err) => reject(err),
        });
      });

      // Fetch staging columns and build allowed set (lowercase)
      const { data: stgCols, error: colErr } = await supabase
        .from("v_db_columns")
        .select("column_name")
        .eq("table_schema", "public")
        .eq("table_name", "stg_catalog")
        .order("ordinal_position", { ascending: true });

      if (colErr) throw colErr;
      const allowed = new Set<string>((stgCols || []).map((r: any) => String(r.column_name).toLowerCase()));
      allowed.add("src_file");
      allowed.add("pk_catalog_id");

      // Optional: clear previously staged rows for same file
      if (replaceStagedByFile && file?.name) {
        const { error: delErr } = await supabase.from("stg_catalog").delete().eq("src_file", file.name);
        if (delErr) console.warn("Could not clear previous staged rows for file:", delErr.message);
      }

      // Normalize a common typo alias at insert-time
      const normalizeKey = (k: string) => {
        const lc = k.toLowerCase().trim();
        if (lc === "days_since_last_sighitng") return "days_since_last_sighting";
        return lc;
      };

      // Prepare filtered rows
      const stagedRows = parsed.rows.map((r) => {
        const out: Record<string, any> = { src_file: file.name };
        for (const k of Object.keys(r || {})) {
          const key = normalizeKey(k);
          if (allowed.has(key)) out[key] = r[k];
        }
        // ensure pk_catalog_id is captured if CSV used different casing
        if (out["pk_catalog_id"] == null) {
          const alt = Object.keys(r).find(x => x && x.toLowerCase() === "pk_catalog_id");
          if (alt) out["pk_catalog_id"] = r[alt as string];
        }
        return out;
      });

      // Batched insert
      let total = 0;
      for (let i = 0; i < stagedRows.length; i += CHUNK_SIZE) {
        const chunk = stagedRows.slice(i, i + CHUNK_SIZE);
        if (!chunk.length) continue;
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
    try {
      const { data: sum, error } = await supabase.from("stg_summary").select("*").single();
      if (error) throw error;
      setSummary(sum as Summary);

      const { data: d } = await supabase.from("stg_v_catalog_dupe_pk").select("*").limit(25);
      setDupeRows(d || []);

      const { data: w } = await supabase.from("stg_v_catalog_type_warnings").select("*").limit(25);
      setWarnRows(w || []);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Dry-Run fetch failed");
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
      setGtRows([]);
      // fully reset file input state
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFile(null);
      toast.success("Staging cleared.");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Clear staging failed");
    } finally {
      setLoading(false);
    }
  }

  async function runGroundtruth() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("fn_imports_groundtruth_catalog", { p_checks: null });
      if (error) throw error;
      setGtRows((data as GtRow[]) || []);
      const bad = (data as GtRow[] | null)?.some(r => r.mismatches > 0 && !r.missing_dependencies);
      if (bad) toast.warning("Groundtruth: some fields differ from CSV (see table).");
      else toast.success("Groundtruth OK: computable fields match or are blank.");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Groundtruth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* File + Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Catalog CSV file</label>
          <Input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <label className="mt-2 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={replaceStagedByFile}
              onChange={(e) => setReplaceStagedByFile(e.target.checked)}
            />
            Replace staged rows for this file
          </label>
        </div>
        <div className="flex gap-2">
          <Button onClick={stageCsv} disabled={!file || loading}>
            {loading ? "Working…" : "Stage CSV"}
          </Button>
          <Button variant="outline" onClick={refreshDryRun} disabled={loading}>
            Refresh Dry-Run
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded border p-4">
        <h3 className="font-semibold mb-2">Dry-Run Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Catalog rows" value={summary?.catalog_rows ?? 0} />
          <Stat label="Dupe pk" value={summary?.catalog_dupe_pk ?? 0} warn />
          <Stat label="Missing required" value={summary?.catalog_missing_required ?? 0} warn />
          <Stat label="Type warnings" value={summary?.catalog_type_warnings ?? 0} warn />
        </div>
      </div>

      {/* Samples */}
      {dupeRows.length > 0 && <TableBlock title="Duplicate PK (sample)" rows={dupeRows} />}
      {warnRows.length > 0 && <TableBlock title="Warnings (sample)" rows={warnRows} />}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={clearStaging} disabled={loading || !hasData}>Clear Staging</Button>
        <Button variant="outline" onClick={runGroundtruth} disabled={loading || !(summary?.catalog_rows ?? 0)}>Run Groundtruth</Button>
      </div>

      {/* Groundtruth */}
      {gtRows.length > 0 && (
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
                    <td className={`px-2 py-1 border-b text-right ${r.mismatches ? "" : "text-green-700"}`}>{r.matches}</td>
                    <td className={`px-2 py-1 border-b text-right ${r.mismatches ? "text-amber-700 font-semibold" : ""}`}>{r.mismatches}</td>
                    <td className="px-2 py-1 border-b text-right">{r.null_in_csv}</td>
                    <td className="px-2 py-1 border-b">{r.missing_dependencies ? "missing deps" : "ok"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
  if (!rows || rows.length === 0) return null;
  const headers = Object.keys(rows[0] || {});
  return (
    <div className="rounded border p-4">
      <h3 className="font-semibold mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              {headers.map((h) => (
                <th key={h} className="text-left px-2 py-1 border-b">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                {headers.map((h) => (
                  <td key={h + i} className="px-2 py-1 border-b">{String((r as any)[h] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
