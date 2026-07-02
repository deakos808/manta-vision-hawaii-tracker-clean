import fs from "fs";
import path from "path";
import { augmentSchemaFromSupabase, ensureOutputDir, getSupabaseClient, loadSchemaFromSql } from "./qc_common";

async function main() {
  const repoRoot = process.cwd();
  const outputDir = path.join(repoRoot, "scripts/qc/output");
  ensureOutputDir(outputDir);

  const localSchema = loadSchemaFromSql(repoRoot);
  const supabase = getSupabaseClient();
  const tables = ["catalog", "sightings", "mantas", "photos", "manta_sizes", "sizes", "biopsies"];
  const augmentedSchema = await augmentSchemaFromSupabase(new Map(localSchema), supabase, tables);
  const probes = [];

  for (const table of tables) {
    if (!supabase) {
      probes.push({ table, status: "skipped", reason: "No Supabase credentials found." });
      continue;
    }
    const { data, error } = await supabase.from(table).select("*").limit(1);
    probes.push({
      table,
      status: error ? "error" : "ok",
      error: error?.message ?? null,
      sample_columns: data?.[0] ? Object.keys(data[0]) : [],
    });
  }

  const report = {
    inspected_at: new Date().toISOString(),
    source: "cloud_schema.sql plus read-only Supabase select probes",
    local_schema: Object.fromEntries(localSchema.entries()),
    augmented_schema: Object.fromEntries(augmentedSchema.entries()),
    supabase_probe: probes,
  };

  fs.writeFileSync(path.join(outputDir, "schema_inspection.json"), JSON.stringify(report, null, 2));
  console.log(`Wrote ${path.relative(repoRoot, path.join(outputDir, "schema_inspection.json"))}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
