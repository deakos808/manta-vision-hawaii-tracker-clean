import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const PI_HAT_CSV =
  "/Users/littlemac/Dropbox/Work/HAMER/Research/Elasmobranchs/Manta Rays/2. Genetics/MPRF Manta Parentage Collaboration/Kona Biopsy Age Rankings/Genetics Results/Kona pi_hats.csv";
const MATRIX_WORKBOOK = "reports/population_age_model_sensitivity/population_age_model_sensitivity_tables.xlsx";
const OUT_DIR = "reports/kona_pi_hat_generation_alignment";
const JONATHAN_CROSSWALK = path.join(OUT_DIR, "jonathan_biopsy_crosswalk.csv");
const BIOPSY_CROSSWALK = path.join(OUT_DIR, "biopsy_crosswalk_snapshot.csv");
const OUTPUT_XLSX = path.join(OUT_DIR, "kona_pi_hat_generation_matrix_reconstructed.xlsx");

type MatrixRow = {
  Rank: number | string;
  Name: string;
  Sample_ID: string;
  "HAMER Catalog ID": number | string;
  "MPRF Catalog ID": string;
  "Minimum age": number | string;
  P: number | string;
  C: number | string;
  S: number | string;
  U: number | string;
  [key: string]: unknown;
};

type MatrixIndex = {
  sheetName: string;
  rows: MatrixRow[];
  bySample: Map<string, MatrixRow>;
  byHamerCatalog: Map<string, MatrixRow>;
  byMprfCatalog: Map<string, MatrixRow>;
  byName: Map<string, MatrixRow>;
  columnByName: Map<string, string>;
  sampleByColumn: Map<string, string>;
  catalogByColumn: Map<string, string>;
};

type PiHatRow = {
  "Sample ID A": string;
  "Manta Name A": string;
  "Sample ID B": string;
  "Manta Name B": string;
  PI_HAT: number;
};

type StagingRow = Record<string, string>;
type PairCode = "P" | "C" | "S" | "U" | "—" | "unmatched";

fs.mkdirSync(OUT_DIR, { recursive: true });

const piRows = readCsv(PI_HAT_CSV)
  .map((row) => ({
    "Sample ID A": clean(row["Sample ID A"]),
    "Manta Name A": clean(row["Manta Name A"]),
    "Sample ID B": clean(row["Sample ID B"]),
    "Manta Name B": clean(row["Manta Name B"]),
    PI_HAT: Number(row.PI_HAT),
  }))
  .filter((row) => Number.isFinite(row.PI_HAT));

const workbook = XLSX.readFile(MATRIX_WORKBOOK);
const biopsiedMatrix = buildMatrixIndex(workbook, "kona_biopsied_matrix");
const allMatrix = buildMatrixIndex(workbook, "kona_all_matrix");
const maturityScenarioMatrices = [
  { key: "low", label: "Low maturity ages", maleMaturityAgeYears: 5, femaleMaturityAgeYears: 8, matrix: buildMatrixIndex(workbook, "kona_bio_best_low_matrix") },
  { key: "midpoint", label: "Midpoint maturity ages", maleMaturityAgeYears: 6.5, femaleMaturityAgeYears: 11.5, matrix: buildMatrixIndex(workbook, "kona_bio_best_mid_matrix") },
  { key: "high", label: "High maturity ages", maleMaturityAgeYears: 8, femaleMaturityAgeYears: 15, matrix: buildMatrixIndex(workbook, "kona_bio_best_high_matrix") },
];
const stagingRows = readCsv(JONATHAN_CROSSWALK);
const biopsyRows = readCsv(BIOPSY_CROSSWALK);

const stagingBySample = new Map<string, StagingRow>();
for (const row of stagingRows) {
  for (const key of ["mprf_sample_number", "mprf_sample_number2", "jon_psn_sequence_number"]) {
    const value = normalizeId(row[key]);
    if (value) stagingBySample.set(value, row);
  }
}

const biopsyBySample = new Map<string, Record<string, string>>();
for (const row of biopsyRows) {
  for (const key of ["raw_sample_id", "lab_id"]) {
    const value = normalizeId(row[key]);
    if (value) biopsyBySample.set(value, row);
  }
}

const uniqueSequenceInputs = new Map<string, { sampleId: string; piHatName: string }>();
for (const row of piRows) {
  uniqueSequenceInputs.set(normalizeId(row["Sample ID A"]), {
    sampleId: row["Sample ID A"],
    piHatName: row["Manta Name A"],
  });
  uniqueSequenceInputs.set(normalizeId(row["Sample ID B"]), {
    sampleId: row["Sample ID B"],
    piHatName: row["Manta Name B"],
  });
}

const sequenceCrosswalk = [...uniqueSequenceInputs.values()]
  .sort((a, b) => a.sampleId.localeCompare(b.sampleId, undefined, { numeric: true }))
  .map((input) => resolveSequence(input.sampleId, input.piHatName));

const resolvedBySample = new Map(sequenceCrosswalk.map((row) => [normalizeId(row.piHatSampleId), row]));
const reconstructedPairs = piRows.map((pair) => comparePair(pair));
const strongPairs = reconstructedPairs.filter((row) => row.PI_HAT >= 0.35);
const summaryRows = summarizeRows(reconstructedPairs);
const pcsuSequenceMatrixRows = buildPcsuSequenceMatrixRows();
const pcsuSequenceLongRows = buildPcsuSequenceLongRows();
const pcsuProportionRows = buildPcsuProportionRows();
const maturitySensitivityRows = buildMaturitySensitivityRows();
const maturitySensitivitySummaryRows = buildMaturitySensitivitySummaryRows();
const maturityPcChangeRows = buildMaturityRelationshipChangeRows("P/C");
const maturitySChangeRows = buildMaturityRelationshipChangeRows("S");

writeCsv(path.join(OUT_DIR, "kona_pi_hat_sequence_matrix_crosswalk.csv"), sequenceCrosswalk);
writeCsv(path.join(OUT_DIR, "kona_pi_hat_generation_alignment_reconstructed_all_pairs.csv"), reconstructedPairs);
writeCsv(path.join(OUT_DIR, "kona_pi_hat_generation_alignment_reconstructed_strong_pairs.csv"), strongPairs);
writeCsv(path.join(OUT_DIR, "kona_pi_hat_generation_alignment_reconstructed_summary.csv"), summaryRows);
writeCsv(path.join(OUT_DIR, "kona_pi_hat_pcsu_proportions.csv"), pcsuProportionRows);
writeCsv(path.join(OUT_DIR, "kona_pi_hat_sample_id_pcsu_matrix_wide.csv"), pcsuSequenceMatrixRows);
writeCsv(path.join(OUT_DIR, "kona_pi_hat_sample_id_pcsu_matrix_long.csv"), pcsuSequenceLongRows);
writeCsv(path.join(OUT_DIR, "kona_pi_hat_maturity_sensitivity_all_pairs.csv"), maturitySensitivityRows);
writeCsv(path.join(OUT_DIR, "kona_pi_hat_maturity_sensitivity_summary.csv"), maturitySensitivitySummaryRows);
writeCsv(path.join(OUT_DIR, "kona_pi_hat_maturity_sensitivity_pc_changes.csv"), maturityPcChangeRows);
writeCsv(path.join(OUT_DIR, "kona_pi_hat_maturity_sensitivity_s_changes.csv"), maturitySChangeRows);
writeWorkbook();

console.log(`Unique PI_HAT sequences: ${sequenceCrosswalk.length}`);
console.log(`Mapped to biopsied matrix: ${sequenceCrosswalk.filter((row) => row.matrixScope === "biopsied").length}`);
console.log(`Mapped to all-mantas matrix only: ${sequenceCrosswalk.filter((row) => row.matrixScope === "all").length}`);
console.log(`Unresolved / no usable matrix row: ${sequenceCrosswalk.filter((row) => row.matrixScope === "unresolved").length}`);
console.log(`Strong PI_HAT pairs: ${strongPairs.length}`);
console.log(summaryRows);
console.log(`Wrote ${OUTPUT_XLSX}`);

function buildMatrixIndex(source: XLSX.WorkBook, sheetName: string): MatrixIndex {
  const rows = XLSX.utils.sheet_to_json<MatrixRow>(source.Sheets[sheetName], { defval: "" });
  const index: MatrixIndex = {
    sheetName,
    rows,
    bySample: new Map(),
    byHamerCatalog: new Map(),
    byMprfCatalog: new Map(),
    byName: new Map(),
    columnByName: new Map(),
    sampleByColumn: new Map(),
    catalogByColumn: new Map(),
  };

  for (const row of rows) {
    const sample = normalizeId(row.Sample_ID);
    const hamerCatalog = clean(row["HAMER Catalog ID"]);
    const mprfCatalog = normalizeMprfCatalog(row["MPRF Catalog ID"]);
    const name = normalizeName(row.Name);
    if (sample) index.bySample.set(sample, row);
    if (hamerCatalog) index.byHamerCatalog.set(hamerCatalog, row);
    if (mprfCatalog) index.byMprfCatalog.set(mprfCatalog, row);
    if (name) index.byName.set(name, row);
  }

  for (const key of Object.keys(rows[0] ?? {})) {
    if (!key.startsWith("#")) continue;
    const columnName = key.replace(/^#\d+\s+/, "");
    index.columnByName.set(normalizeName(columnName), key);
    const row = index.byName.get(normalizeName(columnName));
    if (row?.Sample_ID) index.sampleByColumn.set(normalizeId(row.Sample_ID), key);
    if (row?.["HAMER Catalog ID"]) index.catalogByColumn.set(clean(row["HAMER Catalog ID"]), key);
  }
  return index;
}

function resolveSequence(sampleId: string, piHatName: string) {
  const sampleKey = normalizeId(sampleId);
  const staging = stagingBySample.get(sampleKey) ?? null;
  const biopsy = biopsyBySample.get(sampleKey) ?? null;
  const matrixMatch = findBestMatrixRow(sampleId, piHatName, staging, biopsy);
  const matrixRow = matrixMatch?.row ?? null;
  const hasUsableMatrixRow = Boolean(matrixRow?.Name && matrixRow?.["HAMER Catalog ID"]);
  const matrixScope = hasUsableMatrixRow ? (matrixMatch?.scope ?? "unresolved") : "unresolved";

  return {
    piHatSampleId: sampleId,
    piHatName,
    jonathanSequenceId: staging?.jon_psn_sequence_number ?? biopsy?.lab_id ?? "",
    stagingSampleId: staging?.mprf_sample_number ?? "",
    stagingSampleId2: staging?.mprf_sample_number2 ?? "",
    stagingName: staging?.jon_manta_name ?? "",
    stagingHamerName: staging?.hamer_manta_name ?? "",
    stagingMprfCatalogId: staging?.pk_mprf_catalog_id ?? "",
    stagingCatalogId: staging?.pk_catalog_id ?? "",
    stagingBiopsyId: staging?.pk_biopsy_id ?? "",
    finalBiopsyId: biopsy?.pk_biopsy_id ?? "",
    finalBiopsyCatalogId: biopsy?.fk_catalog_id ?? "",
    finalBiopsySampleId: biopsy?.raw_sample_id ?? "",
    finalBiopsySequenceId: biopsy?.lab_id ?? "",
    matrixScope,
    matrixRank: matrixRow?.Rank ?? "",
    matrixName: matrixRow?.Name ?? "",
    matrixSampleId: matrixRow?.Sample_ID ?? "",
    matrixHamerCatalogId: matrixRow?.["HAMER Catalog ID"] ?? "",
    matrixMprfCatalogId: matrixRow?.["MPRF Catalog ID"] ?? "",
    matrixMinimumAge: matrixRow?.["Minimum age"] ?? "",
    mappingMethod: hasUsableMatrixRow ? matrixMatch?.method ?? "" : unresolvedReason(sampleId, piHatName, staging, biopsy, matrixMatch?.row ?? null),
  };
}

function findBestMatrixRow(sampleId: string, piHatName: string, staging: StagingRow | null, biopsy: Record<string, string> | null) {
  const candidates: Array<{ scope: "biopsied" | "all"; method: string; row: MatrixRow | undefined }> = [];
  const add = (scope: "biopsied" | "all", method: string, row: MatrixRow | undefined) => {
    if (row) candidates.push({ scope, method, row });
  };
  const matrices: Array<["biopsied" | "all", MatrixIndex]> = [["biopsied", biopsiedMatrix], ["all", allMatrix]];

  for (const [scope, matrix] of matrices) add(scope, "matrix Sample_ID exact", matrix.bySample.get(normalizeId(sampleId)));
  if (biopsy?.fk_catalog_id) {
    for (const [scope, matrix] of matrices) add(scope, "final biopsies fk_catalog_id", matrix.byHamerCatalog.get(clean(biopsy.fk_catalog_id)));
  }
  if (staging?.pk_catalog_id) {
    for (const [scope, matrix] of matrices) add(scope, "Jonathan staging pk_catalog_id", matrix.byHamerCatalog.get(clean(staging.pk_catalog_id)));
  }
  if (staging?.pk_mprf_catalog_id) {
    const mprf = normalizeMprfCatalog(staging.pk_mprf_catalog_id);
    for (const [scope, matrix] of matrices) add(scope, "Jonathan staging pk_mprf_catalog_id", matrix.byMprfCatalog.get(mprf));
  }
  for (const name of [piHatName, staging?.jon_manta_name, staging?.hamer_manta_name]) {
    const normalized = normalizeName(name);
    if (!normalized) continue;
    for (const [scope, matrix] of matrices) {
      add(scope, `name exact: ${name}`, matrix.byName.get(normalized));
      const loose = findLooseNameMatch(matrix.rows, normalized);
      add(scope, `name loose: ${name}`, loose);
    }
  }

  return candidates.find((candidate) => candidate.scope === "biopsied" && candidate.row.Name && candidate.row["HAMER Catalog ID"])
    ?? candidates.find((candidate) => candidate.scope === "all" && candidate.row.Name && candidate.row["HAMER Catalog ID"])
    ?? candidates[0]
    ?? null;
}

function unresolvedReason(sampleId: string, piHatName: string, staging: StagingRow | null, biopsy: Record<string, string> | null, matrixRow: MatrixRow | null) {
  if (matrixRow && !matrixRow.Name) return "matrix placeholder row only; no catalog/name/age";
  if (staging && !staging.pk_catalog_id && !staging.pk_mprf_catalog_id) return "Jonathan staging row exists but has no catalog link";
  if (staging) return "Jonathan staging row exists but no matching matrix row";
  if (biopsy) return "final biopsy row exists but no matching matrix row";
  return `no staging/final biopsy/matrix match for ${sampleId || piHatName}`;
}

function findLooseNameMatch(rows: MatrixRow[], normalizedName: string) {
  if (!normalizedName || normalizedName.length < 4) return undefined;
  return rows.find((row) => {
    const matrixName = normalizeName(row.Name);
    return matrixName && (matrixName === normalizedName || matrixName.includes(normalizedName) || normalizedName.includes(matrixName));
  });
}

function comparePair(pair: PiHatRow) {
  const seqA = resolvedBySample.get(normalizeId(pair["Sample ID A"]));
  const seqB = resolvedBySample.get(normalizeId(pair["Sample ID B"]));
  const matrix = chooseMatrixForPair(seqA, seqB);
  const rowA = matrix ? findRowInMatrix(matrix, seqA) : null;
  const rowB = matrix ? findRowInMatrix(matrix, seqB) : null;
  const codeAtoB = matrix && rowA && rowB ? matrixCode(matrix, rowA, rowB) : "unmatched";
  const codeBtoA = matrix && rowA && rowB ? matrixCode(matrix, rowB, rowA) : "unmatched";
  const generationPrediction = summarizeCodes(codeAtoB, codeBtoA);
  return {
    sampleIdA: pair["Sample ID A"],
    nameA: pair["Manta Name A"],
    sampleIdB: pair["Sample ID B"],
    nameB: pair["Manta Name B"],
    PI_HAT: round(pair.PI_HAT, 4),
    comparisonMatrixScope: matrix?.sheetName ?? "unmatched",
    mappingStatusA: seqA?.matrixScope ?? "unresolved",
    mappingMethodA: seqA?.mappingMethod ?? "",
    matrixNameA: seqA?.matrixName ?? "",
    matrixSampleIdA: seqA?.matrixSampleId ?? "",
    jonathanSequenceIdA: seqA?.jonathanSequenceId ?? "",
    hamerCatalogIdA: seqA?.matrixHamerCatalogId ?? "",
    mprfCatalogIdA: seqA?.matrixMprfCatalogId ?? "",
    minimumAgeA: seqA?.matrixMinimumAge ?? "",
    mappingStatusB: seqB?.matrixScope ?? "unresolved",
    mappingMethodB: seqB?.mappingMethod ?? "",
    matrixNameB: seqB?.matrixName ?? "",
    matrixSampleIdB: seqB?.matrixSampleId ?? "",
    jonathanSequenceIdB: seqB?.jonathanSequenceId ?? "",
    hamerCatalogIdB: seqB?.matrixHamerCatalogId ?? "",
    mprfCatalogIdB: seqB?.matrixMprfCatalogId ?? "",
    minimumAgeB: seqB?.matrixMinimumAge ?? "",
    codeAtoB,
    codeBtoA,
    generationPrediction,
    alignmentCategory: alignmentCategory(pair.PI_HAT, codeAtoB, codeBtoA),
    interpretation: interpret(pair.PI_HAT, codeAtoB, codeBtoA, seqA, seqB),
  };
}

function chooseMatrixForPair(seqA: ReturnType<typeof resolveSequence> | undefined, seqB: ReturnType<typeof resolveSequence> | undefined) {
  if (!seqA || !seqB) return null;
  if (seqA.matrixScope === "biopsied" && seqB.matrixScope === "biopsied") return biopsiedMatrix;
  if (seqA.matrixScope !== "unresolved" && seqB.matrixScope !== "unresolved") return allMatrix;
  return null;
}

function findRowInMatrix(matrix: MatrixIndex, seq: ReturnType<typeof resolveSequence> | undefined) {
  if (!seq) return null;
  return matrix.bySample.get(normalizeId(seq.matrixSampleId))
    ?? matrix.byHamerCatalog.get(clean(seq.matrixHamerCatalogId))
    ?? matrix.byMprfCatalog.get(normalizeMprfCatalog(seq.matrixMprfCatalogId))
    ?? matrix.byName.get(normalizeName(seq.matrixName))
    ?? null;
}

function matrixCode(matrix: MatrixIndex, row: MatrixRow, column: MatrixRow): PairCode {
  if (clean(row["HAMER Catalog ID"]) && clean(row["HAMER Catalog ID"]) === clean(column["HAMER Catalog ID"])) return "—";
  const columnKey = matrix.sampleByColumn.get(normalizeId(column.Sample_ID))
    ?? matrix.catalogByColumn.get(clean(column["HAMER Catalog ID"]))
    ?? matrix.columnByName.get(normalizeName(column.Name));
  const code = columnKey ? String(row[columnKey] ?? "") : "";
  return ["P", "C", "S", "U", "—"].includes(code) ? code as PairCode : "unmatched";
}

function summarizeCodes(codeAtoB: PairCode, codeBtoA: PairCode) {
  if (codeAtoB === "unmatched" || codeBtoA === "unmatched") return "unmatched";
  if (codeAtoB === "P" || codeBtoA === "C") return "A could be parent of B";
  if (codeBtoA === "P" || codeAtoB === "C") return "B could be parent of A";
  if (codeAtoB === "S" || codeBtoA === "S") return "same-generation compatible";
  if (codeAtoB === "U" || codeBtoA === "U") return "age evidence unknown";
  return "same animal/other";
}

function alignmentCategory(piHat: number, codeAtoB: PairCode, codeBtoA: PairCode) {
  if (codeAtoB === "unmatched" || codeBtoA === "unmatched") return "unmatched";
  if (piHat < 0.35) return "genetics_not_close";
  if (codeAtoB === "P" || codeBtoA === "P" || codeAtoB === "C" || codeBtoA === "C") return "genetics_close_age_pc";
  if (codeAtoB === "S" || codeBtoA === "S") return "genetics_close_age_s";
  if (codeAtoB === "U" || codeBtoA === "U") return "genetics_close_age_unknown";
  return "genetics_close_other";
}

function interpret(
  piHat: number,
  codeAtoB: PairCode,
  codeBtoA: PairCode,
  seqA: ReturnType<typeof resolveSequence> | undefined,
  seqB: ReturnType<typeof resolveSequence> | undefined,
) {
  if (!seqA || !seqB || codeAtoB === "unmatched" || codeBtoA === "unmatched") {
    return "One or both samples still lack a usable matrix identity; resolve identifiers before biological interpretation.";
  }
  if (piHat >= 0.75) return "Very high PI_HAT; check duplicate/replicate/sample identity before interpreting biological kinship.";
  if (piHat >= 0.35 && (codeAtoB === "P" || codeBtoA === "P" || codeAtoB === "C" || codeBtoA === "C")) {
    return "Genetics suggests close kinship and age evidence is compatible with a directional parent-child hypothesis.";
  }
  if (piHat >= 0.35 && (codeAtoB === "S" || codeBtoA === "S")) {
    return "Genetics suggests close kinship and age evidence favors same-generation/full-sibling compatibility.";
  }
  if (piHat >= 0.35 && (codeAtoB === "U" || codeBtoA === "U")) {
    return "Genetics suggests close kinship, but age evidence is insufficient to choose parent-child versus sibling.";
  }
  return "Genetics does not indicate a strong close-kin pair at the >=0.35 screen.";
}

function summarizeRows(rows: ReturnType<typeof comparePair>[]) {
  return [0, 0.35, 0.45, 0.5, 0.75].map((threshold) => {
    const selected = threshold ? rows.filter((row) => row.PI_HAT >= threshold) : rows;
    const matched = selected.filter((row) => row.alignmentCategory !== "unmatched");
    return {
      threshold: threshold ? `PI_HAT >= ${threshold}` : "all pairs",
      pairs: selected.length,
      matchedPairs: matched.length,
      unmatchedPairs: selected.length - matched.length,
      mappedToBiopsiedMatrixPairs: selected.filter((row) => row.comparisonMatrixScope === "kona_biopsied_matrix").length,
      mappedToAllMatrixPairs: selected.filter((row) => row.comparisonMatrixScope === "kona_all_matrix").length,
      ageCompatiblePC: matched.filter((row) => row.alignmentCategory === "genetics_close_age_pc").length,
      ageCompatibleS: matched.filter((row) => row.alignmentCategory === "genetics_close_age_s").length,
      ageUnknown: matched.filter((row) => row.alignmentCategory === "genetics_close_age_unknown").length,
      veryHighPiHat: selected.filter((row) => row.PI_HAT >= 0.75).length,
      meanPiHat: round(mean(selected.map((row) => row.PI_HAT)), 4),
    };
  });
}

function buildPcsuSequenceMatrixRows() {
  return sequenceCrosswalk.map((rowSeq) => {
    const row: Record<string, string | number> = {
      rowPiHatSampleId: rowSeq.piHatSampleId,
      rowPiHatName: rowSeq.piHatName,
      rowJonathanSequenceId: rowSeq.jonathanSequenceId,
      rowMatrixScope: rowSeq.matrixScope,
      rowMatrixRank: rowSeq.matrixRank,
      rowMatrixName: rowSeq.matrixName,
      rowMatrixSampleId: rowSeq.matrixSampleId,
      rowHamerCatalogId: rowSeq.matrixHamerCatalogId,
      rowMprfCatalogId: rowSeq.matrixMprfCatalogId,
      rowMinimumAge: rowSeq.matrixMinimumAge,
    };
    for (const colSeq of sequenceCrosswalk) {
      row[pcsuColumnHeader(colSeq)] = codeForSequences(rowSeq, colSeq);
    }
    return row;
  });
}

function buildPcsuSequenceLongRows() {
  const rows: Array<Record<string, string | number>> = [];
  for (const rowSeq of sequenceCrosswalk) {
    for (const colSeq of sequenceCrosswalk) {
      rows.push({
        rowPiHatSampleId: rowSeq.piHatSampleId,
        rowPiHatName: rowSeq.piHatName,
        rowJonathanSequenceId: rowSeq.jonathanSequenceId,
        rowMatrixScope: rowSeq.matrixScope,
        rowMatrixRank: rowSeq.matrixRank,
        rowMatrixName: rowSeq.matrixName,
        rowMatrixSampleId: rowSeq.matrixSampleId,
        rowHamerCatalogId: rowSeq.matrixHamerCatalogId,
        rowMprfCatalogId: rowSeq.matrixMprfCatalogId,
        rowMinimumAge: rowSeq.matrixMinimumAge,
        columnPiHatSampleId: colSeq.piHatSampleId,
        columnPiHatName: colSeq.piHatName,
        columnJonathanSequenceId: colSeq.jonathanSequenceId,
        columnMatrixScope: colSeq.matrixScope,
        columnMatrixRank: colSeq.matrixRank,
        columnMatrixName: colSeq.matrixName,
        columnMatrixSampleId: colSeq.matrixSampleId,
        columnHamerCatalogId: colSeq.matrixHamerCatalogId,
        columnMprfCatalogId: colSeq.matrixMprfCatalogId,
        columnMinimumAge: colSeq.matrixMinimumAge,
        pcsuCode: codeForSequences(rowSeq, colSeq),
      });
    }
  }
  return rows;
}

function buildPcsuProportionRows() {
  const scopes = [
    { label: "All PI_HAT sample matrix cells", rows: pcsuSequenceLongRows.map((row) => ({ pcsuCode: cellCategoryCode(String(row.pcsuCode)) })) },
    {
      label: "Mapped PI_HAT sample matrix cells",
      rows: pcsuSequenceLongRows
        .filter((row) => row.pcsuCode !== "unmatched")
        .map((row) => ({ pcsuCode: cellCategoryCode(String(row.pcsuCode)) })),
    },
    { label: "All genetic pair comparisons", rows: reconstructedPairs.map((row) => ({ pcsuCode: pairCategoryCode(row.codeAtoB, row.codeBtoA) })) },
    {
      label: "Mapped genetic pair comparisons",
      rows: reconstructedPairs
        .filter((row) => row.codeAtoB !== "unmatched" && row.codeBtoA !== "unmatched")
        .map((row) => ({ pcsuCode: pairCategoryCode(row.codeAtoB, row.codeBtoA) })),
    },
    {
      label: "Strong genetic pairs (PI_HAT >= 0.35)",
      rows: strongPairs.map((row) => ({ pcsuCode: pairCategoryCode(row.codeAtoB, row.codeBtoA) })),
    },
    {
      label: "Mapped strong genetic pairs (PI_HAT >= 0.35)",
      rows: strongPairs
        .filter((row) => row.codeAtoB !== "unmatched" && row.codeBtoA !== "unmatched")
        .map((row) => ({ pcsuCode: pairCategoryCode(row.codeAtoB, row.codeBtoA) })),
    },
  ];
  return scopes.map((scope) => {
    const total = scope.rows.length;
    const count = (code: string) => scope.rows.filter((row) => row.pcsuCode === code).length;
    const pc = count("P/C");
    const s = count("S");
    const u = count("U");
    const unmatched = count("unmatched");
    const same = count("—");
    return {
      scope: scope.label,
      total,
      pcCount: pc,
      pcProportion: proportion(pc, total),
      sCount: s,
      sProportion: proportion(s, total),
      uCount: u,
      uProportion: proportion(u, total),
      unmatchedCount: unmatched,
      unmatchedProportion: proportion(unmatched, total),
      sameAnimalCount: same,
      sameAnimalProportion: proportion(same, total),
    };
  });
}

function buildMaturitySensitivityRows() {
  return maturityScenarioMatrices.flatMap((scenario) =>
    piRows.map((pair) => comparePairForScenario(pair, scenario)),
  );
}

function comparePairForScenario(pair: PiHatRow, scenario: (typeof maturityScenarioMatrices)[number]) {
  const seqA = resolvedBySample.get(normalizeId(pair["Sample ID A"]));
  const seqB = resolvedBySample.get(normalizeId(pair["Sample ID B"]));
  const rowA = findRowInMatrix(scenario.matrix, seqA);
  const rowB = findRowInMatrix(scenario.matrix, seqB);
  const codeAtoB = rowA && rowB ? matrixCode(scenario.matrix, rowA, rowB) : "unmatched";
  const codeBtoA = rowA && rowB ? matrixCode(scenario.matrix, rowB, rowA) : "unmatched";
  return {
    maturityVariant: scenario.key,
    maturityLabel: scenario.label,
    maleMaturityAgeYears: scenario.maleMaturityAgeYears,
    femaleMaturityAgeYears: scenario.femaleMaturityAgeYears,
    sampleIdA: pair["Sample ID A"],
    nameA: pair["Manta Name A"],
    matrixNameA: seqA?.matrixName ?? "",
    matrixSampleIdA: seqA?.matrixSampleId ?? "",
    hamerCatalogIdA: seqA?.matrixHamerCatalogId ?? "",
    mprfCatalogIdA: seqA?.matrixMprfCatalogId ?? "",
    minimumAgeA: rowA?.["Minimum age"] ?? seqA?.matrixMinimumAge ?? "",
    sampleIdB: pair["Sample ID B"],
    nameB: pair["Manta Name B"],
    matrixNameB: seqB?.matrixName ?? "",
    matrixSampleIdB: seqB?.matrixSampleId ?? "",
    hamerCatalogIdB: seqB?.matrixHamerCatalogId ?? "",
    mprfCatalogIdB: seqB?.matrixMprfCatalogId ?? "",
    minimumAgeB: rowB?.["Minimum age"] ?? seqB?.matrixMinimumAge ?? "",
    PI_HAT: round(pair.PI_HAT, 4),
    codeAtoB,
    codeBtoA,
    pairCategory: pairCategoryCode(codeAtoB, codeBtoA),
    generationPrediction: summarizeCodes(codeAtoB, codeBtoA),
    isStrongPiHat: pair.PI_HAT >= 0.35,
  };
}

function buildMaturitySensitivitySummaryRows() {
  return maturityScenarioMatrices.flatMap((scenario) => {
    const rows = maturitySensitivityRows.filter((row) => row.maturityVariant === scenario.key);
    return [
      summarizeMaturitySensitivityScope(rows, scenario, "all PI_HAT pairs"),
      summarizeMaturitySensitivityScope(rows.filter((row) => row.isStrongPiHat), scenario, "strong PI_HAT pairs >= 0.35"),
    ];
  });
}

function summarizeMaturitySensitivityScope(rows: ReturnType<typeof comparePairForScenario>[], scenario: (typeof maturityScenarioMatrices)[number], scope: string) {
  const matched = rows.filter((row) => row.pairCategory !== "unmatched");
  const count = (category: string) => matched.filter((row) => row.pairCategory === category).length;
  return {
    maturityVariant: scenario.key,
    maturityLabel: scenario.label,
    maleMaturityAgeYears: scenario.maleMaturityAgeYears,
    femaleMaturityAgeYears: scenario.femaleMaturityAgeYears,
    scope,
    totalPairs: rows.length,
    mappedPairs: matched.length,
    unmatchedPairs: rows.length - matched.length,
    pcPairs: count("P/C"),
    sPairs: count("S"),
    uPairs: count("U"),
    sameAnimalPairs: count("—"),
    pcProportionMapped: proportion(count("P/C"), matched.length),
    sProportionMapped: proportion(count("S"), matched.length),
    uProportionMapped: proportion(count("U"), matched.length),
  };
}

function buildMaturityRelationshipChangeRows(category: "P/C" | "S") {
  const midpointRows = maturitySensitivityRows.filter((row) => row.maturityVariant === "midpoint" && row.isStrongPiHat && row.pairCategory === category);
  const midpointKeys = new Set(midpointRows.map(maturityPairKey));
  return maturityScenarioMatrices
    .filter((scenario) => scenario.key !== "midpoint")
    .flatMap((scenario) => {
      const activeRows = maturitySensitivityRows.filter((row) => row.maturityVariant === scenario.key && row.isStrongPiHat && row.pairCategory === category);
      const activeKeys = new Set(activeRows.map(maturityPairKey));
      const added = activeRows
        .filter((row) => !midpointKeys.has(maturityPairKey(row)))
        .map((row) => ({ changeVsMidpoint: "added", relationshipType: category, ...row }));
      const removed = midpointRows
        .filter((row) => !activeKeys.has(maturityPairKey(row)))
        .map((row) => ({
          changeVsMidpoint: "removed",
          relationshipType: category,
          maturityVariant: scenario.key,
          maturityLabel: scenario.label,
          maleMaturityAgeYears: scenario.maleMaturityAgeYears,
          femaleMaturityAgeYears: scenario.femaleMaturityAgeYears,
          sampleIdA: row.sampleIdA,
          nameA: row.nameA,
          matrixNameA: row.matrixNameA,
          matrixSampleIdA: row.matrixSampleIdA,
          hamerCatalogIdA: row.hamerCatalogIdA,
          mprfCatalogIdA: row.mprfCatalogIdA,
          minimumAgeA: row.minimumAgeA,
          sampleIdB: row.sampleIdB,
          nameB: row.nameB,
          matrixNameB: row.matrixNameB,
          matrixSampleIdB: row.matrixSampleIdB,
          hamerCatalogIdB: row.hamerCatalogIdB,
          mprfCatalogIdB: row.mprfCatalogIdB,
          minimumAgeB: row.minimumAgeB,
          PI_HAT: row.PI_HAT,
          codeAtoB: row.codeAtoB,
          codeBtoA: row.codeBtoA,
          pairCategory: row.pairCategory,
          generationPrediction: row.generationPrediction,
          isStrongPiHat: row.isStrongPiHat,
        }));
      return [...added, ...removed];
    });
}

function maturityPairKey(row: ReturnType<typeof comparePairForScenario>) {
  return [normalizeId(row.sampleIdA), normalizeId(row.sampleIdB)].sort().join("<->");
}

function codeForSequences(rowSeq: ReturnType<typeof resolveSequence>, colSeq: ReturnType<typeof resolveSequence>) {
  const matrix = chooseMatrixForPair(rowSeq, colSeq);
  const row = matrix ? findRowInMatrix(matrix, rowSeq) : null;
  const col = matrix ? findRowInMatrix(matrix, colSeq) : null;
  return matrix && row && col ? matrixCode(matrix, row, col) : "unmatched";
}

function pairCategoryCode(codeAtoB: PairCode, codeBtoA: PairCode) {
  if (codeAtoB === "unmatched" || codeBtoA === "unmatched") return "unmatched";
  if (codeAtoB === "—" || codeBtoA === "—") return "—";
  if (codeAtoB === "P" || codeAtoB === "C" || codeBtoA === "P" || codeBtoA === "C") return "P/C";
  if (codeAtoB === "S" || codeBtoA === "S") return "S";
  if (codeAtoB === "U" || codeBtoA === "U") return "U";
  return "other";
}

function cellCategoryCode(code: string) {
  if (code === "P" || code === "C") return "P/C";
  return code;
}

function pcsuColumnHeader(seq: ReturnType<typeof resolveSequence>) {
  const name = seq.matrixName || seq.piHatName || "unresolved";
  return `${seq.piHatSampleId} | ${name}`;
}

function proportion(count: number, total: number) {
  return total ? round(count / total, 4) : null;
}

function writeWorkbook() {
  const output = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(output, XLSX.utils.json_to_sheet(summaryRows), "Summary");
  XLSX.utils.book_append_sheet(output, XLSX.utils.json_to_sheet(pcsuProportionRows), "PCSU proportions");
  XLSX.utils.book_append_sheet(output, XLSX.utils.json_to_sheet(maturitySensitivitySummaryRows), "Maturity summary");
  XLSX.utils.book_append_sheet(output, XLSX.utils.json_to_sheet(sequenceCrosswalk), "Sequence crosswalk");
  XLSX.utils.book_append_sheet(output, XLSX.utils.json_to_sheet(pcsuSequenceMatrixRows), "PI_HAT PCSU matrix");
  XLSX.utils.book_append_sheet(output, XLSX.utils.json_to_sheet(pcsuSequenceLongRows), "PI_HAT PCSU long");
  XLSX.utils.book_append_sheet(
    output,
    XLSX.utils.json_to_sheet(maturitySensitivityRows.filter((row) => row.isStrongPiHat)),
    "Strong maturity sensitivity",
  );
  XLSX.utils.book_append_sheet(
    output,
    XLSX.utils.json_to_sheet(maturitySensitivityRows.filter((row) => row.isStrongPiHat && row.pairCategory === "P/C")),
    "Strong P-C by maturity",
  );
  XLSX.utils.book_append_sheet(
    output,
    XLSX.utils.json_to_sheet(maturitySensitivityRows.filter((row) => row.isStrongPiHat && row.pairCategory === "S")),
    "Strong S by maturity",
  );
  XLSX.utils.book_append_sheet(output, XLSX.utils.json_to_sheet(maturityPcChangeRows), "Strong P-C changes");
  XLSX.utils.book_append_sheet(output, XLSX.utils.json_to_sheet(maturitySChangeRows), "Strong S changes");
  XLSX.utils.book_append_sheet(output, XLSX.utils.json_to_sheet(strongPairs), "Strong pairs");
  XLSX.utils.book_append_sheet(output, XLSX.utils.json_to_sheet(reconstructedPairs), "All PI_HAT pairs");
  XLSX.writeFile(output, OUTPUT_XLSX);
}

function readCsv(filePath: string) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function writeCsv(filePath: string, rows: any[]) {
  const headers = Object.keys(rows[0] ?? {});
  const lines = [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))];
  fs.writeFileSync(filePath, lines.join("\n"));
}

function csvEscape(value: unknown) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeId(value: unknown) {
  return clean(value).replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function normalizeName(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeMprfCatalog(value: unknown) {
  const cleaned = clean(value);
  const digits = cleaned.match(/\d+/)?.[0] ?? "";
  return digits ? String(Number(digits)) : "";
}

function mean(values: number[]) {
  const cleanValues = values.filter(Number.isFinite);
  return cleanValues.length ? cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length : null;
}

function round(value: number | null | undefined, decimals = 1) {
  if (value == null || !Number.isFinite(value)) return null;
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}
