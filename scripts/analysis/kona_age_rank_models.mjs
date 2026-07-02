import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const OUT_DIR = "export/analysis";
const QUERIED_AT = new Date().toISOString();

const CONF = {
  high: 1,
  medium: 2,
  low: 3,
};

const MODELS = {
  step1_hamer_age_class: {
    label: "Step 1 - strongest variable only: HAMER dated adult/juvenile age class",
    maxConf: CONF.high,
    includeBasis: (basis) => basis.startsWith("hamer_age_class_"),
  },
  model1: {
    label: "Model 1 - high confidence: HAMER age class + 15-year maturity rule",
    maxConf: CONF.high,
    includeBasis: (basis) => basis.startsWith("hamer_age_class_") || basis === "15_year_sighting_history",
  },
  model2: {
    label: "Model 2 - Model 1 plus medium-confidence Kona/MPRF age classes and pup labels",
    maxConf: CONF.medium,
    includeBasis: (basis) => !basis.includes("_size_"),
  },
  model3: {
    label: "Model 3 - Model 2 plus low-confidence size-threshold review evidence",
    maxConf: CONF.low,
    includeBasis: () => true,
  },
};

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(file, rows, columns) {
  const lines = [
    columns.join(","),
    ...rows.map((row) => columns.map((col) => csvEscape(row[col])).join(",")),
  ];
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateOnly(value) {
  const d = parseDate(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

function addYears(dateString, years) {
  const d = parseDate(dateString);
  if (!d) return null;
  const out = new Date(d.getTime());
  out.setUTCFullYear(out.getUTCFullYear() + years);
  return out.toISOString().slice(0, 10);
}

function compareDate(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return 0;
  return da.getTime() - db.getTime();
}

function minDate(values) {
  return values.map(dateOnly).filter(Boolean).sort()[0] || null;
}

function maxDate(values) {
  return values.map(dateOnly).filter(Boolean).sort().at(-1) || null;
}

function normAgeClass(value) {
  const v = (value ?? "").toString().trim().toLowerCase();
  if (!v) return "";
  if (v.includes("adult") || v.includes("mature")) return "adult";
  if (v.includes("juven")) return "juvenile";
  if (v.includes("pup") || v.includes("newborn") || v.includes("neonate")) return "pup";
  return v;
}

function parseNumber(value) {
  if (value == null) return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function genderNorm(value) {
  const v = (value ?? "").toString().trim().toLowerCase();
  if (v === "m" || v === "male") return "male";
  if (v === "f" || v === "female") return "female";
  return "";
}

function sourceLabel(manta, sighting) {
  const isMprf = manta?.is_mprf === true || sighting?.is_mprf === true;
  return isMprf ? "mprf_or_kona_import" : "hamer";
}

function sourceAgeConfidence(ageClass, source) {
  if (!ageClass) return null;
  if (source === "hamer" && ageClass !== "pup") return "high";
  return "medium";
}

function evidence(id, type, date, confidence, basis, detail) {
  if (!date || !confidence) return null;
  return {
    catalog_id: id,
    type,
    date,
    confidence,
    confidence_rank: CONF[confidence],
    basis,
    detail,
  };
}

async function selectAll(table, select, filterFn) {
  const pageSize = 1000;
  const all = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    query = filterFn(query);
    const { data, error } = await query;
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

async function selectAllInChunks(table, select, column, values, chunkSize = 80, keyColumn = null) {
  const all = [];
  const unique = inList(values);
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    all.push(...await selectAll(table, select, (query) => query.in(column, chunk)));
  }
  const key = keyColumn ?? column;
  return [...new Map(all.map((row) => [Number(row[key]), row])).values()];
}

function inList(values) {
  return [...new Set(values.filter((v) => v != null && v !== ""))];
}

function idList(values) {
  return inList(values).join(",");
}

function evidenceSummary(evidences, type, model) {
  const items = evidences
    .filter((e) => e.type === type && e.confidence_rank <= model.maxConf && model.includeBasis(e.basis))
    .sort((a, b) => compareDate(a.date, b.date) || a.confidence_rank - b.confidence_rank);
  return items;
}

function strongestConfidence(a, b) {
  return Math.max(a.confidence_rank, b.confidence_rank);
}

function confidenceLabel(rank) {
  return Object.entries(CONF).find(([, value]) => value === rank)?.[0] || "unknown";
}

function buildModel(modelKey, individuals) {
  const model = MODELS[modelKey];
  const edges = [];
  const conflicts = [];

  for (const older of individuals) {
    const olderMature = evidenceSummary(older.evidence, "mature", model);
    if (!olderMature.length) continue;

    for (const younger of individuals) {
      if (older.catalog_id === younger.catalog_id) continue;
      const youngerImmature = evidenceSummary(younger.evidence, "immature", model);
      if (!youngerImmature.length) continue;

      let best = null;
      for (const m of olderMature) {
        for (const i of youngerImmature) {
          if (compareDate(m.date, i.date) < 0) {
            const rank = strongestConfidence(m, i);
            const candidate = {
              older_catalog_id: older.catalog_id,
              older_name: older.name,
              younger_catalog_id: younger.catalog_id,
              younger_name: younger.name,
              confidence: confidenceLabel(rank),
              confidence_rank: rank,
              mature_date: m.date,
              immature_date: i.date,
              mature_basis: m.basis,
              immature_basis: i.basis,
              detail: `${older.name} mature on ${m.date} before ${younger.name} immature on ${i.date}`,
            };
            if (
              !best ||
              candidate.confidence_rank < best.confidence_rank ||
              compareDate(candidate.mature_date, best.mature_date) < 0
            ) {
              best = candidate;
            }
          }
        }
      }
      if (best) edges.push(best);
    }
  }

  const edgeKey = (a, b) => `${a}->${b}`;
  const edgeSet = new Set(edges.map((e) => edgeKey(e.older_catalog_id, e.younger_catalog_id)));
  for (const e of edges) {
    if (edgeSet.has(edgeKey(e.younger_catalog_id, e.older_catalog_id))) {
      conflicts.push(e);
    }
  }

  const stats = new Map(individuals.map((i) => [i.catalog_id, {
    catalog_id: i.catalog_id,
    name: i.name,
    biopsy_id: i.biopsy_id,
    biopsy_date: i.biopsy_date,
    current_view_rank: i.current_view_rank,
    model_score: 0,
    older_than_count: 0,
    younger_than_count: 0,
    high_edges_out: 0,
    high_edges_in: 0,
    mature_evidence_count: evidenceSummary(i.evidence, "mature", model).length,
    immature_evidence_count: evidenceSummary(i.evidence, "immature", model).length,
    earliest_mature_date: minDate(evidenceSummary(i.evidence, "mature", model).map((e) => e.date)),
    latest_immature_date: maxDate(evidenceSummary(i.evidence, "immature", model).map((e) => e.date)),
    first_sighting_date: i.first_sighting_date,
    last_sighting_date: i.last_sighting_date,
    review_flags: i.review_flags.join("; "),
  }]));

  for (const e of edges) {
    const older = stats.get(e.older_catalog_id);
    const younger = stats.get(e.younger_catalog_id);
    older.older_than_count += 1;
    younger.younger_than_count += 1;
    if (e.confidence === "high") older.high_edges_out += 1;
    if (e.confidence === "high") younger.high_edges_in += 1;
  }

  for (const row of stats.values()) {
    row.model_score = row.older_than_count - row.younger_than_count;
  }

  const ranking = [...stats.values()].sort((a, b) => {
    return (
      b.model_score - a.model_score ||
      b.older_than_count - a.older_than_count ||
      a.younger_than_count - b.younger_than_count ||
      compareDate(a.earliest_mature_date, b.earliest_mature_date) ||
      compareDate(a.latest_immature_date, b.latest_immature_date) ||
      a.catalog_id - b.catalog_id
    );
  });

  let rank = 0;
  let previousKey = null;
  for (let i = 0; i < ranking.length; i += 1) {
    const r = ranking[i];
    const key = [
      r.model_score,
      r.older_than_count,
      r.younger_than_count,
      r.earliest_mature_date || "",
      r.latest_immature_date || "",
    ].join("|");
    if (key !== previousKey) rank = i + 1;
    r.model_rank = rank;
    previousKey = key;
  }

  return {
    key: modelKey,
    label: model.label,
    ranking,
    edges,
    conflicts,
    summary: {
      individuals: individuals.length,
      pairwise_edges: edges.length,
      conflict_edges: conflicts.length,
      individuals_with_mature_evidence: ranking.filter((r) => r.mature_evidence_count > 0).length,
      individuals_with_immature_evidence: ranking.filter((r) => r.immature_evidence_count > 0).length,
      ranked_with_any_edge: ranking.filter((r) => r.older_than_count || r.younger_than_count).length,
    },
  };
}

function buildReviewFlags(events) {
  const flags = [];
  const datedAge = events
    .filter((e) => e.date && e.age_class)
    .sort((a, b) => compareDate(a.date, b.date));

  let sawMature = false;
  for (const e of datedAge) {
    if (e.age_class === "adult") sawMature = true;
    if (sawMature && (e.age_class === "juvenile" || e.age_class === "pup")) {
      flags.push("age_class_reversal_after_adult");
      break;
    }
  }

  if (datedAge.some((e) => e.source !== "hamer" && e.age_class)) {
    flags.push("kona_or_mprf_age_class_needs_note_review");
  }

  if (datedAge.some((e) => e.age_class === "pup")) {
    flags.push("pup_label_needs_review");
  }

  const sizes = events
    .flatMap((e) => e.sizes.map((s) => ({ date: e.date, value: s.value, field: s.field })))
    .filter((s) => s.date && s.value != null)
    .sort((a, b) => compareDate(a.date, b.date));

  for (let i = 1; i < sizes.length; i += 1) {
    const prev = sizes[i - 1];
    const cur = sizes[i];
    const diff = cur.value - prev.value;
    if (diff < -0.3) flags.push("size_decreases_by_more_than_0.3m");
    if (Math.abs(diff) > 0.6) flags.push("size_jump_more_than_0.6m");
  }

  return [...new Set(flags)];
}

function sizeEvidence(individual, event) {
  const out = [];
  const gender = genderNorm(individual.gender);
  const size = event.sizes.find((s) => s.value != null)?.value ?? null;
  if (size == null || !event.date) return out;
  if (gender === "female" && size >= 3.37) {
    out.push(evidence(individual.catalog_id, "mature", event.date, "low", "female_size_ge_3.37m_deakos_review", `${size} m`));
  }
  if (gender === "male" && size >= 2.8) {
    out.push(evidence(individual.catalog_id, "mature", event.date, "low", "male_size_ge_2.8m_deakos_review", `${size} m`));
  }
  if (gender === "male" && size < 2.7) {
    out.push(evidence(individual.catalog_id, "immature", event.date, "low", "male_size_lt_2.7m_deakos_review", `${size} m`));
  }
  return out.filter(Boolean);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { data: rankedRows, error: rankError } = await supabase
    .from("kona_biopsy_age_rank_view_v3")
    .select("*")
    .order("age_rank_v3", { ascending: true });
  if (rankError) throw rankError;

  const catalogIds = inList(rankedRows.map((r) => r.pk_catalog_id));
  const mprfCatalogIds = inList(rankedRows.map((r) => r.pk_mprf_catalog_id));
  const rankedMantaIds = inList(rankedRows.map((r) => r.pk_manta_id));
  const biopsyIds = inList(rankedRows.map((r) => r.pk_biopsy_id));

  const { data: biopsies, error: biopsyError } = await supabase
    .from("biopsies")
    .select("pk_biopsy_id,fk_catalog_id,fk_manta_id,fk_sighting_id,sample_date")
    .in("pk_biopsy_id", biopsyIds);
  if (biopsyError) throw biopsyError;

  const { data: catalogs, error: catalogError } = await supabase
    .from("catalog")
    .select("pk_catalog_id,name,date_first_sighted,date_last_sighted,count_unique_years_sighted,years_between_first_last,total_sighting_days,last_age_class,last_gender,last_size_m,is_mprf,MPRF_first_sighted_date,MPRF_total_years_seen,MPRF_age_class_at_first_sighting,mprf_date_first_sighted,mprf_current_maturity,mprf_size_estimate")
    .in("pk_catalog_id", catalogIds);
  if (catalogError) throw catalogError;

  const mantaSelect = "pk_manta_id,fk_catalog_id,fk_sighting_id,gender,age_class,estimated_size_m,jon_size_m,size_disc_width_m,size_dw_m,size_m,is_mprf,name,pk_mprf_catalog_id,mprf_date,sighting_date";
  const mantaBatches = [];
  if (catalogIds.length) {
    mantaBatches.push(await selectAllInChunks("mantas", mantaSelect, "fk_catalog_id", catalogIds, 80, "pk_manta_id"));
  }
  if (mprfCatalogIds.length) {
    mantaBatches.push(await selectAllInChunks("mantas", mantaSelect, "pk_mprf_catalog_id", mprfCatalogIds, 80, "pk_manta_id"));
  }
  if (rankedMantaIds.length) {
    mantaBatches.push(await selectAllInChunks("mantas", mantaSelect, "pk_manta_id", rankedMantaIds, 80, "pk_manta_id"));
  }
  const mantaRows = [...new Map(mantaBatches.flat().map((m) => [Number(m.pk_manta_id), m])).values()];

  const sightingIds = inList([
    ...biopsies.map((b) => b.fk_sighting_id),
    ...mantaRows.map((m) => m.fk_sighting_id),
  ]);

  const sightings = await selectAllInChunks(
    "sightings",
    "pk_sighting_id,sighting_date,island,region,sitelocation,location,population,is_mprf,photographer,total_mantas,list_catalog_ids,list_manta_ids,list_manta_ids_2",
    "pk_sighting_id",
    sightingIds,
    80,
    "pk_sighting_id"
  );

  const catalogById = new Map(catalogs.map((c) => [Number(c.pk_catalog_id), c]));
  const biopsyById = new Map(biopsies.map((b) => [Number(b.pk_biopsy_id), b]));
  const sightingById = new Map(sightings.map((s) => [Number(s.pk_sighting_id), s]));

  const individuals = rankedRows.map((r) => {
    const catalog = catalogById.get(Number(r.pk_catalog_id)) ?? {};
    const biopsy = biopsyById.get(Number(r.pk_biopsy_id)) ?? {};
    const relatedMantas = mantaRows.filter((m) => {
      return (
        Number(m.fk_catalog_id) === Number(r.pk_catalog_id) ||
        Number(m.pk_mprf_catalog_id) === Number(r.pk_mprf_catalog_id) ||
        Number(m.pk_manta_id) === Number(r.pk_manta_id)
      );
    });

    const events = relatedMantas.map((m) => {
      const sighting = sightingById.get(Number(m.fk_sighting_id)) ?? null;
      const date = dateOnly(m.sighting_date || sighting?.sighting_date || m.mprf_date);
      const ageClass = normAgeClass(m.age_class);
      const source = sourceLabel(m, sighting);
      const sizes = [
        ["size_dw_m", m.size_dw_m],
        ["size_disc_width_m", m.size_disc_width_m],
        ["size_m", m.size_m],
        ["estimated_size_m", m.estimated_size_m],
        ["jon_size_m", m.jon_size_m],
      ]
        .map(([field, value]) => ({ field, value: parseNumber(value) }))
        .filter((s) => s.value != null);
      return { manta: m, sighting, date, age_class: ageClass, source, sizes };
    }).filter((e) => e.date);

    const firstSighting = minDate([
      r.effective_first_sighting,
      r.mprf_first_sighting_date,
      catalog.date_first_sighted,
      catalog.MPRF_first_sighted_date,
      catalog.mprf_date_first_sighted,
      ...events.map((e) => e.date),
    ]);
    const lastSighting = maxDate([
      catalog.date_last_sighted,
      ...events.map((e) => e.date),
    ]);

    const ev = [];

    for (const event of events) {
      const confidence = sourceAgeConfidence(event.age_class, event.source);
      if (event.age_class === "adult") {
        ev.push(evidence(r.pk_catalog_id, "mature", event.date, confidence, `${event.source}_age_class_adult`, `manta ${event.manta.pk_manta_id}`));
      }
      if (event.age_class === "juvenile" || event.age_class === "pup") {
        ev.push(evidence(r.pk_catalog_id, "immature", event.date, confidence, `${event.source}_age_class_${event.age_class}`, `manta ${event.manta.pk_manta_id}`));
      }
    }

    const mature15Date = addYears(firstSighting, 15);
    if (mature15Date && lastSighting && compareDate(mature15Date, lastSighting) <= 0) {
      ev.push(evidence(r.pk_catalog_id, "mature", mature15Date, "high", "15_year_sighting_history", `first=${firstSighting}; last=${lastSighting}`));
    }

    const individual = {
      catalog_id: Number(r.pk_catalog_id),
      mprf_catalog_id: r.pk_mprf_catalog_id == null ? null : Number(r.pk_mprf_catalog_id),
      name: r.hamer_name || r.mprf_name || catalog.name || `Catalog ${r.pk_catalog_id}`,
      gender: r.gender || catalog.last_gender,
      biopsy_id: r.pk_biopsy_id,
      biopsy_date: r.date_of_biopsy || biopsy.sample_date,
      current_view_rank: r.age_rank_v3,
      first_sighting_date: firstSighting,
      last_sighting_date: lastSighting,
      event_count: events.length,
      evidence: ev.filter(Boolean),
      events,
      review_flags: buildReviewFlags(events),
    };

    for (const event of events) {
      individual.evidence.push(...sizeEvidence(individual, event));
    }

    individual.evidence.sort((a, b) => compareDate(a.date, b.date) || a.confidence_rank - b.confidence_rank);
    return individual;
  });

  const models = Object.fromEntries(Object.keys(MODELS).map((key) => [key, buildModel(key, individuals)]));

  const output = {
    queried_at_utc: QUERIED_AT,
    source_tables: {
      ranked_view: "kona_biopsy_age_rank_view_v3",
      tables: ["biopsies", "catalog", "mantas", "sightings"],
    },
    assumptions: [
      "HAMER source is inferred when mantas.is_mprf and linked sightings.is_mprf are both not true.",
      "MPRF/Kona-import age classes are treated as medium confidence until note/size review.",
      "Pup labels are treated as immature but not stronger than juvenile in these models.",
      "15-year maturity evidence is added only when an individual has observed history through first_sighting + 15 years.",
      "Size thresholds are included only in Model 3 as low-confidence review evidence.",
    ],
    evidence_rules: {
      step1_hamer_age_class: "strongest variable only: HAMER adult/juvenile dated age class",
      model1: "high confidence: HAMER adult/juvenile dated age class and 15-year sighting history mature date",
      model2: "Model 1 plus medium-confidence MPRF/Kona age classes and pup labels",
      model3: "Model 2 plus low-confidence size-threshold review evidence",
      size_thresholds_model3: {
        male_mature: ">= 2.8 m",
        male_immature: "< 2.7 m",
        female_mature: ">= 3.37 m",
      },
    },
    individuals: individuals.map((i) => ({
      catalog_id: i.catalog_id,
      name: i.name,
      biopsy_id: i.biopsy_id,
      biopsy_date: i.biopsy_date,
      current_view_rank: i.current_view_rank,
      first_sighting_date: i.first_sighting_date,
      last_sighting_date: i.last_sighting_date,
      event_count: i.event_count,
      evidence: i.evidence,
      review_flags: i.review_flags,
    })),
    models,
  };

  const jsonPath = path.join(OUT_DIR, "kona_age_rank_models.json");
  fs.writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`);

  const rankingColumns = [
    "model",
    "model_rank",
    "catalog_id",
    "name",
    "biopsy_id",
    "biopsy_date",
    "current_view_rank",
    "model_score",
    "older_than_count",
    "younger_than_count",
    "high_edges_out",
    "high_edges_in",
    "mature_evidence_count",
    "immature_evidence_count",
    "earliest_mature_date",
    "latest_immature_date",
    "first_sighting_date",
    "last_sighting_date",
    "review_flags",
  ];
  const rankingRows = Object.values(models).flatMap((m) => m.ranking.map((r) => ({ model: m.key, ...r })));
  writeCsv(path.join(OUT_DIR, "kona_age_rank_model_rankings.csv"), rankingRows, rankingColumns);

  const edgeColumns = [
    "model",
    "older_catalog_id",
    "older_name",
    "younger_catalog_id",
    "younger_name",
    "confidence",
    "mature_date",
    "immature_date",
    "mature_basis",
    "immature_basis",
    "detail",
  ];
  const edgeRows = Object.values(models).flatMap((m) => m.edges.map((e) => ({ model: m.key, ...e })));
  writeCsv(path.join(OUT_DIR, "kona_age_rank_model_pairwise_edges.csv"), edgeRows, edgeColumns);

  const evidenceRows = individuals.flatMap((i) => i.evidence.map((e) => ({
    catalog_id: i.catalog_id,
    name: i.name,
    biopsy_id: i.biopsy_id,
    type: e.type,
    date: e.date,
    confidence: e.confidence,
    basis: e.basis,
    detail: e.detail,
  })));
  writeCsv(path.join(OUT_DIR, "kona_age_rank_model_evidence.csv"), evidenceRows, [
    "catalog_id",
    "name",
    "biopsy_id",
    "type",
    "date",
    "confidence",
    "basis",
    "detail",
  ]);

  console.log(JSON.stringify({
    queried_at_utc: QUERIED_AT,
    output_files: [
      jsonPath,
      path.join(OUT_DIR, "kona_age_rank_model_rankings.csv"),
      path.join(OUT_DIR, "kona_age_rank_model_pairwise_edges.csv"),
      path.join(OUT_DIR, "kona_age_rank_model_evidence.csv"),
    ],
    model_summaries: Object.fromEntries(Object.entries(models).map(([key, value]) => [key, value.summary])),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
