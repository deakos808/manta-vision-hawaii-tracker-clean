import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const PI_HAT_CSV = "/Users/littlemac/Dropbox/Work/HAMER/Research/Elasmobranchs/Manta Rays/2. Genetics/MPRF Manta Parentage Collaboration/Kona Biopsy Age Rankings/Genetics Results/Kona pi_hats.csv";
const MATRIX_WORKBOOK = "reports/population_age_model_sensitivity/population_age_model_sensitivity_tables.xlsx";
const OUT_DIR = "reports/kona_pi_hat_generation_alignment";

type MatrixRow = {
  Rank: number;
  Name: string;
  Sample_ID: string;
  "HAMER Catalog ID": number | string;
  "MPRF Catalog ID": string;
  "Minimum age": number;
  P: number;
  C: number;
  S: number;
  U: number;
  [key: string]: unknown;
};

type PiHatRow = {
  "Sample ID A": string;
  "Manta Name A": string;
  "Sample ID B": string;
  "Manta Name B": string;
  PI_HAT: number;
};

type PairCode = "P" | "C" | "S" | "U" | "—" | "unmatched";

fs.mkdirSync(OUT_DIR, { recursive: true });

const piRows = readCsv(PI_HAT_CSV).map((row) => ({
  "Sample ID A": clean(row["Sample ID A"]),
  "Manta Name A": clean(row["Manta Name A"]),
  "Sample ID B": clean(row["Sample ID B"]),
  "Manta Name B": clean(row["Manta Name B"]),
  PI_HAT: Number(row.PI_HAT),
})).filter((row) => Number.isFinite(row.PI_HAT));

const workbook = XLSX.readFile(MATRIX_WORKBOOK);
const matrixRows = XLSX.utils.sheet_to_json<MatrixRow>(workbook.Sheets.kona_biopsied_matrix, { defval: "" });
const rowBySample = new Map<string, MatrixRow>();
const rowByName = new Map<string, MatrixRow>();
matrixRows.forEach((row) => {
  const sample = normalizeId(row.Sample_ID);
  if (sample) rowBySample.set(sample, row);
  rowByName.set(normalizeName(row.Name), row);
});

const columnByName = new Map<string, string>();
const sampleByColumn = new Map<string, string>();
for (const key of Object.keys(matrixRows[0] ?? {})) {
  if (!key.startsWith("#")) continue;
  const name = key.replace(/^#\d+\s+/, "");
  columnByName.set(normalizeName(name), key);
  const row = rowByName.get(normalizeName(name));
  if (row?.Sample_ID) sampleByColumn.set(normalizeId(row.Sample_ID), key);
}

const comparisons = piRows.map((pair) => comparePair(pair));
const thresholds = [0.35, 0.45, 0.5, 0.75];
const summaryRows = thresholds.map((threshold) => summarize(comparisons.filter((row) => row.PI_HAT >= threshold), `PI_HAT >= ${threshold}`));
summaryRows.push(summarize(comparisons, "all pairs"));

const strongRows = comparisons.filter((row) => row.PI_HAT >= 0.35);
const unmatchedStrongRows = strongRows.filter((row) => row.alignmentCategory === "unmatched");
const alignedStrongRows = strongRows.filter((row) => row.alignmentCategory !== "unmatched");
const notableRows = [
  ...strongRows.filter((row) => row.alignmentCategory === "genetics_close_age_pc"),
  ...strongRows.filter((row) => row.alignmentCategory === "genetics_close_age_s"),
  ...strongRows.filter((row) => row.alignmentCategory === "genetics_close_age_unknown").slice(0, 30),
];

writeCsv(path.join(OUT_DIR, "kona_pi_hat_generation_alignment_all_pairs.csv"), comparisons);
writeCsv(path.join(OUT_DIR, "kona_pi_hat_generation_alignment_strong_pairs.csv"), strongRows);
writeCsv(path.join(OUT_DIR, "kona_pi_hat_generation_alignment_summary.csv"), summaryRows);
writeMarkdownReport(summaryRows, alignedStrongRows, unmatchedStrongRows, notableRows);

console.log(`Compared ${comparisons.length} pi-hat pairs.`);
console.log(`Strong pairs >=0.35: ${strongRows.length}; matched: ${alignedStrongRows.length}; unmatched: ${unmatchedStrongRows.length}.`);
console.log(summaryRows);
console.log(`Wrote ${OUT_DIR}`);

function comparePair(pair: PiHatRow) {
  const rowA = findMatrixRow(pair["Sample ID A"], pair["Manta Name A"]);
  const rowB = findMatrixRow(pair["Sample ID B"], pair["Manta Name B"]);
  const codeAtoB = rowA && rowB ? matrixCode(rowA, rowB) : "unmatched";
  const codeBtoA = rowA && rowB ? matrixCode(rowB, rowA) : "unmatched";
  const generationPrediction = summarizeCodes(codeAtoB, codeBtoA);
  return {
    sampleIdA: pair["Sample ID A"],
    nameA: pair["Manta Name A"],
    sampleIdB: pair["Sample ID B"],
    nameB: pair["Manta Name B"],
    PI_HAT: round(pair.PI_HAT, 4),
    rankA: rowA?.Rank ?? null,
    matrixNameA: rowA?.Name ?? null,
    hamerCatalogIdA: rowA?.["HAMER Catalog ID"] ?? null,
    minimumAgeA: rowA?.["Minimum age"] ?? null,
    rankB: rowB?.Rank ?? null,
    matrixNameB: rowB?.Name ?? null,
    hamerCatalogIdB: rowB?.["HAMER Catalog ID"] ?? null,
    minimumAgeB: rowB?.["Minimum age"] ?? null,
    codeAtoB,
    codeBtoA,
    generationPrediction,
    alignmentCategory: alignmentCategory(pair.PI_HAT, codeAtoB, codeBtoA),
    interpretation: interpret(pair.PI_HAT, codeAtoB, codeBtoA),
  };
}

function findMatrixRow(sampleId: string, name: string) {
  return rowBySample.get(normalizeId(sampleId)) ?? rowByName.get(normalizeName(name)) ?? null;
}

function matrixCode(row: MatrixRow, column: MatrixRow): PairCode {
  if (normalizeId(row.Sample_ID) && normalizeId(row.Sample_ID) === normalizeId(column.Sample_ID)) return "—";
  const columnKey = sampleByColumn.get(normalizeId(column.Sample_ID)) ?? columnByName.get(normalizeName(column.Name));
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

function interpret(piHat: number, codeAtoB: PairCode, codeBtoA: PairCode) {
  if (codeAtoB === "unmatched" || codeBtoA === "unmatched") return "One or both samples were not matched to the Kona biopsied generation matrix.";
  if (piHat >= 0.75) return "Very high PI_HAT; check for duplicate/replicate/very close identity issue before interpreting as biological kinship.";
  if (piHat >= 0.35 && (codeAtoB === "P" || codeBtoA === "P" || codeAtoB === "C" || codeBtoA === "C")) return "Genetics suggests close kinship and age evidence is compatible with a directional parent-child hypothesis.";
  if (piHat >= 0.35 && (codeAtoB === "S" || codeBtoA === "S")) return "Genetics suggests close kinship and age evidence favors same-generation/full-sibling compatibility over parent-child.";
  if (piHat >= 0.35 && (codeAtoB === "U" || codeBtoA === "U")) return "Genetics suggests close kinship, but age evidence is insufficient to choose parent-child vs sibling.";
  return "Genetics does not indicate a strong close-kin pair at the >=0.35 screen.";
}

function summarize(rows: ReturnType<typeof comparePair>[], label: string) {
  const matched = rows.filter((row) => row.alignmentCategory !== "unmatched");
  return {
    threshold: label,
    pairs: rows.length,
    matchedPairs: matched.length,
    unmatchedPairs: rows.length - matched.length,
    ageCompatiblePC: matched.filter((row) => row.alignmentCategory === "genetics_close_age_pc").length,
    ageCompatibleS: matched.filter((row) => row.alignmentCategory === "genetics_close_age_s").length,
    ageUnknown: matched.filter((row) => row.alignmentCategory === "genetics_close_age_unknown").length,
    veryHighPiHat: rows.filter((row) => row.PI_HAT >= 0.75).length,
    meanPiHat: round(mean(rows.map((row) => row.PI_HAT)), 4),
  };
}

function writeMarkdownReport(summaryRows: any[], strongRows: any[], unmatchedStrongRows: any[], notableRows: any[]) {
  const topPc = strongRows.filter((row) => row.alignmentCategory === "genetics_close_age_pc").slice(0, 12);
  const topS = strongRows.filter((row) => row.alignmentCategory === "genetics_close_age_s").slice(0, 12);
  const topU = strongRows.filter((row) => row.alignmentCategory === "genetics_close_age_unknown").slice(0, 12);
  const markdown = [
    "# Kona Pi-Hat vs Generation Matrix Alignment",
    "",
    "Comparison target: Kona biopsied best-evidence generation matrix from `population_age_model_sensitivity_tables.xlsx`.",
    "",
    "Important interpretation note: PI_HAT alone can identify close relatedness but cannot reliably distinguish parent-child from full-sibling without age/generation evidence. The generation matrix is used as a plausibility filter, not as genetic proof.",
    "",
    "## Summary",
    "",
    table(summaryRows, ["threshold", "pairs", "matchedPairs", "unmatchedPairs", "ageCompatiblePC", "ageCompatibleS", "ageUnknown", "veryHighPiHat", "meanPiHat"]),
    "",
    "## Strong Close-Kin Pairs Supporting Parent-Child Plausibility",
    "",
    table(topPc, ["sampleIdA", "nameA", "sampleIdB", "nameB", "PI_HAT", "generationPrediction", "minimumAgeA", "minimumAgeB"]),
    "",
    "## Strong Close-Kin Pairs Better Treated As Same-Generation Compatible",
    "",
    table(topS, ["sampleIdA", "nameA", "sampleIdB", "nameB", "PI_HAT", "generationPrediction", "minimumAgeA", "minimumAgeB"]),
    "",
    "## Strong Close-Kin Pairs With Unknown Age Direction",
    "",
    table(topU, ["sampleIdA", "nameA", "sampleIdB", "nameB", "PI_HAT", "generationPrediction", "minimumAgeA", "minimumAgeB"]),
    "",
    "## Unmatched Strong Pairs",
    "",
    unmatchedStrongRows.length
      ? table(unmatchedStrongRows.slice(0, 30), ["sampleIdA", "nameA", "sampleIdB", "nameB", "PI_HAT"])
      : "All strong pairs matched to the matrix.",
    "",
    "## Detailed Strong-Pair Classifications",
    "",
    table(notableRows.slice(0, 80), ["sampleIdA", "nameA", "sampleIdB", "nameB", "PI_HAT", "codeAtoB", "codeBtoA", "generationPrediction", "interpretation"]),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT_DIR, "kona_pi_hat_generation_alignment_summary.md"), markdown);
}

function table(rows: any[], keys: string[]) {
  if (!rows.length) return "_None._";
  const header = `| ${keys.join(" | ")} |`;
  const sep = `| ${keys.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${keys.map((key) => String(row[key] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`);
  return [header, sep, ...body].join("\n");
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

function mean(values: number[]) {
  const cleanValues = values.filter(Number.isFinite);
  return cleanValues.length ? cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length : null;
}

function round(value: number | null | undefined, decimals = 1) {
  if (value == null || !Number.isFinite(value)) return null;
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}
