import fs from "fs";
import path from "path";
import {
  augmentSchemaFromSupabase,
  ensureOutputDir,
  getSupabaseClient,
  loadRows,
  loadSchemaFromSql,
  writeCsv,
  type QcContext,
} from "./qc_common";

type CatalogRow = {
  pk_catalog_id: number;
  name: string | null;
};

type MantaRow = {
  pk_manta_id: number;
  name: string | null;
  fk_catalog_id: number | null;
  fk_sighting_id: number | null;
  gender?: string | null;
  age_class?: string | null;
};

type Candidate = {
  pk_catalog_id: number;
  name: string;
  normalized_name: string;
  compact_name: string;
};

type MatchSuggestion = {
  pk_catalog_id: number;
  catalog_name: string;
  score: number;
  reason: string;
};

type ResultRow = {
  status: string;
  pk_manta_id: number;
  manta_name: string;
  fk_sighting_id: number | null;
  matched_catalog_id?: number;
  matched_catalog_name?: string;
  match_method?: string;
  suggestion_count: number;
  suggestion_catalog_ids: string;
  suggestion_catalog_names: string;
  suggestion_scores: string;
  suggestion_reasons: string;
  action: string;
  message: string;
};

const OUTPUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/manta_catalog_name_match");
const SCRIPT_NAME = "fix_manta_catalog_ids_by_name";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function normalizeName(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function compactName(value: unknown) {
  return normalizeName(value).replace(/[^a-z0-9]/g, "");
}

function parseNullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function levenshtein(a: string, b: string) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

function similarity(a: string, b: string) {
  if (!a && !b) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  return 1 - levenshtein(a, b) / longest;
}

function nearSuggestions(mantaName: string, candidates: Candidate[]) {
  const normalized = normalizeName(mantaName);
  const compact = compactName(mantaName);
  const suggestions: MatchSuggestion[] = [];

  for (const candidate of candidates) {
    if (!candidate.compact_name || !compact) continue;

    const contains =
      compact.length >= 3 &&
      candidate.compact_name.length >= 3 &&
      (candidate.compact_name.includes(compact) || compact.includes(candidate.compact_name));
    const score = similarity(compact, candidate.compact_name);
    const distance = levenshtein(compact, candidate.compact_name);

    if (contains) {
      suggestions.push({
        pk_catalog_id: candidate.pk_catalog_id,
        catalog_name: candidate.name,
        score,
        reason: "one normalized name contains the other",
      });
    } else if (score >= 0.78 || distance <= 3) {
      suggestions.push({
        pk_catalog_id: candidate.pk_catalog_id,
        catalog_name: candidate.name,
        score,
        reason: `similar normalized names; edit distance ${distance}`,
      });
    } else if (normalized && candidate.normalized_name.startsWith(normalized.slice(0, 5))) {
      suggestions.push({
        pk_catalog_id: candidate.pk_catalog_id,
        catalog_name: candidate.name,
        score,
        reason: "shared leading name fragment",
      });
    }
  }

  return suggestions
    .sort((a, b) => {
      const aContains = a.reason.includes("contains") ? 1 : 0;
      const bContains = b.reason.includes("contains") ? 1 : 0;
      return bContains - aContains || b.score - a.score || a.catalog_name.localeCompare(b.catalog_name);
    })
    .slice(0, 5);
}

function rowFromMatch(params: {
  manta: MantaRow;
  status: string;
  action: string;
  message: string;
  match?: Candidate;
  matchMethod?: string;
  suggestions?: MatchSuggestion[];
}): ResultRow {
  const suggestions = params.suggestions ?? [];
  return {
    status: params.status,
    pk_manta_id: params.manta.pk_manta_id,
    manta_name: params.manta.name ?? "",
    fk_sighting_id: params.manta.fk_sighting_id,
    matched_catalog_id: params.match?.pk_catalog_id,
    matched_catalog_name: params.match?.name,
    match_method: params.matchMethod,
    suggestion_count: suggestions.length,
    suggestion_catalog_ids: suggestions.map((suggestion) => suggestion.pk_catalog_id).join("; "),
    suggestion_catalog_names: suggestions.map((suggestion) => suggestion.catalog_name).join("; "),
    suggestion_scores: suggestions.map((suggestion) => suggestion.score.toFixed(3)).join("; "),
    suggestion_reasons: suggestions.map((suggestion) => suggestion.reason).join("; "),
    action: params.action,
    message: params.message,
  };
}

async function auditAndUpdate(ctx: QcContext, row: ResultRow, reason: string) {
  if (!ctx.supabase || !row.matched_catalog_id) {
    return { status: "blocked", message: "Supabase client or matched catalog ID was not available." };
  }

  const { data: current, error: currentError } = await ctx.supabase
    .from("mantas")
    .select("pk_manta_id,name,fk_catalog_id,fk_sighting_id")
    .eq("pk_manta_id", row.pk_manta_id)
    .maybeSingle();

  if (currentError) return { status: "blocked", message: currentError.message };
  if (!current) return { status: "blocked", message: "Manta row no longer exists." };
  if (current.fk_catalog_id != null) {
    return {
      status: "skipped_stale",
      message: `Manta already has fk_catalog_id ${current.fk_catalog_id}.`,
    };
  }

  const auditPayload = {
    source: "qc_script",
    action: "update",
    table_name: "mantas",
    primary_key: String(row.pk_manta_id),
    record_label: `manta ${row.pk_manta_id}`,
    reason,
    old_data: {
      pk_manta_id: current.pk_manta_id,
      name: current.name,
      fk_catalog_id: current.fk_catalog_id,
      fk_sighting_id: current.fk_sighting_id,
    },
    new_data: {
      pk_manta_id: current.pk_manta_id,
      name: current.name,
      fk_catalog_id: row.matched_catalog_id,
      fk_sighting_id: current.fk_sighting_id,
    },
    changed_fields: ["fk_catalog_id"],
    metadata: {
      script: SCRIPT_NAME,
      match_method: row.match_method,
      normalized_name: normalizeName(current.name),
      matched_catalog_id: row.matched_catalog_id,
      matched_catalog_name: row.matched_catalog_name,
    },
  };

  const { error: auditError } = await ctx.supabase.from("data_change_audit").insert(auditPayload);
  if (auditError) {
    return {
      status: "blocked",
      message: `Audit insert failed; manta was not updated. ${auditError.message}`,
    };
  }

  const { error: updateError } = await ctx.supabase
    .from("mantas")
    .update({ fk_catalog_id: row.matched_catalog_id })
    .eq("pk_manta_id", row.pk_manta_id)
    .is("fk_catalog_id", null);

  if (updateError) return { status: "blocked", message: updateError.message };

  const { data: verified, error: verifyError } = await ctx.supabase
    .from("mantas")
    .select("pk_manta_id,fk_catalog_id")
    .eq("pk_manta_id", row.pk_manta_id)
    .maybeSingle();

  if (verifyError) return { status: "blocked", message: verifyError.message };
  if (verified?.fk_catalog_id !== row.matched_catalog_id) {
    return { status: "blocked", message: "Update verification did not find the expected catalog ID." };
  }

  return { status: "updated", message: `Updated fk_catalog_id to ${row.matched_catalog_id}.` };
}

async function main() {
  const apply = hasArg("--apply");
  const reason = argValue("--reason")?.trim() ?? "";
  const targetMantaId = parseNullableNumber(argValue("--manta-id"));
  const limit = parseNullableNumber(argValue("--limit"));

  if (apply && !reason) {
    throw new Error("Applying changes requires --reason \"...\" so every update can be audited.");
  }

  ensureOutputDir(OUTPUT_DIR);

  const repoRoot = process.cwd();
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase credentials were not available.");
  }

  const ctx: QcContext = {
    repoRoot,
    outputDir: OUTPUT_DIR,
    schema: loadSchemaFromSql(repoRoot),
    supabase,
    checkStorage: false,
  };
  await augmentSchemaFromSupabase(ctx.schema, supabase, ["catalog", "mantas"]);

  const [catalogRowsRaw, mantaRowsRaw] = await Promise.all([
    loadRows(ctx, "catalog", ["pk_catalog_id", "name"]),
    loadRows(ctx, "mantas", ["pk_manta_id", "name", "fk_catalog_id", "fk_sighting_id", "gender", "age_class"]),
  ]);

  const catalogRows = catalogRowsRaw.map((row) => ({
    pk_catalog_id: Number(row.pk_catalog_id),
    name: row.name == null ? null : String(row.name),
  })) as CatalogRow[];

  const mantaRows = mantaRowsRaw
    .map((row) => ({
      pk_manta_id: Number(row.pk_manta_id),
      name: row.name == null ? null : String(row.name),
      fk_catalog_id: parseNullableNumber(row.fk_catalog_id),
      fk_sighting_id: parseNullableNumber(row.fk_sighting_id),
      gender: row.gender == null ? null : String(row.gender),
      age_class: row.age_class == null ? null : String(row.age_class),
    }))
    .filter((row) => Number.isFinite(row.pk_manta_id)) as MantaRow[];

  const catalogCandidates = catalogRows
    .filter((row) => row.name && Number.isFinite(row.pk_catalog_id))
    .map((row) => ({
      pk_catalog_id: row.pk_catalog_id,
      name: row.name ?? "",
      normalized_name: normalizeName(row.name),
      compact_name: compactName(row.name),
    }));

  const exactCatalogByName = new Map<string, Candidate[]>();
  for (const candidate of catalogCandidates) {
    const existing = exactCatalogByName.get(candidate.normalized_name) ?? [];
    existing.push(candidate);
    exactCatalogByName.set(candidate.normalized_name, existing);
  }

  let targetRows = mantaRows.filter((row) => row.fk_catalog_id == null && normalizeName(row.name));
  if (targetMantaId != null) targetRows = targetRows.filter((row) => row.pk_manta_id === targetMantaId);
  if (limit != null) targetRows = targetRows.slice(0, limit);

  const results: ResultRow[] = [];

  for (const manta of targetRows) {
    const exactMatches = exactCatalogByName.get(normalizeName(manta.name)) ?? [];
    if (exactMatches.length === 1) {
      results.push(
        rowFromMatch({
          manta,
          status: apply ? "pending_apply" : "dry_run_ready",
          action: apply ? "apply exact catalog name match" : "would update fk_catalog_id on apply",
          message: "Unique exact catalog name match.",
          match: exactMatches[0],
          matchMethod: "exact_normalized_name",
        }),
      );
      continue;
    }

    if (exactMatches.length > 1) {
      results.push(
        rowFromMatch({
          manta,
          status: "ambiguous_exact",
          action: "review manually",
          message: "More than one catalog row has this exact normalized name.",
          suggestions: exactMatches.map((match) => ({
            pk_catalog_id: match.pk_catalog_id,
            catalog_name: match.name,
            score: 1,
            reason: "exact normalized name",
          })),
        }),
      );
      continue;
    }

    const suggestions = nearSuggestions(manta.name ?? "", catalogCandidates);
    results.push(
      rowFromMatch({
        manta,
        status: suggestions.length ? "needs_review_near_match" : "no_match",
        action: suggestions.length ? "review suggested catalog candidates" : "manual catalog research needed",
        message: suggestions.length
          ? "No exact match. Suggested near/contains catalog names are listed for review only."
          : "No exact or near catalog name match found.",
        suggestions,
      }),
    );
  }

  if (apply) {
    for (const row of results.filter((result) => result.status === "pending_apply")) {
      const outcome = await auditAndUpdate(ctx, row, reason);
      row.status = outcome.status;
      row.action = outcome.status === "updated" ? "updated fk_catalog_id" : row.action;
      row.message = outcome.message;
    }
  }

  const reviewRows = results.filter((row) =>
    ["ambiguous_exact", "needs_review_near_match", "no_match", "blocked"].includes(row.status),
  );
  const exactReadyRows = results.filter((row) => row.status === "dry_run_ready" || row.status === "pending_apply");

  const summary = {
    checked_at: new Date().toISOString(),
    apply,
    reason_provided: Boolean(reason),
    target_mantas: targetRows.length,
    exact_unique: results.filter((row) => row.match_method === "exact_normalized_name").length,
    exact_ambiguous: results.filter((row) => row.status === "ambiguous_exact").length,
    near_match_only: results.filter((row) => row.status === "needs_review_near_match").length,
    no_match: results.filter((row) => row.status === "no_match").length,
    dry_run_ready: results.filter((row) => row.status === "dry_run_ready").length,
    updated: results.filter((row) => row.status === "updated").length,
    blocked: results.filter((row) => row.status === "blocked").length,
    skipped_stale: results.filter((row) => row.status === "skipped_stale").length,
    output_dir: OUTPUT_DIR,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "manta_catalog_name_match_summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "manta_catalog_name_match_results.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  writeCsv(path.join(OUTPUT_DIR, "manta_catalog_name_match_results.csv"), results);
  writeCsv(path.join(OUTPUT_DIR, "manta_catalog_name_match_review_candidates.csv"), reviewRows);
  writeCsv(path.join(OUTPUT_DIR, "manta_catalog_name_match_exact_ready.csv"), exactReadyRows);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
