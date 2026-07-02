import fs from "fs";
import path from "path";
import {
  ensureOutputDir,
  getSupabaseClient,
  loadRows,
  loadSchemaFromSql,
  normalize,
  QcContext,
  writeCsv,
} from "./qc_common";

type Row = Record<string, unknown>;

const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/manta_catalog_link_audit");
const PUBLIC_DUPLICATE_REVIEW_DIR = path.resolve(process.cwd(), "public/qc/duplicate-catalog-review");
const PUBLIC_MANTA_CATALOG_REVIEW_DIR = path.resolve(process.cwd(), "public/qc/manta-catalog-link-review");
const DEFAULT_DUPLICATE_DIRS = [
  "/Users/littlemac/Dropbox/Manta Trust/suggested_duplicates_hawaii_eff_s_300_v1_260825",
  "/Users/littlemac/Desktop/suggested_duplicates_hawaii_eff_s_300_v1_260825",
];

type DuplicatePair = {
  file_path: string;
  review_bucket: string;
  catalog_id_a: number;
  catalog_id_b: number;
  keeper_catalog_id: number;
  retired_catalog_id: number;
  score: number | null;
};

function id(value: unknown) {
  if (value == null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function bool(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function distinctNumbers(values: unknown[]) {
  return Array.from(
    new Set(values.map((value) => id(value)).filter((value): value is number => value != null)),
  ).sort((a, b) => a - b);
}

function parseEmbeddedCatalogIds(name: unknown) {
  const value = text(name);
  const ids = new Set<number>();
  for (const match of value.matchAll(/\bcat(?:alog)?\s*#?\s*(\d+)\b/gi)) {
    ids.add(Number(match[1]));
  }
  return Array.from(ids).sort((a, b) => a - b);
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function idsToText(values: number[]) {
  return values.join("|");
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(entryPath);
    return [entryPath];
  });
}

function reviewBucket(root: string, filePath: string) {
  const relative = path.relative(root, filePath);
  const parts = relative.split(path.sep);
  if (parts.length >= 2 && parts[0] === "Fixed") return `Fixed/${parts[1]}`;
  if (parts.length === 1) return "ROOT";
  return parts[0] ?? "";
}

function duplicateExportDir() {
  const configured = process.env.CATALOG_DUPLICATE_EXPORT_DIR;
  if (configured && fs.existsSync(configured)) return configured;
  return DEFAULT_DUPLICATE_DIRS.find((dir) => fs.existsSync(dir)) ?? null;
}

function loadDuplicatePairs() {
  const dir = duplicateExportDir();
  if (!dir) return { dir: "", pairs: [] as DuplicatePair[] };

  const pairs = walkFiles(dir)
    .filter((filePath) => /\.(jpe?g|png)$/i.test(filePath))
    .map((filePath) => {
      const match = path.basename(filePath).match(/(?:^|_)id(\d+)_id(\d+)_([0-9.]+)/i);
      if (!match) return null;
      const a = Number(match[1]);
      const b = Number(match[2]);
      return {
        file_path: filePath,
        review_bucket: reviewBucket(dir, filePath),
        catalog_id_a: a,
        catalog_id_b: b,
        keeper_catalog_id: Math.min(a, b),
        retired_catalog_id: Math.max(a, b),
        score: Number.isFinite(Number(match[3])) ? Number(match[3]) : null,
      };
    })
    .filter((pair): pair is DuplicatePair => pair != null);

  return { dir, pairs };
}

function writeBrowserDuplicateReviewManifest(pairs: DuplicatePair[]) {
  fs.mkdirSync(PUBLIC_DUPLICATE_REVIEW_DIR, { recursive: true });
  const browserRows = pairs.map((pair, index) => {
    const publicName = `${String(index + 1).padStart(4, "0")}_id${pair.catalog_id_a}_id${pair.catalog_id_b}.jpg`;
    const destination = path.join(PUBLIC_DUPLICATE_REVIEW_DIR, publicName);
    fs.copyFileSync(pair.file_path, destination);
    return {
      review_index: index + 1,
      review_bucket: pair.review_bucket,
      catalog_id_a: pair.catalog_id_a,
      catalog_id_b: pair.catalog_id_b,
      lower_catalog_id: pair.keeper_catalog_id,
      higher_catalog_id: pair.retired_catalog_id,
      score: pair.score,
      image_url: `/qc/duplicate-catalog-review/${publicName}`,
      source_file_path: pair.file_path,
    };
  });

  fs.writeFileSync(
    path.join(PUBLIC_DUPLICATE_REVIEW_DIR, "duplicate_pairs.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source: "suggested duplicate review image filenames",
        note: "This manifest is read-only. Reviewer decisions are stored in browser localStorage until exported.",
        pairs: browserRows,
      },
      null,
      2,
    ),
  );

  return browserRows;
}

async function maybeLoadMergeAudit(ctx: QcContext) {
  if (!ctx.supabase) return { rows: [] as Row[], bySecondary: new Map<number, Row[]>() };

  const { data, error } = await ctx.supabase
    .from("catalog_merge_audit")
    .select("*")
    .limit(5000);

  if (error) return { rows: [] as Row[], bySecondary: new Map<number, Row[]>(), error: error.message };

  const rows = (data ?? []) as Row[];
  return {
    rows,
    bySecondary: groupBy(rows, (row) => String(id(row.secondary_pk_catalog_id) ?? "")),
  };
}

async function main() {
  ensureOutputDir(OUT_DIR);

  const repoRoot = process.cwd();
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase credentials were not available. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const ctx: QcContext = {
    repoRoot,
    outputDir: OUT_DIR,
    schema: loadSchemaFromSql(repoRoot),
    supabase,
    checkStorage: false,
  };

  const [catalogRows, mantaRows, photoRows] = await Promise.all([
    loadRows(ctx, "catalog"),
    loadRows(ctx, "mantas"),
    loadRows(ctx, "photos"),
  ]);
  const mergeAudit = await maybeLoadMergeAudit(ctx);
  const duplicateExport = loadDuplicatePairs();
  const browserDuplicateRows = writeBrowserDuplicateReviewManifest(duplicateExport.pairs);
  const retiredConfirmedPairs = duplicateExport.pairs.filter((pair) =>
    ["ROOT", "Fixed/Matches", "Fixed/Mirrors"].includes(pair.review_bucket),
  );
  const retiredProblemPairs = duplicateExport.pairs.filter((pair) => pair.review_bucket === "Fixed/didn't merge properly");
  const retiredConfirmedById = new Map<number, DuplicatePair[]>();
  const retiredProblemById = new Map<number, DuplicatePair[]>();
  for (const pair of retiredConfirmedPairs) {
    const list = retiredConfirmedById.get(pair.retired_catalog_id) ?? [];
    list.push(pair);
    retiredConfirmedById.set(pair.retired_catalog_id, list);
  }
  for (const pair of retiredProblemPairs) {
    const list = retiredProblemById.get(pair.retired_catalog_id) ?? [];
    list.push(pair);
    retiredProblemById.set(pair.retired_catalog_id, list);
  }

  const catalogById = new Map<number, Row>();
  const catalogByName = new Map<string, Row[]>();
  for (const catalog of catalogRows) {
    const catalogId = id(catalog.pk_catalog_id);
    if (catalogId == null) continue;
    catalogById.set(catalogId, catalog);
    const nameKey = normalize(catalog.name);
    if (!nameKey) continue;
    const list = catalogByName.get(nameKey) ?? [];
    list.push(catalog);
    catalogByName.set(nameKey, list);
  }

  const mantasByName = groupBy(mantaRows, (row) => normalize(row.name));
  const photosByManta = groupBy(photoRows, (row) => String(id(row.fk_manta_id) ?? ""));
  const missingCatalogMantas = mantaRows.filter((row) => id(row.fk_catalog_id) == null);

  const auditRows = missingCatalogMantas.map((manta) => {
    const mantaId = id(manta.pk_manta_id);
    const name = text(manta.name);
    const nameKey = normalize(name);
    const exactCatalogs = nameKey ? catalogByName.get(nameKey) ?? [] : [];
    const exactCatalogIds = distinctNumbers(exactCatalogs.map((row) => row.pk_catalog_id));
    const embeddedCatalogIds = parseEmbeddedCatalogIds(name);
    const photoRowsForManta = photosByManta.get(String(mantaId ?? "")) ?? [];
    const photoCatalogIds = distinctNumbers(photoRowsForManta.map((row) => row.fk_catalog_id));
    const siblingMantas = nameKey
      ? (mantasByName.get(nameKey) ?? []).filter(
          (row) => id(row.pk_manta_id) !== mantaId && id(row.fk_catalog_id) != null,
        )
      : [];
    const siblingCatalogIds = distinctNumbers(siblingMantas.map((row) => row.fk_catalog_id));
    const resolvedEmbeddedCatalogIds = embeddedCatalogIds
      .flatMap((catalogId) => {
        if (catalogById.has(catalogId)) return [catalogId];
        const mergedTo = (mergeAudit.bySecondary.get(String(catalogId)) ?? [])
          .map((row) => id(row.primary_pk_catalog_id))
          .filter((value): value is number => value != null);
        return mergedTo;
      })
      .filter((catalogId, index, values) => values.indexOf(catalogId) === index)
      .sort((a, b) => a - b);

    const candidateVotes = [
      ...exactCatalogIds.map((catalogId) => ({ catalogId, basis: "exact_name" })),
      ...siblingCatalogIds.map((catalogId) => ({ catalogId, basis: "sibling_manta_name" })),
      ...photoCatalogIds.map((catalogId) => ({ catalogId, basis: "photo_fk_catalog_id" })),
      ...resolvedEmbeddedCatalogIds.map((catalogId) => ({ catalogId, basis: "embedded_cat_hint" })),
    ].filter((vote) => catalogById.has(vote.catalogId));

    const voteIds = distinctNumbers(candidateVotes.map((vote) => vote.catalogId));
    const proposedCatalogId = voteIds.length === 1 ? voteIds[0] : null;
    const proposedCatalog = proposedCatalogId == null ? null : catalogById.get(proposedCatalogId) ?? null;
    const proposedRetiredPairs = proposedCatalogId == null ? [] : retiredConfirmedById.get(proposedCatalogId) ?? [];

    const reasons: string[] = [];
    if (!name) reasons.push("manta_name_blank");
    if (exactCatalogIds.length === 1) reasons.push("exact_name_match");
    if (exactCatalogIds.length > 1) reasons.push("multiple_catalog_rows_share_name");
    if (exactCatalogIds.length === 0 && name) reasons.push("no_exact_catalog_name_match");
    if (photoCatalogIds.length > 0) reasons.push("photo_rows_have_catalog_ids");
    if (siblingCatalogIds.length > 0) reasons.push("same_name_mantas_have_catalog_ids");
    if (embeddedCatalogIds.length > 0) reasons.push("embedded_cat_hint_present");
    for (const catalogId of embeddedCatalogIds) {
      if (!catalogById.has(catalogId) && !mergeAudit.bySecondary.has(String(catalogId))) {
        reasons.push(`embedded_cat_${catalogId}_missing_from_catalog_and_merge_audit`);
      }
    }
    if (proposedRetiredPairs.length > 0) reasons.push("proposed_catalog_is_confirmed_retired_duplicate");
    if (voteIds.length > 1) reasons.push("candidate_conflict");
    if (proposedCatalogId == null) reasons.push("no_single_candidate");

    const conflicts = [
      exactCatalogIds,
      siblingCatalogIds,
      photoCatalogIds,
      resolvedEmbeddedCatalogIds,
    ]
      .filter((values) => values.length > 0)
      .some((values) => proposedCatalogId != null && !values.includes(proposedCatalogId));

    let decision = "needs_manual_review";
    if (proposedRetiredPairs.length > 0) decision = "retired_duplicate_candidate";
    else if (voteIds.length > 1 || conflicts) decision = "conflict";
    else if (proposedCatalogId == null) decision = "no_candidate";
    else if (exactCatalogIds.length === 1 && nameKey) decision = "high_confidence_name_match";
    else if (siblingCatalogIds.length === 1 || photoCatalogIds.length === 1) decision = "medium_confidence_relationship_match";

    return {
      pk_manta_id: mantaId ?? "",
      name,
      is_mprf: bool(manta.is_mprf),
      fk_sighting_id: id(manta.fk_sighting_id) ?? "",
      proposed_fk_catalog_id: proposedCatalogId ?? "",
      proposed_catalog_name: proposedCatalog ? text(proposedCatalog.name) : "",
      decision,
      retired_duplicate_keeper_ids: idsToText(
        proposedRetiredPairs.map((pair) => pair.keeper_catalog_id).sort((a, b) => a - b),
      ),
      exact_name_catalog_ids: idsToText(exactCatalogIds),
      same_name_manta_catalog_ids: idsToText(siblingCatalogIds),
      photo_fk_catalog_ids: idsToText(photoCatalogIds),
      embedded_cat_ids: idsToText(embeddedCatalogIds),
      resolved_embedded_cat_ids: idsToText(resolvedEmbeddedCatalogIds),
      photo_count: photoRowsForManta.length,
      same_name_manta_count: siblingMantas.length,
      reasons: reasons.join("; "),
    };
  });

  const confirmedRetiredIds = Array.from(retiredConfirmedById.keys()).sort((a, b) => a - b);
  const problemRetiredIds = Array.from(retiredProblemById.keys()).sort((a, b) => a - b);
  const retiredCatalogViolations = confirmedRetiredIds
    .filter((catalogId) => catalogById.has(catalogId))
    .map((catalogId) => ({
      retired_catalog_id: catalogId,
      keeper_catalog_ids: idsToText((retiredConfirmedById.get(catalogId) ?? []).map((pair) => pair.keeper_catalog_id)),
      issue: "confirmed_retired_catalog_still_exists",
    }));
  const retiredMantaLinkViolations = mantaRows
    .filter((row) => {
      const catalogId = id(row.fk_catalog_id);
      return catalogId != null && retiredConfirmedById.has(catalogId);
    })
    .map((row) => {
      const catalogId = id(row.fk_catalog_id) as number;
      return {
        pk_manta_id: id(row.pk_manta_id) ?? "",
        fk_catalog_id: catalogId,
        keeper_catalog_ids: idsToText((retiredConfirmedById.get(catalogId) ?? []).map((pair) => pair.keeper_catalog_id)),
        name: text(row.name),
        issue: "manta_links_to_confirmed_retired_catalog",
      };
    });
  const retiredPhotoLinkViolations = photoRows
    .filter((row) => {
      const catalogId = id(row.fk_catalog_id);
      return catalogId != null && retiredConfirmedById.has(catalogId);
    })
    .map((row) => {
      const catalogId = id(row.fk_catalog_id) as number;
      return {
        pk_photo_id: id(row.pk_photo_id) ?? "",
        fk_manta_id: id(row.fk_manta_id) ?? "",
        fk_catalog_id: catalogId,
        keeper_catalog_ids: idsToText((retiredConfirmedById.get(catalogId) ?? []).map((pair) => pair.keeper_catalog_id)),
        issue: "photo_links_to_confirmed_retired_catalog",
      };
    });

  const summary = {
    checked_at: new Date().toISOString(),
    missing_catalog_mantas: missingCatalogMantas.length,
    missing_with_name: missingCatalogMantas.filter((row) => text(row.name)).length,
    blank_name: missingCatalogMantas.filter((row) => !text(row.name)).length,
    mprf_missing_catalog: missingCatalogMantas.filter((row) => bool(row.is_mprf)).length,
    hamer_missing_catalog: missingCatalogMantas.filter((row) => !bool(row.is_mprf)).length,
    exact_name_catalog_match: auditRows.filter((row) => row.exact_name_catalog_ids && !row.exact_name_catalog_ids.includes("|")).length,
    high_confidence_name_match: auditRows.filter((row) => row.decision === "high_confidence_name_match").length,
    medium_confidence_relationship_match: auditRows.filter((row) => row.decision === "medium_confidence_relationship_match").length,
    conflicts: auditRows.filter((row) => row.decision === "conflict").length,
    retired_duplicate_candidates: auditRows.filter((row) => row.decision === "retired_duplicate_candidate").length,
    no_candidate: auditRows.filter((row) => row.decision === "no_candidate").length,
    duplicate_export_dir: duplicateExport.dir,
    duplicate_export_pairs_total: duplicateExport.pairs.length,
    duplicate_review_manifest_rows: browserDuplicateRows.length,
    duplicate_confirmed_retired_ids: confirmedRetiredIds.length,
    duplicate_problem_retired_ids: problemRetiredIds.length,
    duplicate_retired_catalog_rows_still_present: retiredCatalogViolations.length,
    duplicate_retired_manta_links: retiredMantaLinkViolations.length,
    duplicate_retired_photo_links: retiredPhotoLinkViolations.length,
    merge_audit_rows_found: mergeAudit.rows.length,
    merge_audit_error: mergeAudit.error ?? "",
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "manta_catalog_link_audit.json"),
    JSON.stringify(
      {
        summary,
        rows: auditRows,
        duplicate_pairs: duplicateExport.pairs.map((pair) => ({
          review_bucket: pair.review_bucket,
          catalog_id_a: pair.catalog_id_a,
          catalog_id_b: pair.catalog_id_b,
          keeper_catalog_id: pair.keeper_catalog_id,
          retired_catalog_id: pair.retired_catalog_id,
          score: pair.score,
          file_path: pair.file_path,
        })),
        duplicate_guard: {
          confirmed_retired_ids: confirmedRetiredIds,
          problem_retired_ids: problemRetiredIds,
          retired_catalog_violations: retiredCatalogViolations,
          retired_manta_link_violations: retiredMantaLinkViolations,
          retired_photo_link_violations: retiredPhotoLinkViolations,
        },
      },
      null,
      2,
    ),
  );
  fs.mkdirSync(PUBLIC_MANTA_CATALOG_REVIEW_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(PUBLIC_MANTA_CATALOG_REVIEW_DIR, "manta_catalog_link_audit.json"),
    JSON.stringify({ summary, rows: auditRows }, null, 2),
  );
  writeCsv(path.join(OUT_DIR, "manta_catalog_link_audit.csv"), auditRows);
  writeCsv(
    path.join(OUT_DIR, "duplicate_pairs.csv"),
    duplicateExport.pairs.map((pair) => ({
      review_bucket: pair.review_bucket,
      catalog_id_a: pair.catalog_id_a,
      catalog_id_b: pair.catalog_id_b,
      keeper_catalog_id: pair.keeper_catalog_id,
      retired_catalog_id: pair.retired_catalog_id,
      score: pair.score ?? "",
      file_path: pair.file_path,
    })),
  );
  writeCsv(path.join(OUT_DIR, "retired_catalog_violations.csv"), [
    ...retiredCatalogViolations,
    ...retiredMantaLinkViolations,
    ...retiredPhotoLinkViolations,
  ]);

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${path.relative(repoRoot, OUT_DIR)}/manta_catalog_link_audit.json`);
  console.log(`Wrote ${path.relative(repoRoot, OUT_DIR)}/manta_catalog_link_audit.csv`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
