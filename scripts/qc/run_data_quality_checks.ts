import fs from "fs";
import path from "path";
import {
  DomainResult,
  Finding,
  QcContext,
  ensureOutputDir,
  getSupabaseClient,
  augmentSchemaFromSupabase,
  loadSchemaFromSql,
  summarizeFindings,
  writeCsv,
  writeDomainResult,
} from "./qc_common";
import { checkBiopsies } from "./check_biopsies";
import { checkCatalog } from "./check_catalog";
import { checkMantas } from "./check_mantas";
import { checkPhotoStorageExports } from "./check_photo_storage_exports";
import { checkPhotos } from "./check_photos";
import { checkSightings } from "./check_sightings";
import { checkSizes } from "./check_sizes";

function getFlag(name: string, def?: string) {
  const ix = process.argv.findIndex((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (ix === -1) return def;
  const arg = process.argv[ix];
  if (arg.includes("=")) return arg.split("=").slice(1).join("=");
  const next = process.argv[ix + 1];
  if (!next || next.startsWith("--")) return def;
  return next;
}

function toFailureRows(findings: Finding[]) {
  return findings.map((finding) => ({
    domain: finding.domain,
    severity: finding.severity,
    check_name: finding.check_name,
    table_name: finding.table_name ?? "",
    primary_key: finding.primary_key ?? "",
    related_photo_id: finding.related_photo_id ?? "",
    related_catalog_id: finding.related_catalog_id ?? "",
    related_manta_id: finding.related_manta_id ?? "",
    related_sighting_id: finding.related_sighting_id ?? "",
    message: finding.message,
    suggested_action: finding.suggested_action ?? "",
  }));
}

function publicQcDir(repoRoot: string) {
  return path.join(repoRoot, "public", "qc");
}

function mirrorBrowserSnapshot(repoRoot: string, results: DomainResult[], summary: Record<string, unknown>) {
  const dir = publicQcDir(repoRoot);
  ensureOutputDir(dir);
  fs.writeFileSync(path.join(dir, "qc_summary.json"), JSON.stringify(summary, null, 2));

  for (const result of results) {
    fs.writeFileSync(path.join(dir, `${result.domain}.json`), JSON.stringify(result, null, 2));
  }
}

async function main() {
  const repoRoot = process.cwd();
  const outputDir = path.resolve(repoRoot, getFlag("out", "scripts/qc/output")!);
  const checkStorage = (getFlag("check-storage", "false") ?? "false").toLowerCase() === "true";
  ensureOutputDir(outputDir);

  const supabase = getSupabaseClient();
  const schema = await augmentSchemaFromSupabase(
    loadSchemaFromSql(repoRoot),
    supabase,
    ["catalog", "sightings", "mantas", "photos", "manta_sizes", "sizes", "biopsies"],
  );

  const ctx: QcContext = {
    repoRoot,
    outputDir,
    schema,
    supabase,
    checkStorage,
  };

  const checks: Array<() => Promise<DomainResult>> = [
    () => checkCatalog(ctx),
    () => checkSightings(ctx),
    () => checkMantas(ctx),
    () => checkPhotos(ctx),
    () => checkSizes(ctx),
    () => checkBiopsies(ctx),
    () => checkPhotoStorageExports(ctx),
  ];

  const results: DomainResult[] = [];
  for (const check of checks) {
    const result = await check();
    writeDomainResult(ctx, result);
    results.push(result);
    const counts = summarizeFindings(result.findings);
    console.log(`${result.domain}: ${counts.errors} errors, ${counts.warnings} warnings, ${counts.info} info`);
  }

  const allFindings = results.flatMap((result) => result.findings);
  const summary = {
    checked_at: new Date().toISOString(),
    read_only: true,
    storage_checks_enabled: checkStorage,
    database_available: Boolean(ctx.supabase),
    domains: results.map((result) => ({
      domain: result.domain,
      summary: result.summary,
      findings: summarizeFindings(result.findings),
      output_json: path.relative(repoRoot, path.join(outputDir, `${result.domain}.json`)),
      output_csv: path.relative(repoRoot, path.join(outputDir, `${result.domain}_findings.csv`)),
    })),
    totals: summarizeFindings(allFindings),
    rerun_commands: {
      local: "npm run qc:data",
      with_storage_probe: "npm run qc:data -- --check-storage=true",
      schema: "npm run qc:schema",
    },
  };

  fs.writeFileSync(path.join(outputDir, "qc_summary.json"), JSON.stringify(summary, null, 2));
  writeCsv(path.join(outputDir, "qc_failures.csv"), toFailureRows(allFindings));
  mirrorBrowserSnapshot(repoRoot, results, summary);

  console.log(`Wrote ${path.relative(repoRoot, path.join(outputDir, "qc_summary.json"))}`);
  console.log(`Wrote ${path.relative(repoRoot, path.join(outputDir, "qc_failures.csv"))}`);
  console.log(`Wrote ${path.relative(repoRoot, path.join(publicQcDir(repoRoot), "qc_summary.json"))}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
