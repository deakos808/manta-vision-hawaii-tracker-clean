import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

export type Severity = "error" | "warning" | "info";

export type Finding = {
  domain: string;
  severity: Severity;
  check_name: string;
  table_name?: string;
  primary_key?: string | number | null;
  related_photo_id?: string | number | null;
  related_catalog_id?: string | number | null;
  related_manta_id?: string | number | null;
  related_sighting_id?: string | number | null;
  message: string;
  suggested_action?: string;
  metadata?: Record<string, unknown>;
};

export type DomainResult = {
  domain: string;
  checked_at: string;
  summary: Record<string, unknown>;
  findings: Finding[];
};

export type TableSchema = {
  table: string;
  columns: string[];
  primaryKey?: string;
};

export type QcContext = {
  repoRoot: string;
  outputDir: string;
  schema: Map<string, TableSchema>;
  supabase: SupabaseClient | null;
  checkStorage: boolean;
};

export const DOMAINS = [
  "catalog",
  "sightings",
  "mantas",
  "photos",
  "sizes",
  "biopsies",
  "photo-storage",
] as const;

const PRIMARY_KEYS: Record<string, string> = {
  catalog: "pk_catalog_id",
  sightings: "pk_sighting_id",
  mantas: "pk_manta_id",
  photos: "pk_photo_id",
  sizes: "pk_size_id",
  biopsies: "pk_biopsy_id",
};

export function repoPath(...parts: string[]) {
  return path.resolve(process.cwd(), ...parts);
}

export function ensureOutputDir(outputDir: string) {
  fs.mkdirSync(outputDir, { recursive: true });
}

export function loadSchemaFromSql(repoRoot: string): Map<string, TableSchema> {
  const schema = new Map<string, TableSchema>();
  const sqlPath = path.join(repoRoot, "cloud_schema.sql");
  if (!fs.existsSync(sqlPath)) return schema;

  const sql = fs.readFileSync(sqlPath, "utf8");
  const tableRegex = /create\s+table\s+public\.([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
  let match: RegExpExecArray | null;

  while ((match = tableRegex.exec(sql))) {
    const table = match[1];
    const body = match[2];
    const columns = body
      .split("\n")
      .map((line) => line.trim().replace(/,$/, ""))
      .filter(Boolean)
      .map((line) => line.split(/\s+/)[0])
      .filter((name) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name));

    const inlinePk = body.match(/^\s*([a-zA-Z0-9_]+)\s+[^,\n]*primary\s+key/im)?.[1];
    schema.set(table, {
      table,
      columns,
      primaryKey: inlinePk ?? PRIMARY_KEYS[table],
    });
  }

  return schema;
}

export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function augmentSchemaFromSupabase(
  schema: Map<string, TableSchema>,
  supabase: SupabaseClient | null,
  tables: string[],
) {
  if (!supabase) return schema;

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select("*").limit(1);
    if (error || !data?.[0]) continue;
    const remoteColumns = Object.keys(data[0]);
    const existing = schema.get(table);
    schema.set(table, {
      table,
      primaryKey: existing?.primaryKey ?? PRIMARY_KEYS[table],
      columns: Array.from(new Set([...(existing?.columns ?? []), ...remoteColumns])),
    });
  }

  return schema;
}

export function hasTable(ctx: QcContext, table: string) {
  return ctx.schema.has(table);
}

export function hasColumn(ctx: QcContext, table: string, column: string) {
  return ctx.schema.get(table)?.columns.includes(column) ?? false;
}

export function pickColumns(ctx: QcContext, table: string, wanted: string[]) {
  const schema = ctx.schema.get(table);
  if (!schema) return [];
  return wanted.filter((column) => schema.columns.includes(column));
}

export async function loadRows(ctx: QcContext, table: string, wantedColumns?: string[]) {
  if (!ctx.supabase || !hasTable(ctx, table)) return [] as Record<string, unknown>[];
  const columns = wantedColumns?.length ? pickColumns(ctx, table, wantedColumns) : ["*"];
  if (wantedColumns?.length && columns.length === 0) return [] as Record<string, unknown>[];

  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await ctx.supabase
      .from(table)
      .select(columns.join(","))
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export function addMissingTableFinding(domain: string, table: string): Finding {
  return {
    domain,
    severity: "warning",
    check_name: "table_available",
    table_name: table,
    message: `Table '${table}' was not present in the local schema snapshot; database checks for this domain were skipped.`,
    suggested_action: "Refresh cloud_schema.sql or run schema inspection against Supabase before relying on this domain.",
  };
}

export function addNoDatabaseFinding(domain: string): Finding {
  return {
    domain,
    severity: "warning",
    check_name: "database_connection_available",
    message: "Supabase credentials were not available, so live database checks were skipped.",
    suggested_action: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY, then rerun npm run qc:data.",
  };
}

export function countDuplicateValues(rows: Record<string, unknown>[], column: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[column];
    if (value == null || value === "") continue;
    const key = String(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries()).filter(([, count]) => count > 1);
}

export function indexBy(rows: Record<string, unknown>[], column: string) {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const value = row[column];
    if (value != null && value !== "") map.set(String(value), row);
  }
  return map;
}

export function truthy(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

export function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isVentral(row: Record<string, unknown>) {
  return ["ventral", "belly", "underside"].includes(normalize(row.photo_view || row.view_label));
}

export function isNoVentralAvailableException(value: unknown) {
  return normalize(value) === "no_ventral_available";
}

export function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function writeCsv(filePath: string, rows: Record<string, unknown>[]) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const body = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];
  fs.writeFileSync(filePath, body.join("\n") + "\n");
}

export function writeDomainResult(ctx: QcContext, result: DomainResult) {
  const base = result.domain.replace(/[^a-z0-9-]+/gi, "_");
  fs.writeFileSync(path.join(ctx.outputDir, `${base}.json`), JSON.stringify(result, null, 2));
  writeCsv(
    path.join(ctx.outputDir, `${base}_findings.csv`),
    result.findings.map((finding) => ({
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
    })),
  );
}

export function summarizeFindings(findings: Finding[]) {
  return {
    total: findings.length,
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    info: findings.filter((finding) => finding.severity === "info").length,
  };
}
