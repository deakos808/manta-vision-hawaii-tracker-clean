const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const xlsx = require("xlsx");
require("dotenv").config({ path: ".env.local" });

const OUT_DIR = "export/analysis";
const SAMPLE_ALIGNMENT = path.join(OUT_DIR, "kona_age_rank_sample_id_alignment.csv");
const QUERIED_AT = new Date().toISOString();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase env vars.");
const supabase = createClient(supabaseUrl, supabaseKey);

function parseCsvLine(line) {
  const out = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && quoted && line[i + 1] === '"') {
      value += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(value);
      value = "";
    } else {
      value += ch;
    }
  }
  out.push(value);
  return out;
}

function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]));
  });
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(file, rows, columns) {
  fs.writeFileSync(
    file,
    [columns.join(","), ...rows.map((row) => columns.map((col) => csvEscape(row[col])).join(","))].join("\n") + "\n"
  );
}

function dateOnly(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function addYears(dateString, years) {
  const d = new Date(dateString);
  if (!dateString || Number.isNaN(d.getTime())) return "";
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function compareDate(a, b) {
  if (!a || !b) return 0;
  return new Date(a).getTime() - new Date(b).getTime();
}

function normAgeClass(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v || v === "unknown") return "unknown";
  if (v.includes("adult") || v.includes("mature")) return "mature";
  if (v.includes("juven") || v.includes("pup") || v.includes("immature")) return "immature";
  return "unknown";
}

function unique(values) {
  return [...new Set(values.filter((v) => v != null && v !== ""))];
}

function rankByScore(rows) {
  const sorted = [...rows].sort((a, b) => {
    return (
      b.model2_score - a.model2_score ||
      String(a.source_group).localeCompare(String(b.source_group)) ||
      String(a.name).localeCompare(String(b.name)) ||
      Number(a.catalog_id) - Number(b.catalog_id)
    );
  });
  let previousScore = null;
  let currentRank = 0;
  sorted.forEach((row, index) => {
    if (row.model2_score !== previousScore) currentRank = index + 1;
    row.model2_rank = currentRank;
    previousScore = row.model2_score;
  });
  return sorted;
}

function setColumnWidths(ws, widths) {
  ws["!cols"] = widths.map((wch) => ({ wch }));
}

function makeWorkbook(evidenceRows, rankRows, narrativeRows, summaryRows) {
  const wb = xlsx.utils.book_new();
  const narrative = xlsx.utils.aoa_to_sheet(narrativeRows);
  setColumnWidths(narrative, [28, 110]);
  xlsx.utils.book_append_sheet(wb, narrative, "Narrative");

  const summary = xlsx.utils.json_to_sheet(summaryRows);
  setColumnWidths(summary, [34, 16, 24]);
  xlsx.utils.book_append_sheet(wb, summary, "Summary");

  const evidence = xlsx.utils.json_to_sheet(evidenceRows);
  setColumnWidths(evidence, [12, 10, 26, 12, 14, 14, 18, 16, 16, 18, 18, 16, 16, 18, 18, 18, 36, 42]);
  evidence["!autofilter"] = { ref: xlsx.utils.encode_range(xlsx.utils.decode_range(evidence["!ref"])) };
  xlsx.utils.book_append_sheet(wb, evidence, "Evidence by Source");

  const ranks = xlsx.utils.json_to_sheet(rankRows);
  setColumnWidths(ranks, [10, 10, 12, 26, 12, 14, 14, 18, 18, 16, 16, 16, 16, 18, 18, 38]);
  ranks["!autofilter"] = { ref: xlsx.utils.encode_range(xlsx.utils.decode_range(ranks["!ref"])) };
  xlsx.utils.book_append_sheet(wb, ranks, "Model 2 Ranks");

  return wb;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { data: ranked, error: rankedError } = await supabase
    .from("kona_biopsy_age_rank_view_v3")
    .select("*")
    .order("age_rank_v3", { ascending: true });
  if (rankedError) throw rankedError;

  const biopsyIds = unique(ranked.map((r) => r.pk_biopsy_id));
  const mantaIds = unique(ranked.map((r) => r.pk_manta_id));
  const catalogIds = unique(ranked.map((r) => r.pk_catalog_id));

  const { data: biopsies, error: biopsyError } = await supabase
    .from("biopsies")
    .select("pk_biopsy_id,fk_manta_id,fk_sighting_id,fk_catalog_id,sample_date,source")
    .in("pk_biopsy_id", biopsyIds);
  if (biopsyError) throw biopsyError;

  const { data: mantas, error: mantaError } = await supabase
    .from("mantas")
    .select("pk_manta_id,fk_catalog_id,fk_sighting_id,age_class,gender,size_dw_m,size_disc_width_m,size_m,estimated_size_m,sighting_date,is_mprf,name")
    .in("pk_manta_id", mantaIds);
  if (mantaError) throw mantaError;

  const { data: catalogs, error: catalogError } = await supabase
    .from("catalog")
    .select("pk_catalog_id,name,is_mprf,last_age_class,MPRF_total_years_seen,MPRF_first_sighted_date,MPRF_age_class_at_first_sighting,date_first_sighted,date_last_sighted")
    .in("pk_catalog_id", catalogIds);
  if (catalogError) throw catalogError;

  const sampleRows = readCsv(SAMPLE_ALIGNMENT);
  const sampleByCatalog = new Map(sampleRows.map((row) => [String(row.catalog_id), row]));
  const biopsyById = new Map(biopsies.map((row) => [Number(row.pk_biopsy_id), row]));
  const mantaById = new Map(mantas.map((row) => [Number(row.pk_manta_id), row]));
  const catalogById = new Map(catalogs.map((row) => [Number(row.pk_catalog_id), row]));

  const rows = ranked.map((row) => {
    const biopsy = biopsyById.get(Number(row.pk_biopsy_id)) ?? {};
    const manta = mantaById.get(Number(row.pk_manta_id)) ?? {};
    const catalog = catalogById.get(Number(row.pk_catalog_id)) ?? {};
    const sample = sampleByCatalog.get(String(row.pk_catalog_id)) ?? {};
    const sourceGroup = biopsy.source === "MPRF-import" ? "MPRF" : "HAMER";
    const name = row.hamer_name || row.mprf_name || catalog.name || `Catalog ${row.pk_catalog_id}`;
    const ageClassRaw = sourceGroup === "HAMER"
      ? (manta.age_class || row.last_age_class || "")
      : (row.mprf_last_age_class || catalog.MPRF_age_class_at_first_sighting || row.last_age_class || "");
    const ageClassStatus = normAgeClass(ageClassRaw);
    const biopsyDate = dateOnly(row.date_of_biopsy || biopsy.sample_date || manta.sighting_date);
    const mprfYears = Number(row.mprf_total_years_seen ?? catalog.MPRF_total_years_seen);
    const mprfFirst = dateOnly(row.mprf_first_sighting_date || catalog.MPRF_first_sighted_date || row.effective_first_sighting || catalog.date_first_sighted);
    const mprfFifteenDate = mprfYears > 15 && mprfFirst ? addYears(mprfFirst, 15) : "";

    let matureDate = "";
    let immatureDate = "";
    const evidenceBasisParts = [];

    if (sourceGroup === "HAMER" && ageClassStatus === "mature") {
      matureDate = biopsyDate;
      evidenceBasisParts.push("HAMER biopsy-linked age class mature");
    } else if (sourceGroup === "HAMER" && ageClassStatus === "immature") {
      immatureDate = biopsyDate;
      evidenceBasisParts.push("HAMER biopsy-linked age class immature");
    } else if (sourceGroup === "MPRF") {
      if (ageClassStatus === "mature") {
        matureDate = mprfFirst || biopsyDate;
        evidenceBasisParts.push("MPRF provided age class mature");
      } else if (ageClassStatus === "immature") {
        immatureDate = mprfFirst || biopsyDate;
        evidenceBasisParts.push("MPRF provided age class immature");
      }
      if (mprfYears > 15 && mprfFifteenDate) {
        if (!matureDate || compareDate(mprfFifteenDate, matureDate) < 0) matureDate = mprfFifteenDate;
        evidenceBasisParts.push(">15 years MPRF resight history");
      } else if (mprfYears > 15) {
        evidenceBasisParts.push(">15 years MPRF resight history but no first date");
      }
    }
    const model2Evidence = matureDate && immatureDate
      ? "mature_and_immature"
      : matureDate
        ? "mature"
        : immatureDate
          ? "immature"
          : evidenceBasisParts.some((part) => part.includes("no first date"))
            ? "mature_undated"
            : "none";
    const evidenceBasis = evidenceBasisParts.join("; ");

    return {
      catalog_id: Number(row.pk_catalog_id),
      biopsy_id: Number(row.pk_biopsy_id),
      manta_id: Number(row.pk_manta_id),
      sample_id: sample.lookup_sample_id || "",
      sample_lookup_name: sample.lookup_name || "",
      sample_alignment: sample.alignment || "",
      name,
      source_group: sourceGroup,
      biopsy_source: biopsy.source || "",
      biopsy_date: biopsyDate,
      age_class_raw: ageClassRaw,
      age_class_status: ageClassStatus,
      mprf_total_years_seen: Number.isFinite(mprfYears) ? mprfYears : "",
      mprf_first_sighting_date: mprfFirst,
      mprf_15_year_mature_date: mprfFifteenDate,
      model2_evidence: model2Evidence,
      model2_evidence_basis: evidenceBasis,
      mature_date: matureDate,
      immature_date: immatureDate,
      current_view_rank: row.age_rank_v3,
    };
  });

  const edges = [];
  for (const older of rows) {
    if (!older.mature_date) continue;
    for (const younger of rows) {
      if (older.catalog_id === younger.catalog_id || !younger.immature_date) continue;
      if (compareDate(older.mature_date, younger.immature_date) < 0) {
        edges.push({
          older_catalog_id: older.catalog_id,
          older_name: older.name,
          younger_catalog_id: younger.catalog_id,
          younger_name: younger.name,
          mature_date: older.mature_date,
          immature_date: younger.immature_date,
        });
      }
    }
  }

  const rankBase = rows.map((row) => {
    const olderThan = edges.filter((edge) => edge.older_catalog_id === row.catalog_id).length;
    const youngerThan = edges.filter((edge) => edge.younger_catalog_id === row.catalog_id).length;
    return {
      model2_rank: "",
      model2_score: olderThan - youngerThan,
      catalog_id: row.catalog_id,
      name: row.name,
      biopsy_id: row.biopsy_id,
      sample_id: row.sample_id,
      sample_lookup_name: row.sample_lookup_name,
      source_group: row.source_group,
      model2_evidence: row.model2_evidence,
      mature_date: row.mature_date,
      immature_date: row.immature_date,
      older_than_count: olderThan,
      younger_than_count: youngerThan,
      current_view_rank: row.current_view_rank,
      rank_note: olderThan === 0 && youngerThan === 0 ? "No Model 2 pairwise ordering evidence; tied by unresolved score." : "",
    };
  });
  const rankRows = rankByScore(rankBase);

  const evidenceRows = [...rows].sort((a, b) => {
    return a.source_group.localeCompare(b.source_group) || a.name.localeCompare(b.name);
  }).map((row) => ({
    source_group: row.source_group,
    catalog_id: row.catalog_id,
    name: row.name,
    biopsy_id: row.biopsy_id,
    sample_id: row.sample_id,
    sample_lookup_name: row.sample_lookup_name,
    sample_alignment: row.sample_alignment,
    biopsy_source: row.biopsy_source,
    biopsy_date: row.biopsy_date,
    age_class_raw: row.age_class_raw,
    age_class_status: row.age_class_status,
    mprf_total_years_seen: row.mprf_total_years_seen,
    mprf_first_sighting_date: row.mprf_first_sighting_date,
    mprf_15_year_mature_date: row.mprf_15_year_mature_date,
    model2_evidence: row.model2_evidence,
    model2_evidence_basis: row.model2_evidence_basis,
    current_view_rank: row.current_view_rank,
    review_note: row.source_group === "MPRF" ? "MPRF age class used in Model 2; maturity criteria behind that class remain uncertain." : "",
  }));

  const summaryCounts = {
    total: rows.length,
    hamer_total: rows.filter((r) => r.source_group === "HAMER").length,
    hamer_age_class_designated: rows.filter((r) => r.source_group === "HAMER" && ["mature", "immature"].includes(r.age_class_status)).length,
    hamer_age_class_unknown: rows.filter((r) => r.source_group === "HAMER" && r.age_class_status === "unknown").length,
    mprf_total: rows.filter((r) => r.source_group === "MPRF").length,
    mprf_age_class_designated: rows.filter((r) => r.source_group === "MPRF" && ["mature", "immature"].includes(r.age_class_status)).length,
    mprf_age_class_unknown: rows.filter((r) => r.source_group === "MPRF" && r.age_class_status === "unknown").length,
    mprf_over_15_years: rows.filter((r) => r.source_group === "MPRF" && Number(r.mprf_total_years_seen) > 15).length,
    mature_evidence: rows.filter((r) => ["mature", "mature_and_immature"].includes(r.model2_evidence)).length,
    immature_evidence: rows.filter((r) => ["immature", "mature_and_immature"].includes(r.model2_evidence)).length,
    no_model2_evidence: rows.filter((r) => !["mature", "immature", "mature_and_immature"].includes(r.model2_evidence)).length,
    pairwise_edges: edges.length,
  };

  const narrativeRows = [
    ["Model 2 purpose", "Rank the 83 Kona biopsy samples after introducing MPRF-provided age classes to the Model 1 framework, primarily for parent/child probability screening."],
    ["Why ranks repeat", "The model does not force an arbitrary total order. If two samples have the same Model 2 score, or no direct evidence separating them, they share a rank. The ranking spreadsheet has exactly 83 rows: one per biopsy sample."],
    ["HAMER rule", "For HAMER biopsy samples, the biopsy-linked manta age class is treated as high-confidence field evidence. Adult/mature = mature on the biopsy-linked sighting date. Juvenile/pup/immature = immature on that date. Unknown or blank = no Model 2 age evidence."],
    ["MPRF rule", "For MPRF biopsy samples, provided age class is now used. Adult/mature = mature on the MPRF first/effective sighting date. Juvenile/pup/immature = immature on the MPRF first/effective sighting date. If MPRF age class is unknown, >15-year resight history still supplies mature evidence as first sighting + 15 years."],
    ["Pairwise ranking rule", "A sample A is ordered older than sample B only when A has mature evidence dated before B has immature evidence. The score is older_than_count minus younger_than_count."],
    ["Scientific caution", "Model 2 is less conservative than Model 1 because MPRF age classes are included even though the criteria behind those classes are not fully documented. Treat changes from Model 1 as provisional until MPRF criteria can be reviewed."],
    ["Queried at UTC", QUERIED_AT],
  ];

  const summaryRows = [
    { metric: "Total Kona biopsy samples", value: summaryCounts.total, note: "Expected 83" },
    { metric: "HAMER samples", value: summaryCounts.hamer_total, note: "Based on biopsies.source != MPRF-import" },
    { metric: "HAMER age class designated", value: summaryCounts.hamer_age_class_designated, note: "Mature or immature" },
    { metric: "HAMER age class unknown", value: summaryCounts.hamer_age_class_unknown, note: "Blank/unknown/not interpretable" },
    { metric: "MPRF samples", value: summaryCounts.mprf_total, note: "Based on biopsies.source = MPRF-import" },
    { metric: "MPRF age class designated", value: summaryCounts.mprf_age_class_designated, note: "Mature or immature in provided MPRF age class" },
    { metric: "MPRF age class unknown", value: summaryCounts.mprf_age_class_unknown, note: "Blank/unknown/not interpretable" },
    { metric: "MPRF >15-year resight history", value: summaryCounts.mprf_over_15_years, note: "Used when MPRF age class is unknown/not decisive" },
    { metric: "Samples with mature evidence", value: summaryCounts.mature_evidence, note: "HAMER mature, MPRF mature, or MPRF >15 years" },
    { metric: "Samples with immature evidence", value: summaryCounts.immature_evidence, note: "HAMER or MPRF immature age class" },
    { metric: "Samples unresolved by Model 2", value: summaryCounts.no_model2_evidence, note: "No mature/immature Model 2 evidence" },
    { metric: "Pairwise older-than edges", value: summaryCounts.pairwise_edges, note: "Used to calculate score/rank" },
  ];

  const evidenceColumns = [
    "source_group", "catalog_id", "name", "biopsy_id", "sample_id", "sample_lookup_name", "sample_alignment",
    "biopsy_source", "biopsy_date", "age_class_raw", "age_class_status",
    "mprf_total_years_seen", "mprf_first_sighting_date", "mprf_15_year_mature_date",
    "model2_evidence", "model2_evidence_basis", "current_view_rank", "review_note",
  ];
  const rankColumns = [
    "model2_rank", "model2_score", "catalog_id", "name", "biopsy_id", "sample_id", "sample_lookup_name",
    "source_group", "model2_evidence", "mature_date", "immature_date",
    "older_than_count", "younger_than_count", "current_view_rank", "rank_note",
  ];

  const evidenceCsv = path.join(OUT_DIR, "kona_model2_evidence_by_source.csv");
  const ranksCsv = path.join(OUT_DIR, "kona_model2_ranks_83_samples.csv");
  const workbookPath = path.join(OUT_DIR, "kona_model2_mprf_age_classes_age_rank.xlsx");
  writeCsv(evidenceCsv, evidenceRows, evidenceColumns);
  writeCsv(ranksCsv, rankRows, rankColumns);

  const wb = makeWorkbook(evidenceRows, rankRows, narrativeRows, summaryRows);
  xlsx.writeFile(wb, workbookPath);

  console.log(JSON.stringify({
    queried_at_utc: QUERIED_AT,
    summaryCounts,
    outputs: { evidenceCsv, ranksCsv, workbookPath },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
