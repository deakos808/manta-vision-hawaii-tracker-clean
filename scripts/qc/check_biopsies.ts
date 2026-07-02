import { QcContext, DomainResult, Finding, addMissingTableFinding, addNoDatabaseFinding, countDuplicateValues, hasColumn, hasTable, indexBy, loadRows } from "./qc_common";

export async function checkBiopsies(ctx: QcContext): Promise<DomainResult> {
  const domain = "biopsies";
  const checked_at = new Date().toISOString();
  const findings: Finding[] = [];
  if (!hasTable(ctx, "biopsies")) findings.push(addMissingTableFinding(domain, "biopsies"));
  if (!ctx.supabase) findings.push(addNoDatabaseFinding(domain));
  if (!hasTable(ctx, "biopsies") || !ctx.supabase) return { domain, checked_at, summary: { rows_checked: 0 }, findings };

  const biopsies = await loadRows(ctx, "biopsies");
  const mantas = hasTable(ctx, "mantas") ? indexBy(await loadRows(ctx, "mantas", ["pk_manta_id"]), "pk_manta_id") : new Map();
  for (const row of biopsies) {
    if (row.pk_biopsy_id == null || row.pk_biopsy_id === "") findings.push({ domain, severity: "error", check_name: "biopsy_primary_key_present", table_name: "biopsies", message: "Biopsy row is missing pk_biopsy_id." });
    const sampleId = row.sample_id ?? row.raw_sample_id ?? row.lab_id ?? row.ref_biopsy_id;
    if (!sampleId) findings.push({ domain, severity: "warning", check_name: "biopsy_sample_id_present", table_name: "biopsies", primary_key: row.pk_biopsy_id as string | number | null, related_manta_id: row.fk_manta_id as string | number | null, message: `Biopsy ${row.pk_biopsy_id} has no sample identifier.`, suggested_action: "Review sample_id, raw_sample_id, lab_id, or ref_biopsy_id fields for the intended identifier." });
    if (row.fk_manta_id != null && mantas.size > 0 && !mantas.has(String(row.fk_manta_id))) findings.push({ domain, severity: "error", check_name: "biopsy_manta_fk_exists", table_name: "biopsies", primary_key: row.pk_biopsy_id as string | number | null, related_manta_id: row.fk_manta_id as string | number | null, message: `Biopsy ${row.pk_biopsy_id} links to missing manta ${row.fk_manta_id}.` });
  }
  for (const column of ["pk_biopsy_id", "sample_id", "raw_sample_id", "lab_id", "ref_biopsy_id"].filter((name) => hasColumn(ctx, "biopsies", name))) {
    for (const [id, count] of countDuplicateValues(biopsies, column)) findings.push({ domain, severity: column === "pk_biopsy_id" ? "error" : "warning", check_name: `biopsy_${column}_unique`, table_name: "biopsies", primary_key: id, message: `${column} ${id} appears ${count} times.` });
  }
  return { domain, checked_at, summary: { biopsy_rows: biopsies.length }, findings };
}
