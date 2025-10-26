import React, { useEffect, useMemo, useState } from "react";
import { diceCoefficient } from "@/utils/stringSimilarity";
import { Button } from "@/components/ui/button";

type MappingAction = "map_existing" | "create_new" | "ignore";

export type FieldPlan = {
  csvHeader: string;
  action: MappingAction;
  target?: string;
  inferredType?: string;
  note?: string;
  suggested?: string;
  similarity?: number;
};

export type MappingPlan = {
  table: "catalog";
  mappings: FieldPlan[];
  ddl: string[];
};

function inferType(values: any[]): string {
  const sample = values.filter(v => v !== null && v !== undefined && String(v).trim() !== "").slice(0, 200);
  if (sample.length === 0) return "text";
  const isBool = sample.every(v => /^true|false|t|f|yes|no|0|1$/i.test(String(v)));
  if (isBool) return "boolean";
  const isInt = sample.every(v => /^-?\d+$/.test(String(v)));
  if (isInt) return "integer";
  const isNum = sample.every(v => /^-?\d+(\.\d+)?$/.test(String(v)));
  if (isNum) return "numeric";
  const isDate = sample.every(v =>
    /^\d{4}-\d{2}-\d{2}$/.test(String(v)) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(String(v))
  );
  if (isDate) return "date";
  return "text";
}

function sanitizeAsColumn(header: string): string {
  let h = header.toLowerCase().trim();
  h = h.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "_");
  h = h.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (/^\d/.test(h)) h = `col_${h}`;
  return h;
}

export default function FieldMapper({
  csvHeaders,
  sampleRows,
  existingColumns,
  defaultNoUpdate = new Set<string>(["species", "name"]),
  onPlanChange,
}: {
  csvHeaders: string[];
  sampleRows: any[];
  existingColumns: string[];
  defaultNoUpdate?: Set<string>;
  onPlanChange: (plan: MappingPlan) => void;
}) {
  const [mappings, setMappings] = useState<FieldPlan[]>([]);

  const existingSet = useMemo(() => new Set(existingColumns.map(c => c.toLowerCase())), [existingColumns]);

  useEffect(() => {
    const initial: FieldPlan[] = csvHeaders.map((h) => {
      const lc = h.toLowerCase();
      let action: MappingAction = "create_new";
      let target = sanitizeAsColumn(h);
      let note: string | undefined;
      let suggested: string | undefined;
      let similarity: number | undefined;

      if (existingSet.has(lc)) {
        action = defaultNoUpdate.has(lc) ? "ignore" : "map_existing";
        target = lc;
        note = defaultNoUpdate.has(lc) ? "present (no update by default)" : "present";
      } else {
        let best: { col: string; sim: number } | null = null;
        for (const col of existingSet) {
          const sim = diceCoefficient(h, col);
          if (!best || sim > best.sim) best = { col, sim };
        }
        if (best && best.sim >= 0.84) {
          action = "map_existing";
          target = best.col;
          suggested = best.col;
          similarity = best.sim;
          note = "potential match";
        }
      }

      if (lc === "pk_catalog_id") {
        action = "ignore";
        target = lc;
        note = "primary key (match only)";
      }

      if (lc === "days_since_last_sighitng" && existingSet.has("days_since_last_sighting")) {
        action = "map_existing";
        target = "days_since_last_sighting";
        note = "mapped typo → days_since_last_sighting";
      }

      return { csvHeader: h, action, target, note, suggested, similarity };
    });

    setMappings(initial);
  }, [csvHeaders, existingSet, defaultNoUpdate]);

  const typedMappings = useMemo(() => {
    const valuesByHeader: Record<string, any[]> = {};
    for (const h of csvHeaders) valuesByHeader[h] = [];
    for (const row of sampleRows || []) for (const h of csvHeaders) valuesByHeader[h].push(row[h] ?? row[h.toLowerCase()]);
    return mappings.map((m) => ({
      ...m,
      inferredType: m.action === "create_new" ? inferType(valuesByHeader[m.csvHeader] || []) : undefined,
    }));
  }, [mappings, csvHeaders, sampleRows]);

  const ddlPreview = useMemo(() => {
    const stmts: string[] = [];
    for (const m of typedMappings) {
      if (m.action === "create_new" && m.target && m.inferredType) {
        const col = sanitizeAsColumn(m.target);
        stmts.push(`alter table public.catalog add column if not exists ${col} ${m.inferredType};`);
        stmts.push(`alter table public.stg_catalog add column if not exists ${col} ${m.inferredType};`);
      }
    }
    return stmts;
  }, [typedMappings]);

  useEffect(() => {
    onPlanChange({ table: "catalog", mappings: typedMappings, ddl: ddlPreview });
  }, [typedMappings, ddlPreview, onPlanChange]);

  function updateAction(idx: number, action: MappingAction) {
    setMappings(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], action };
      return next;
    });
  }

  function updateTarget(idx: number, target: string) {
    setMappings(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], target: target.toLowerCase() };
      return next;
    });
  }

  function copyDDL() {
    const text = ddlPreview.join("\n");
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="rounded border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Field Mapper</h3>
        <Button variant="outline" onClick={copyDDL} disabled={ddlPreview.length === 0}>Copy DDL Preview</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-2 py-1 border-b">CSV Header</th>
              <th className="text-left px-2 py-1 border-b">Action</th>
              <th className="text-left px-2 py-1 border-b">Target Column</th>
              <th className="text-left px-2 py-1 border-b">Type</th>
              <th className="text-left px-2 py-1 border-b">Notes</th>
            </tr>
          </thead>
          <tbody>
            {typedMappings.map((m, i) => (
              <tr key={m.csvHeader} className="odd:bg-white even:bg-gray-50">
                <td className="px-2 py-1 border-b">{m.csvHeader}</td>
                <td className="px-2 py-1 border-b">
                  <div className="flex gap-2">
                    <label className="flex items-center gap-1">
                      <input type="radio" name={`act-${i}`} checked={m.action === "map_existing"} onChange={() => updateAction(i, "map_existing")} />
                      Map existing
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" name={`act-${i}`} checked={m.action === "create_new"} onChange={() => updateAction(i, "create_new")} />
                      Create new
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" name={`act-${i}`} checked={m.action === "ignore"} onChange={() => updateAction(i, "ignore")} />
                      Ignore
                    </label>
                  </div>
                </td>
                <td className="px-2 py-1 border-b">
                  {m.action === "map_existing" ? (
                    <input
                      className="border rounded px-2 py-1 w-56"
                      value={(m.target || m.suggested || "").toLowerCase()}
                      onChange={(e) => updateTarget(i, e.target.value)}
                      list="existing-cols"
                    />
                  ) : m.action === "create_new" ? (
                    <input
                      className="border rounded px-2 py-1 w-56"
                      value={m.target || ""}
                      onChange={(e) => updateTarget(i, e.target.value)}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-2 py-1 border-b">{m.inferredType || "—"}</td>
                <td className="px-2 py-1 border-b">
                  {m.note || (m.suggested ? `suggested: ${m.suggested} (${(m.similarity || 0).toFixed(2)})` : "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <datalist id="existing-cols">
        {existingColumns.map(c => <option key={c} value={c.toLowerCase()} />)}
      </datalist>

      {ddlPreview.length > 0 && (
        <div className="mt-3 text-xs text-muted-foreground">
          {ddlPreview.length} DDL statements prepared. Copy and run them in SQL editor, then click <b>Refresh Dry‑Run</b> before committing.
        </div>
      )}
    </div>
  );
}
