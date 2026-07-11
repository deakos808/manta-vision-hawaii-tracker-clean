import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const POPULATION_WORKBOOK = "reports/population_age_model_sensitivity/population_age_model_sensitivity_tables.xlsx";
const PI_HAT_WORKBOOK = "reports/kona_pi_hat_generation_alignment/kona_pi_hat_generation_matrix_reconstructed.xlsx";
const OUT_DIR = "reports/kona_pi_hat_generation_alignment";
const OUT_WORKBOOK = path.join(OUT_DIR, "kona_generation_maturity_sensitivity_extract.xlsx");

fs.mkdirSync(OUT_DIR, { recursive: true });

const populationWorkbook = XLSX.readFile(POPULATION_WORKBOOK);
const piHatWorkbook = XLSX.readFile(PI_HAT_WORKBOOK);
const output = XLSX.utils.book_new();

const konaScope = "Kona biopsied mantas";
const bestModel = "best_evidence_no_mprf_class";

const maturitySummary = rows(populationWorkbook, "Maturity sensitivity")
  .filter((row) => row.Scope === konaScope && row.modelKey === bestModel)
  .map((row) => ({
    maturityVariant: row.maturityVariant,
    maturityLabel: row.maturityLabel,
    maleMaturityAgeYears: row.maleMaturityAgeYears,
    femaleMaturityAgeYears: row.femaleMaturityAgeYears,
    records: row.records,
    meanMinimumAge: row.meanMinimumAge,
    medianMinimumAge: row.medianMinimumAge,
    ageChangedVsMidpoint: row.ageChangedVsMidpoint,
    rankChangedVsMidpoint: row.rankChangedVsMidpoint,
    relativeOrderChangedVsMidpoint: row.relativeOrderChangedVsMidpoint,
    mantasWithP: row.mantasWithP,
    mantasWithC: row.mantasWithC,
    mantasWithS: row.mantasWithS,
    mantasWithU: row.mantasWithU,
    pcRelationships: row.pcRelationships,
    sameGenerationRelationships: row.sameGenerationRelationships,
    cellP: row.cellP,
    cellC: row.cellC,
    cellS: row.cellS,
    cellU: row.cellU,
  }));

const pcPairs = rows(populationWorkbook, "Maturity P-C pairs")
  .filter((row) => row.Scope === konaScope && row.modelKey === bestModel)
  .map(cleanPopulationRelationshipRow);

const sPairs = rows(populationWorkbook, "Maturity S pairs")
  .filter((row) => row.Scope === konaScope && row.modelKey === bestModel)
  .map(cleanPopulationRelationshipRow);

const pcChanges = rows(populationWorkbook, "P-C changes vs midpoint")
  .filter((row) => row.Scope === konaScope && row.modelKey === bestModel)
  .map(cleanPopulationRelationshipRow);

const sChanges = rows(populationWorkbook, "S changes vs midpoint")
  .filter((row) => row.Scope === konaScope && row.modelKey === bestModel)
  .map(cleanPopulationRelationshipRow);

append("Kona maturity summary", maturitySummary);
append("Kona P-C pairs", pcPairs);
append("Kona S pairs", sPairs);
append("P-C changes vs midpoint", pcChanges);
append("S changes vs midpoint", sChanges);
append("PI_HAT maturity summary", rows(piHatWorkbook, "Maturity summary"));
append("Strong PI_HAT sensitivity", rows(piHatWorkbook, "Strong maturity sensitivity"));
append("Strong PI_HAT P-C pairs", rows(piHatWorkbook, "Strong P-C by maturity"));
append("Strong PI_HAT S pairs", rows(piHatWorkbook, "Strong S by maturity"));
append("Sequence crosswalk", rows(piHatWorkbook, "Sequence crosswalk"));

XLSX.writeFile(output, OUT_WORKBOOK);
console.log(`Wrote ${OUT_WORKBOOK}`);

function rows(workbook: XLSX.WorkBook, sheetName: string) {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });
}

function append(sheetName: string, data: Record<string, unknown>[]) {
  XLSX.utils.book_append_sheet(output, XLSX.utils.json_to_sheet(data), sheetName.slice(0, 31));
}

function cleanPopulationRelationshipRow(row: Record<string, unknown>) {
  const cleaned: Record<string, unknown> = {};
  for (const key of [
    "maturityVariant",
    "maturityLabel",
    "maleMaturityAgeYears",
    "femaleMaturityAgeYears",
    "comparisonToMidpoint",
    "changeVsMidpoint",
    "code",
    "possibleParentRank",
    "possibleParentName",
    "possibleParentSample_ID",
    "possibleParentHAMERCatalogID",
    "possibleParentMPRFCatalogID",
    "possibleParentBiopsyID",
    "possibleParentGender",
    "possibleParentMinimumAge",
    "possibleChildRank",
    "possibleChildName",
    "possibleChildSample_ID",
    "possibleChildHAMERCatalogID",
    "possibleChildMPRFCatalogID",
    "possibleChildBiopsyID",
    "possibleChildGender",
    "possibleChildMinimumAge",
    "mantaARank",
    "mantaAName",
    "mantaASample_ID",
    "mantaAHAMERCatalogID",
    "mantaAMPRFCatalogID",
    "mantaABiopsyID",
    "mantaAGender",
    "mantaAMinimumAge",
    "mantaBRank",
    "mantaBName",
    "mantaBSample_ID",
    "mantaBHAMERCatalogID",
    "mantaBMPRFCatalogID",
    "mantaBBiopsyID",
    "mantaBGender",
    "mantaBMinimumAge",
    "basis",
  ]) {
    if (key in row) cleaned[key] = row[key];
  }
  return cleaned;
}
