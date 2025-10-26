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
  existsInTable?: boolean;
  calcHint?: { recommended: boolean; note: string; formula?: string; dependsOn?: string[] };
};

export type MappingPlan = {
  table: "catalog";
  mappings: FieldPlan[];
  ddl: string[];
};

// ---- Calculated column hints for CATALOG only (flag only; does NOT block updates) ----
function calcHintForCatalog(headerLc: string): FieldPlan["calcHint"] | undefined {
  // normalize aliases/typos to catch common variations
  const h = headerLc.replace(/\s+/g, "_");
  // Derived from sightings (date and aggregates)
  const fromSightings = (note: string, formula?: string, dependsOn?: string[]) =>
    ({ recommended: true, note, formula, dependsOn });
  const fromTriggers = (note: string) => ({ recommended: true, note });

  switch (h) {
    case "date_first_sighted":
      return fromSightings(
        "Calculated from earliest sighting date for this catalog individual.",
        "min(s.sighting_date) where s.pk_catalog_id = catalog.pk_catalog_id",
        ["sightings.sighting_date", "sightings.pk_catalog_id"]
      );
    case "date_last_sighted":
      return fromSightings(
        "Calculated from latest sighting date for this catalog individual.",
        "max(s.sighting_date) where s.pk_catalog_id = catalog.pk_catalog_id",
        ["sightings.sighting_date", "sightings.pk_catalog_id"]
      );
    case "days_between_first_last":
    case "days_between_first_last_sighting":
      return fromSightings(
        "Calculated: (last_date - first_date) in days (or years if preferred).",
        "(max(s.sighting_date) - min(s.sighting_date))",
        ["sightings.sighting_date"]
      );
    case "days_since_last_sighting":
    case "days_since_last_sighitng":
      return fromSightings(
        "Calculated: today - last_sighting_date.",
        "(current_date - max(s.sighting_date))",
        ["sightings.sighting_date"]
      );
    case "last_sex":
      return fromSightings(
        "Calculated from most recent sighting's recorded sex.",
        "sex of row with max(s.sighting_date)",
        ["sightings.gender/sex", "sightings.sighting_date"]
      );
    case "last_size":
    case "c_last_size":
      return fromSightings(
        "Calculated from most recent size measurement.",
        "size of row with max(measurement_date or sighting_date)",
        ["sightings.size", "sightings.sighting_date"]
      );
    case "list_years_sighted":
      return fromSightings(
        "Calculated: list of distinct years sighted.",
        "array_agg(distinct extract(year from s.sighting_date))",
        ["sightings.sighting_date"]
      );
    case "total_sightings":
      return fromSightings(
        "Calculated: count of sightings for this catalog individual.",
        "count(*) from sightings grouped by pk_catalog_id",
        ["sightings.pk_catalog_id"]
      );
    case "total_biopsies":
      return fromSightings(
        "Calculated: count of biopsy events linked to this catalog individual.",
        "count(*) from biopsies (or sightings with biopsy flag)",
        ["biopsies.* or sightings.biopsy_flag"]
      );
    case "total_tags":
      return fromSightings(
        "Calculated: count of tag events linked to this catalog individual.",
        "count(*) from tag_events (or sightings with tag flag)",
        ["tag_events.* or sightings.tag_flag"]
      );
    case "count_unique_years_sighted":
      return fromSightings(
        "Calculated: number of distinct years sighted.",
        "count(distinct extract(year from s.sighting_date))",
        ["sightings.sighting_date"]
      );
    case "best_cat_mask_ventral_id":
    case "best_cat_mask_ventral_id_int":
    case "best_catalog_photo_url":
    case "best_catalog_ventral_thumb_url":
    case "best_photo_url":
    case "best_photo_id":
    case "best_dorsal_photo_id":
      return fromTriggers(
        "Maintained by existing triggers/functions; typically not imported directly."
      );
    default:
      return undefined;
  }
}

// ---- Type inference & helpers ----
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

  const existingSet = useMemo(
    () => new Set(existingColumns.map(c => c.toLowerCase())),
    [existingColumns]
  );

  useEffect(() => {
    const initial: FieldPlan[] = csvHeaders.map((h) => {
      const lc = h.toLowerCase();
      let action: MappingAction = "create_new";
      let target = sanitizeAsColumn(h);
      let note: string | undefined;
      let suggested: string | undefined;
      let similarity: number | undefined;
      let existsInTable = existingSet.has(lc);

      if (existsInTable) {
        action = defaultNoUpdate.has(lc) ? "ignore" : "map_existing";
        target = lc;
        note = defaultNoUpdate.has(lc) ? "present (no update by default)" : "present";
      } else {
        // find closest match
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
          existsInTable = true;
          note = "potential match";
        }
      }

      // pk: match-only
      if (lc === "pk_catalog_id") {
        action = "ignore";
        target = lc;
        existsInTable = true;
        note = "primary key (match only)";
      }

      // common typo mapping
      if (lc === "days_since_last_sighitng" && existingSet.has("days_since_last_sighting")) {
        action = "map_existing";
        target = "days_since_last_sighting";
        existsInTable = true;
        note = "mapped typo → days_since_last_sighting";
      }

      // calculated flags
      const calcHint = calcHintForCatalog(lc);

      return {
        csvHeader: h,
        action,
        target,
        note,
        suggested,
        similarity,
        existsInTable,
        calcHint,
      };
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
        <Button variant="outline" onClick={copyDDL} disabled={ddlPreview.length === 0}>
          Copy DDL Preview
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-2 py-1 border-b">CSV Header</th>
              <th className="text-left px-2 py-1 border-b">Action</th>
              <th className="text-left px-2 py-1 border-b">Target Column</th>
              <th className="text-left px-2 py-1 border-b">Exists?</th>
              <th className="text-left px-2 py-1 border-b">Calculated?</th>
              <th className="text-left px-2 py-1 border-b">Type (if new)</th>
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
                <td className="px-2 py-1 border-b">
                  {m.existsInTable ? <span className="text-green-700">✓ exists</span> : <span className="text-amber-700">✗ new</span>}
                </td>
                <td className="px-2 py-1 border-b">
                  {m.calcHint?.recommended ? (
                    <span className="inline-block rounded px-2 py-0.5 text-xs bg-amber-100 text-amber-800">calculated</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-2 py-1 border-b">{m.inferredType || "—"}</td>
                <td className="px-2 py-1 border-b">
                  {m.calcHint?.note
                    ? m.calcHint.formula
                      ? `${m.calcHint.note} · e.g., ${m.calcHint.formula}`
                      : m.calcHint.note
                    : (m.note || (m.suggested ? `suggested: ${m.suggested} (${(m.similarity || 0).toFixed(2)})` : "—"))}
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
