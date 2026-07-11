import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import {
  AGE_RANK_AS_OF_DATE,
  BiopsyAgeParameters,
  BiopsyExplorationRow,
  DEFAULT_BIOPSY_AGE_PARAMETERS,
  MODEL_1_BASELINE_BIOPSY_AGE_PARAMETERS,
  ResearchBiopsyRow,
  ResearchCatalogRow,
  ResearchMantaRow,
  ResearchRankRow,
  ResearchSightingRow,
  ResearchSizeRow,
  buildBiopsyExplorationRows,
} from "../../src/lib/research/biopsyAgeRanking";

const PAGE_SIZE = 1000;
const OUT_DIR = "reports/kona_biopsy_age_sensitivity";
const ELI_WORKBOOK = "/Users/littlemac/Dropbox/Work/HAMER/Research/Elasmobranchs/Manta Rays/2. Genetics/MPRF Manta Parentage Collaboration/Kona Biopsy Age Rankings/Age Ranking Lit Review/Eli_Kona Manta Age Estimates.xlsx";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase credentials were not found in SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/VITE_SUPABASE_ANON_KEY.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type ResearchData = {
  biopsies: ResearchBiopsyRow[];
  catalogs: ResearchCatalogRow[];
  mantas: ResearchMantaRow[];
  sightings: ResearchSightingRow[];
  sizes: ResearchSizeRow[];
  ranks: ResearchRankRow[];
};

type Scenario = {
  key: string;
  label: string;
  parameters: BiopsyAgeParameters;
};

type Neighbor = { previous: string | null; next: string | null };

const scenarios: Scenario[] = [
  {
    key: "m1",
    label: "Model 1: first sighting baseline",
    parameters: MODEL_1_BASELINE_BIOPSY_AGE_PARAMETERS,
  },
  {
    key: "m2_pup",
    label: "Model 1 + Model 2: pup first sighting",
    parameters: {
      ...MODEL_1_BASELINE_BIOPSY_AGE_PARAMETERS,
      includePupEvidence: true,
      treatPupAsBirthAnchor: true,
    },
  },
  {
    key: "m3_size_assumption",
    label: "Model 1 + Model 3: HAMER size evidence with maturity-size/age assumptions",
    parameters: {
      ...MODEL_1_BASELINE_BIOPSY_AGE_PARAMETERS,
      includeSizeEvidence: true,
      applySizeMaturityAssumptions: true,
    },
  },
  {
    key: "m4_hamer_age_class_assumption",
    label: "Model 1 + Model 4: HAMER dated age class with maturity-age assumptions",
    parameters: {
      ...MODEL_1_BASELINE_BIOPSY_AGE_PARAMETERS,
      includeAgeClassEvidence: true,
      applyAgeClassMaturityAssumptions: true,
    },
  },
  {
    key: "m5_mprf_age_class_assumption",
    label: "Model 1 + Model 5: MPRF dated/first-sighting age class with maturity-age assumptions",
    parameters: {
      ...MODEL_1_BASELINE_BIOPSY_AGE_PARAMETERS,
      includeMprfAgeClassEvidence: true,
      applyMprfAgeClassMaturityAssumptions: true,
    },
  },
  {
    key: "all_models",
    label: "Model 1 + Models 2-5",
    parameters: {
      ...DEFAULT_BIOPSY_AGE_PARAMETERS,
      includeLifeHistoryEvidence: true,
      includeSizeEvidence: true,
      includeAgeClassEvidence: true,
      includePupEvidence: true,
      treatPupAsBirthAnchor: true,
      includeMprfAgeClassEvidence: true,
      applySizeMaturityAssumptions: true,
      applyAgeClassMaturityAssumptions: true,
      applyMprfAgeClassMaturityAssumptions: true,
    },
  },
  {
    key: "best_evidence_no_mprf_class",
    label: "Best evidence model: Models 1-4, excluding MPRF age class",
    parameters: {
      ...DEFAULT_BIOPSY_AGE_PARAMETERS,
      includeLifeHistoryEvidence: true,
      includePupEvidence: true,
      treatPupAsBirthAnchor: true,
      includeSizeEvidence: true,
      includeAgeClassEvidence: true,
      includeMprfAgeClassEvidence: false,
      applySizeMaturityAssumptions: true,
      applyAgeClassMaturityAssumptions: true,
      applyMprfAgeClassMaturityAssumptions: false,
    },
  },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const data = await fetchResearchData();
  const scenarioRows = new Map<string, BiopsyExplorationRow[]>();
  scenarios.forEach((scenario) => {
    const rows = rerankRows(scopeKonaRows(buildBiopsyExplorationRows({ ...data, parameters: scenario.parameters })));
    scenarioRows.set(scenario.key, rows);
  });

  const baseline = scenarioRows.get("m1");
  if (!baseline) throw new Error("Baseline scenario did not run.");

  const baselineById = byId(baseline);
  const baselineNeighbors = buildNeighborMap(baseline);
  const summaries = scenarios.map((scenario) =>
    summarizeScenario(scenario, scenarioRows.get(scenario.key) ?? [], baselineById, baselineNeighbors, scenario.parameters),
  );
  const eliRows = readEliRows(ELI_WORKBOOK);
  const eliComparisons = scenarios.map((scenario) => compareWithEli(scenario, scenarioRows.get(scenario.key) ?? [], eliRows));
  const bestRows = scenarioRows.get("best_evidence_no_mprf_class") ?? [];
  const bestEliComparisonRows = buildEliComparisonRows(bestRows, eliRows)
    .sort((a, b) => Math.abs(b.ageDifferenceYears ?? 0) - Math.abs(a.ageDifferenceYears ?? 0));
  const allModelsRows = scenarioRows.get("all_models") ?? [];
  const topParentContributors = buildPairwiseRowSummary(bestRows, scenarios.find((scenario) => scenario.key === "best_evidence_no_mprf_class")?.parameters ?? DEFAULT_BIOPSY_AGE_PARAMETERS)
    .sort((a, b) => b.P - a.P)
    .slice(0, 12);
  const topParentContributorsAllModels = buildPairwiseRowSummary(allModelsRows, scenarios.find((scenario) => scenario.key === "all_models")?.parameters ?? DEFAULT_BIOPSY_AGE_PARAMETERS)
    .sort((a, b) => b.P - a.P)
    .slice(0, 12);
  const maturityAgeSensitivity = buildMaturityAgeSensitivity(data);

  const result = {
    generatedAt: new Date().toISOString(),
    ageReferenceDate: AGE_RANK_AS_OF_DATE,
    population: "Kona biopsied individuals",
    recordCount: baseline.length,
    parameters: {
      maleMaturityAgeYears: DEFAULT_BIOPSY_AGE_PARAMETERS.maleMaturityAgeYears,
      femaleMaturityAgeYears: DEFAULT_BIOPSY_AGE_PARAMETERS.femaleMaturityAgeYears,
      maleMaturitySizeM: DEFAULT_BIOPSY_AGE_PARAMETERS.maleMaturitySizeM,
      femaleMaturitySizeM: DEFAULT_BIOPSY_AGE_PARAMETERS.femaleMaturitySizeM,
    },
    summaries,
    eliWorkbook: ELI_WORKBOOK,
    eliComparisons,
    bestModelKey: "best_evidence_no_mprf_class",
    bestModelLabel: "Models 1-4, excluding MPRF age class",
    bestEliComparisonRows,
    topParentContributors,
    topParentContributorsAllModels,
    maturityAgeSensitivity,
  };
  fs.writeFileSync(path.join(OUT_DIR, "kona_biopsy_age_sensitivity_report_data.json"), JSON.stringify(result, null, 2));
  writeWorkbook(result);
  console.log(JSON.stringify(result, null, 2));
}

function buildMaturityAgeSensitivity(data: ResearchData) {
  const variants = [
    { key: "low", label: "Low maturity ages", maleMaturityAgeYears: 5, femaleMaturityAgeYears: 8 },
    {
      key: "midpoint",
      label: "Midpoint/default maturity ages",
      maleMaturityAgeYears: DEFAULT_BIOPSY_AGE_PARAMETERS.maleMaturityAgeYears,
      femaleMaturityAgeYears: DEFAULT_BIOPSY_AGE_PARAMETERS.femaleMaturityAgeYears,
    },
    { key: "high", label: "High maturity ages", maleMaturityAgeYears: 8, femaleMaturityAgeYears: 15 },
  ];
  const templates = [
    scenarios.find((scenario) => scenario.key === "best_evidence_no_mprf_class"),
    scenarios.find((scenario) => scenario.key === "all_models"),
  ].filter((scenario): scenario is Scenario => Boolean(scenario));

  return templates.flatMap((template) => {
    const rowsByVariant = new Map<string, BiopsyExplorationRow[]>();
    const paramsByVariant = new Map<string, BiopsyAgeParameters>();
    variants.forEach((variant) => {
      const parameters = {
        ...template.parameters,
        maleMaturityAgeYears: variant.maleMaturityAgeYears,
        femaleMaturityAgeYears: variant.femaleMaturityAgeYears,
      };
      paramsByVariant.set(variant.key, parameters);
      rowsByVariant.set(variant.key, rerankRows(scopeKonaRows(buildBiopsyExplorationRows({ ...data, parameters }))));
    });
    const midpointRows = rowsByVariant.get("midpoint") ?? [];
    const midpointById = byId(midpointRows);
    const midpointNeighbors = buildNeighborMap(midpointRows);

    return variants.map((variant) => {
      const rows = rowsByVariant.get(variant.key) ?? [];
      const parameters = paramsByVariant.get(variant.key) ?? template.parameters;
      const rowsWithDelta = rows.map((row) => {
        const base = midpointById.get(row.pkBiopsyId);
        const rankDelta = base?.exploratoryRank == null || row.exploratoryRank == null ? null : row.exploratoryRank - base.exploratoryRank;
        const ageDelta = base?.minimumAgeAsOfYears == null || row.minimumAgeAsOfYears == null ? null : row.minimumAgeAsOfYears - base.minimumAgeAsOfYears;
        const baseNeighbor = midpointNeighbors.get(row.pkBiopsyId);
        const activeNeighbor = buildNeighborMap(rows).get(row.pkBiopsyId);
        const relativeChanged = Boolean(
          baseNeighbor &&
          activeNeighbor &&
          baseNeighbor.previous !== activeNeighbor.previous &&
          baseNeighbor.next !== activeNeighbor.next,
        );
        return { row, base, rankDelta, ageDelta, relativeChanged };
      });
      const ageDeltas = rowsWithDelta.map((entry) => entry.ageDelta).filter((value): value is number => value != null);
      const rankDeltas = rowsWithDelta.map((entry) => entry.rankDelta).filter((value): value is number => value != null);
      const nonZeroAgeDeltas = ageDeltas.filter((value) => Math.abs(value) > 0.01);
      const nonZeroRankDeltas = rankDeltas.filter((value) => value !== 0);
      const animalCounts = buildPairwiseGenerationAnimalCounts(rows, parameters);
      const cellCounts = buildPairwiseGenerationCounts(rows, parameters, true);
      const pcRelationships = buildPairwiseRelationshipRows(rows, parameters, "pc");
      const sRelationships = buildPairwiseRelationshipRows(rows, parameters, "cc");
      const topAgeChangesVsMidpoint = rowsWithDelta
        .filter((entry) => entry.ageDelta != null && Math.abs(entry.ageDelta) > 0.01)
        .sort((a, b) => Math.abs(b.ageDelta ?? 0) - Math.abs(a.ageDelta ?? 0))
        .slice(0, 8)
        .map((entry) => ({
          name: entry.row.name,
          sampleId: entry.row.jonathanSequenceId,
          hamerCatalogId: entry.row.catalogId,
          mprfCatalogId: formatMprfCatalogId(entry.row.mprfCatalogId),
          biopsyId: entry.row.pkBiopsyId,
          midpointMinimumAge: round(entry.base?.minimumAgeAsOfYears),
          variantMinimumAge: round(entry.row.minimumAgeAsOfYears),
          ageDelta: round(entry.ageDelta),
          midpointRank: entry.base?.exploratoryRank,
          variantRank: entry.row.exploratoryRank,
          rankDelta: entry.rankDelta,
        }));

      return {
        modelKey: template.key,
        modelLabel: template.label,
        maturityVariant: variant.key,
        maturityLabel: variant.label,
        maleMaturityAgeYears: variant.maleMaturityAgeYears,
        femaleMaturityAgeYears: variant.femaleMaturityAgeYears,
        records: rows.length,
        meanMinimumAge: round(mean(rows.map((row) => row.minimumAgeAsOfYears))),
        medianMinimumAge: round(median(rows.map((row) => row.minimumAgeAsOfYears))),
        ageChangedVsMidpoint: nonZeroAgeDeltas.length,
        meanAgeDeltaVsMidpoint: round(mean(ageDeltas)),
        maxAbsAgeDeltaVsMidpoint: round(max(ageDeltas.map((value) => Math.abs(value)))),
        rankChangedVsMidpoint: nonZeroRankDeltas.length,
        relativeOrderChangedVsMidpoint: rowsWithDelta.filter((entry) => entry.relativeChanged).length,
        meanAbsRankDeltaVsMidpoint: round(mean(rankDeltas.map(Math.abs))),
        maxAbsRankDeltaVsMidpoint: max(rankDeltas.map((value) => Math.abs(value))),
        mantasWithP: animalCounts.P,
        mantasWithC: animalCounts.C,
        mantasWithS: animalCounts.S,
        mantasWithU: animalCounts.U,
        cellP: cellCounts.P,
        cellC: cellCounts.C,
        cellS: cellCounts.S,
        cellU: cellCounts.U,
        pcRelationships: pcRelationships.length,
        sameGenerationRelationships: sRelationships.length,
        topAgeChangesVsMidpoint,
      };
    });
  });
}

function summarizeScenario(
  scenario: Scenario,
  rows: BiopsyExplorationRow[],
  baselineById: Map<string, BiopsyExplorationRow>,
  baselineNeighbors: Map<string, Neighbor>,
  parameters: BiopsyAgeParameters,
) {
  const neighbors = buildNeighborMap(rows);
  const rowsWithDelta = rows.map((row) => {
    const base = baselineById.get(row.pkBiopsyId);
    const minDelta = base?.minimumAgeAsOfYears == null || row.minimumAgeAsOfYears == null ? null : row.minimumAgeAsOfYears - base.minimumAgeAsOfYears;
    const rankDelta = base?.exploratoryRank == null || row.exploratoryRank == null ? null : row.exploratoryRank - base.exploratoryRank;
    const baseNeighbor = baselineNeighbors.get(row.pkBiopsyId);
    const activeNeighbor = neighbors.get(row.pkBiopsyId);
    const relativeChanged = Boolean(
      baseNeighbor &&
      activeNeighbor &&
      baseNeighbor.previous !== activeNeighbor.previous &&
      baseNeighbor.next !== activeNeighbor.next,
    );
    return { row, base, minDelta, rankDelta, relativeChanged };
  });
  const ageDeltas = rowsWithDelta.map((entry) => entry.minDelta).filter((value): value is number => value != null);
  const nonZeroAgeDeltas = ageDeltas.filter((value) => Math.abs(value) > 0.01);
  const rankDeltas = rowsWithDelta.map((entry) => entry.rankDelta).filter((value): value is number => value != null);
  const nonZeroRankDeltas = rankDeltas.filter((value) => value !== 0);
  const topAgeIncreases = rowsWithDelta
    .filter((entry) => entry.minDelta != null && entry.minDelta > 0.01)
    .sort((a, b) => (b.minDelta ?? 0) - (a.minDelta ?? 0))
    .slice(0, 8)
    .map((entry) => ({
      name: entry.row.name,
      biopsy: entry.row.mprfBiopsyId ?? entry.row.pkBiopsyId,
      baselineMinAge: round(entry.base?.minimumAgeAsOfYears),
      scenarioMinAge: round(entry.row.minimumAgeAsOfYears),
      ageIncrease: round(entry.minDelta),
      baselineRank: entry.base?.exploratoryRank,
      scenarioRank: entry.row.exploratoryRank,
      rankDelta: entry.rankDelta,
      evidence: entry.row.ageIntervalCheckpoints.map((checkpoint) => `${checkpoint.label} ${checkpoint.date ?? ""}: min ${round(checkpoint.minimumAgeYears)} max ${round(checkpoint.maximumAgeYears)}`).join(" | "),
    }));
  const pairwiseAnimalCounts = buildPairwiseGenerationAnimalCounts(rows, parameters);
  const pairwiseCellCounts = buildPairwiseGenerationCounts(rows, parameters, true);
  const pairwiseRows = buildPairwiseRowSummary(rows, parameters);
  const pcRelationships = buildPairwiseRelationshipRows(rows, parameters, "pc");
  const sRelationships = buildPairwiseRelationshipRows(rows, parameters, "cc");

  return {
    key: scenario.key,
    label: scenario.label,
    records: rows.length,
    minAge: {
      mean: round(mean(rows.map((row) => row.minimumAgeAsOfYears))),
      median: round(median(rows.map((row) => row.minimumAgeAsOfYears))),
      changedCount: nonZeroAgeDeltas.length,
      meanDeltaAll: round(mean(ageDeltas)),
      meanDeltaChanged: round(mean(nonZeroAgeDeltas)),
      medianDeltaChanged: round(median(nonZeroAgeDeltas)),
      maxIncrease: round(max(nonZeroAgeDeltas)),
    },
    ranks: {
      changedAbsoluteCount: nonZeroRankDeltas.length,
      relativeOrderChangedCount: rowsWithDelta.filter((entry) => entry.relativeChanged).length,
      meanAbsRankDelta: round(mean(rankDeltas.map(Math.abs))),
      medianAbsRankDeltaChanged: round(median(nonZeroRankDeltas.map((value) => Math.abs(value)))),
      maxAbsRankDelta: max(rankDeltas.map((value) => Math.abs(value))),
    },
    pairwise: {
      animalsWithP: pairwiseAnimalCounts.P,
      animalsWithC: pairwiseAnimalCounts.C,
      animalsWithS: pairwiseAnimalCounts.S,
      animalsWithU: pairwiseAnimalCounts.U,
      cellP: pairwiseCellCounts.P,
      cellC: pairwiseCellCounts.C,
      cellS: pairwiseCellCounts.S,
      cellU: pairwiseCellCounts.U,
      pcRelationships: pcRelationships.length,
      sameGenerationRelationships: sRelationships.length,
      topParentCandidates: pairwiseRows.sort((a, b) => b.P - a.P).slice(0, 5),
    },
    evidenceCounts: {
      withFirstSighting: rows.filter((row) => row.firstSightingDate).length,
      withPupFirstSighting: rows.filter((row) => row.firstSightingAsPup).length,
      withAgeClassSummary: rows.filter((row) => row.ageClassObservationSummary.length > 0).length,
      withSizeSummary: rows.filter((row) => row.sizeObservationSummary.length > 0).length,
      withAgeClassCheckpoint: rows.filter((row) => row.ageIntervalCheckpoints.some((checkpoint) => checkpoint.key === "age_class")).length,
      withSizeCheckpoint: rows.filter((row) => row.ageIntervalCheckpoints.some((checkpoint) => checkpoint.key === "size")).length,
      withPupCheckpoint: rows.filter((row) => row.ageIntervalCheckpoints.some((checkpoint) => checkpoint.key === "pup_first_sighting")).length,
    },
    topAgeIncreases,
  };
}

type PairwiseGenerationCode = "P" | "C" | "S" | "U" | "—";
type PairwiseGenerationCell = { code: PairwiseGenerationCode; detail: string };
type PairwiseRelationshipMode = "pc" | "cc";

function classifyPairwiseGeneration(row: BiopsyExplorationRow, column: BiopsyExplorationRow, parameters: BiopsyAgeParameters): PairwiseGenerationCell {
  if (row.pkBiopsyId === column.pkBiopsyId) return { code: "—", detail: "Same animal." };
  const rowMin = row.minimumAgeAsOfYears;
  const columnMin = column.minimumAgeAsOfYears;

  const rowAsParent = classifyDatedParentChildEvidence(row, column, parameters);
  if (rowAsParent.code === "P") return rowAsParent;
  const columnAsParent = classifyDatedParentChildEvidence(column, row, parameters);
  if (columnAsParent.code === "P") return { code: "C", detail: columnAsParent.detail };
  if (rowAsParent.code === "S" || columnAsParent.code === "S") {
    return { code: "S", detail: [rowAsParent.code === "S" ? rowAsParent.detail : null, columnAsParent.code === "S" ? columnAsParent.detail : null].filter(Boolean).join(" ") };
  }
  if (rowMin == null || columnMin == null) return { code: "U", detail: "Unknown: one or both records are missing minimum age estimates." };
  return { code: "U", detail: "Unknown: no dated adult-versus-juvenile comparison is available. Minimum-age intervals are not used to back-date adult status for P/C generation calls." };
}

function classifyDatedParentChildEvidence(possibleParent: BiopsyExplorationRow, possibleChild: BiopsyExplorationRow, parameters: BiopsyAgeParameters): PairwiseGenerationCell {
  const maturityAge = maturityAgeForPotentialChild(possibleChild, parameters);
  if (maturityAge == null) return { code: "U", detail: "Unknown child maturity age." };
  const parentEvidence = generationStageEvidence(possibleParent, parameters);
  const childEvidence = generationStageEvidence(possibleChild, parameters);
  let strongestShortGap: { gap: number } | null = null;
  for (const adultDate of parentEvidence.adultDates) {
    for (const juvenileDate of childEvidence.juvenileDates) {
      const gap = yearsBetweenLocal(adultDate, juvenileDate);
      if (gap == null || gap < 0) continue;
      if (gap >= maturityAge) return { code: "P", detail: "Dated adult-versus-juvenile separation supports plausible parent using possible child's maturity threshold." };
      if (!strongestShortGap || gap > strongestShortGap.gap) strongestShortGap = { gap };
    }
  }
  if (strongestShortGap) return { code: "S", detail: "Dated adult-versus-juvenile gap is shorter than selected maturity age." };
  return { code: "U", detail: "No dated adult-versus-juvenile comparison available." };
}

function generationStageEvidence(row: BiopsyExplorationRow, parameters: BiopsyAgeParameters) {
  const adultDates: string[] = [];
  const juvenileDates: string[] = [];
  const addAdult = (date: string | null | undefined) => {
    const clean = dateOnlyLocal(date);
    if (clean) adultDates.push(clean);
  };
  const addJuvenile = (date: string | null | undefined) => {
    const clean = dateOnlyLocal(date);
    if (clean) juvenileDates.push(clean);
  };
  row.ageClassObservationSummary.forEach((summary) => {
    const parsed = parseDatedSummary(summary);
    if (!parsed) return;
    const stage = ageClassStage(parsed.value);
    if (stage === "adult") addAdult(parsed.date);
    if (stage === "juvenile") addJuvenile(parsed.date);
  });
  row.ageIntervalCheckpoints.forEach((checkpoint) => {
    const detail = checkpoint.detail.toLowerCase();
    if (checkpoint.key === "pup_first_sighting") addJuvenile(checkpoint.date);
    if (checkpoint.key === "age_class") {
      if (detail.includes("adult") || detail.includes("mature")) addAdult(checkpoint.date);
      if (detail.includes("juvenile") || detail.includes("pup")) addJuvenile(checkpoint.date);
    }
    if (checkpoint.key === "size") {
      if (detail.includes("meets selected maturity size") || detail.includes("near/at selected terminal size")) addAdult(checkpoint.date);
      if (detail.includes("below selected maturity size")) addJuvenile(checkpoint.date);
    }
  });
  const sex = normalizeSex(row.gender);
  const maturitySize = sex === "male" ? parameters.maleMaturitySizeM : sex === "female" ? parameters.femaleMaturitySizeM : null;
  if (maturitySize != null) {
    row.sizeObservationSummary.forEach((summary) => {
      const parsed = parseDatedSummary(summary);
      const size = parsed ? Number(parsed.value.match(/\d+(?:\.\d+)?/)?.[0]) : null;
      if (!parsed || !Number.isFinite(size)) return;
      if ((size ?? 0) >= maturitySize) addAdult(parsed.date);
      else addJuvenile(parsed.date);
    });
  }
  if (row.firstSightingAsPup) addJuvenile(row.firstSightingDate);
  return { adultDates: Array.from(new Set(adultDates)).sort(), juvenileDates: Array.from(new Set(juvenileDates)).sort() };
}

function buildPairwiseGenerationCounts(rows: BiopsyExplorationRow[], parameters: BiopsyAgeParameters, includeSameAnimal: boolean) {
  const next: Record<PairwiseGenerationCode, number> = { P: 0, C: 0, S: 0, U: 0, "—": 0 };
  rows.forEach((row) => rows.forEach((column) => {
    const code = classifyPairwiseGeneration(row, column, parameters).code;
    if (code === "—" && !includeSameAnimal) return;
    next[code] += 1;
  }));
  return next;
}

function buildPairwiseGenerationAnimalCounts(rows: BiopsyExplorationRow[], parameters: BiopsyAgeParameters) {
  const idsByCode: Record<Exclude<PairwiseGenerationCode, "—">, Set<string>> = { P: new Set(), C: new Set(), S: new Set(), U: new Set() };
  rows.forEach((row) => rows.forEach((column) => {
    if (row.pkBiopsyId === column.pkBiopsyId) return;
    const code = classifyPairwiseGeneration(row, column, parameters).code;
    if (code !== "—") idsByCode[code].add(row.pkBiopsyId);
  }));
  return { P: idsByCode.P.size, C: idsByCode.C.size, S: idsByCode.S.size, U: idsByCode.U.size };
}

function buildPairwiseRowSummary(rows: BiopsyExplorationRow[], parameters: BiopsyAgeParameters) {
  return rows.map((row) => {
    const counts: Record<Exclude<PairwiseGenerationCode, "—">, number> = { P: 0, C: 0, S: 0, U: 0 };
    rows.forEach((column) => {
      const code = classifyPairwiseGeneration(row, column, parameters).code;
      if (code !== "—") counts[code] += 1;
    });
    return {
      name: row.name,
      sampleId: row.jonathanSequenceId,
      hamerCatalogId: row.catalogId,
      mprfCatalogId: formatMprfCatalogId(row.mprfCatalogId),
      biopsyId: row.pkBiopsyId,
      rank: row.exploratoryRank,
      minimumAge: round(row.minimumAgeAsOfYears),
      P: counts.P,
      C: counts.C,
      S: counts.S,
      U: counts.U,
    };
  });
}

function buildPairwiseRelationshipRows(rows: BiopsyExplorationRow[], parameters: BiopsyAgeParameters, mode: PairwiseRelationshipMode) {
  const relationships: Array<{ primary: BiopsyExplorationRow; secondary: BiopsyExplorationRow; code: PairwiseGenerationCode; detail: string }> = [];
  rows.forEach((row, rowIndex) => rows.forEach((column, columnIndex) => {
    if (row.pkBiopsyId === column.pkBiopsyId) return;
    const cell = classifyPairwiseGeneration(row, column, parameters);
    if (mode === "pc" && cell.code === "P") relationships.push({ primary: row, secondary: column, code: cell.code, detail: cell.detail });
    if (mode === "cc" && cell.code === "S" && rowIndex < columnIndex) relationships.push({ primary: row, secondary: column, code: cell.code, detail: cell.detail });
  }));
  return relationships;
}

type EliRow = {
  sampleId: string | null;
  name: string | null;
  sex: string | null;
  mprfCatalogId: string | null;
  firstSighting: string | null;
  minimumAge: number | null;
  sizeAdjustedAge: number | null;
  ageRank: number | null;
};

function readEliRows(workbookPath: string): EliRow[] {
  const workbook = XLSX.readFile(workbookPath, { cellDates: false });
  const sheet = workbook.Sheets["sample list"] ?? workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  return rows.map((row) => ({
    sampleId: cleanString(row["Sample ID"]),
    name: cleanString(row["Manta Name"]),
    sex: cleanString(row["Sex"]),
    mprfCatalogId: normalizeMprfId(cleanString(row["MPRF catalogue #"])),
    firstSighting: cleanString(row["First Sighting"]),
    minimumAge: num(row["Minimum Age as of 1/1/2024 (yrs) "]),
    sizeAdjustedAge: num(row["Size Adjusted Age as of 1/1/2024 (yrs)"]),
    ageRank: num(row["Age Rank"]),
  }));
}

function compareWithEli(scenario: Scenario, rows: BiopsyExplorationRow[], eliRows: EliRow[]) {
  const comparisonRows = buildEliComparisonRows(rows, eliRows);
  const matched = comparisonRows.filter((row) => row.matched);
  const ageDiffs = matched.map((row) => row.ageDifferenceYears).filter((value): value is number => value != null);
  const rankDiffs = matched.map((row) => row.rankDifference).filter((value): value is number => value != null);
  return {
    key: scenario.key,
    label: scenario.label,
    matched: matched.length,
    unmatchedWorkbench: comparisonRows.filter((row) => !row.matched).length,
    meanAgeDifference: round(mean(ageDiffs)),
    meanAbsAgeDifference: round(mean(ageDiffs.map(Math.abs))),
    medianAbsAgeDifference: round(median(ageDiffs.map(Math.abs))),
    rmseAgeDifference: round(rmse(ageDiffs)),
    recordsAgeDiffGte5: ageDiffs.filter((value) => Math.abs(value) >= 5).length,
    meanAbsRankDifference: round(mean(rankDiffs.map(Math.abs))),
    medianAbsRankDifference: round(median(rankDiffs.map(Math.abs))),
    recordsRankDiffGte10: rankDiffs.filter((value) => Math.abs(value) >= 10).length,
    topAgeDifferences: [...matched]
      .sort((a, b) => Math.abs(b.ageDifferenceYears ?? 0) - Math.abs(a.ageDifferenceYears ?? 0))
      .slice(0, 8),
  };
}

function buildEliComparisonRows(rows: BiopsyExplorationRow[], eliRows: EliRow[]) {
  const eliBySample = new Map(
    eliRows
      .map((row) => [normalizeKey(row.sampleId), row] as const)
      .filter(([key]) => key.length > 0),
  );
  const eliByMprf = new Map(
    eliRows
      .map((row) => [normalizeMprfId(row.mprfCatalogId), row] as const)
      .filter(([key]) => key.length > 0),
  );
  return rows.map((row) => {
    const mprfId = formatMprfCatalogId(row.mprfCatalogId);
    const sampleKey = normalizeKey(row.jonathanSequenceId);
    const mprfKey = normalizeMprfId(mprfId);
    const sampleMatch = sampleKey ? eliBySample.get(sampleKey) : undefined;
    const sampleMatchConflict = Boolean(
      sampleMatch &&
      mprfKey &&
      sampleMatch.mprfCatalogId &&
      normalizeMprfId(sampleMatch.mprfCatalogId) !== mprfKey,
    );
    const mprfMatch = mprfKey ? eliByMprf.get(mprfKey) : undefined;
    const eli = sampleMatch && !sampleMatchConflict ? sampleMatch : mprfMatch;
    const ageDifferenceYears = eli?.sizeAdjustedAge == null || row.minimumAgeAsOfYears == null ? null : row.minimumAgeAsOfYears - eli.sizeAdjustedAge;
    const rankDifference = eli?.ageRank == null || row.exploratoryRank == null ? null : row.exploratoryRank - eli.ageRank;
    return {
      matched: Boolean(eli),
      matchNote: sampleMatchConflict
        ? `Sample_ID ${row.jonathanSequenceId} conflicts with Eli MPRF ${sampleMatch?.mprfCatalogId}; compared by MPRF only when possible.`
        : null,
      name: row.name,
      sampleId: row.jonathanSequenceId,
      hamerCatalogId: row.catalogId,
      mprfCatalogId: mprfId,
      biopsyId: row.pkBiopsyId,
      workbenchRank: row.exploratoryRank,
      workbenchMinimumAge: round(row.minimumAgeAsOfYears),
      eliSampleId: eli?.sampleId ?? null,
      eliName: eli?.name ?? null,
      eliMprfCatalogId: eli?.mprfCatalogId ?? null,
      eliSizeAdjustedAge: round(eli?.sizeAdjustedAge),
      eliAgeRank: eli?.ageRank ?? null,
      ageDifferenceYears: round(ageDifferenceYears),
      rankDifference,
    };
  });
}

function writeWorkbook(result: Record<string, unknown>) {
  const workbook = XLSX.utils.book_new();
  const summaries = (result.summaries as any[]).map((summary) => ({
    Model: summary.label,
    Records: summary.records,
    "Mean min age": summary.minAge.mean,
    "Median min age": summary.minAge.median,
    "Age changed vs M1": summary.minAge.changedCount,
    "Mean age delta all": summary.minAge.meanDeltaAll,
    "Mean age delta changed": summary.minAge.meanDeltaChanged,
    "Max age increase": summary.minAge.maxIncrease,
    "Absolute rank changes": summary.ranks.changedAbsoluteCount,
    "Relative order changes": summary.ranks.relativeOrderChangedCount,
    "Mean abs rank delta": summary.ranks.meanAbsRankDelta,
    "Mantas with P": summary.pairwise.animalsWithP,
    "Mantas with C": summary.pairwise.animalsWithC,
    "Mantas with S": summary.pairwise.animalsWithS,
    "Mantas with U": summary.pairwise.animalsWithU,
    "P-C relationships": summary.pairwise.pcRelationships,
    "S relationships": summary.pairwise.sameGenerationRelationships,
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaries), "Model sensitivity");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(result.eliComparisons as any[]), "Eli comparison summary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(result.bestEliComparisonRows as any[]), "Best model vs Eli");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(result.topParentContributors as any[]), "Top P contributors");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(result.maturityAgeSensitivity as any[]), "Maturity age sensitivity");
  XLSX.writeFile(workbook, path.join(OUT_DIR, "kona_biopsy_age_sensitivity_tables.xlsx"));
}

function parseDatedSummary(value: string) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2}):\s*(.+)$/);
  return match ? { date: match[1], value: match[2] } : null;
}

function ageClassStage(value: string) {
  const text = value.trim().toLowerCase();
  if (text.includes("adult") || text.includes("mature")) return "adult";
  if (text.includes("juvenile") || text.includes("immature") || text.includes("pup") || text.includes("neonate")) return "juvenile";
  return null;
}

function yearsBetweenLocal(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = end.getTime() - start.getTime();
  return Number.isFinite(diff) ? diff / 86400000 / 365.25 : null;
}

function dateOnlyLocal(value: string | null | undefined) {
  if (!value) return null;
  const text = String(value);
  const iso = text.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function maturityAgeForRow(row: BiopsyExplorationRow, parameters: BiopsyAgeParameters) {
  const sex = normalizeSex(row.gender);
  if (sex === "male") return parameters.maleMaturityAgeYears;
  if (sex === "female") return parameters.femaleMaturityAgeYears;
  return null;
}

function maturityAgeForPotentialChild(row: BiopsyExplorationRow, parameters: BiopsyAgeParameters) {
  const sex = normalizeSex(row.gender);
  if (sex === "male") return parameters.maleMaturityAgeYears;
  return parameters.femaleMaturityAgeYears;
}

function normalizeSex(value: string | null | undefined) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text.startsWith("m")) return "male";
  if (text.startsWith("f")) return "female";
  return null;
}

function formatMprfCatalogId(value: number | null | undefined) {
  if (value == null) return null;
  return `MP${String(value).padStart(3, "0")}`;
}

function normalizeMprfId(value: string | null | undefined) {
  const text = cleanString(value);
  if (!text) return "";
  const digits = text.match(/\d+/)?.[0];
  return digits ? `MP${digits.padStart(3, "0")}` : text.toUpperCase();
}

function normalizeKey(value: string | null | undefined) {
  return cleanString(value)?.replace(/[^a-z0-9]/gi, "").toLowerCase() ?? "";
}

function cleanString(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function num(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rmse(values: number[]) {
  return values.length ? Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length) : null;
}

function scopeKonaRows(rows: BiopsyExplorationRow[]) {
  return rows.filter((row) => {
    const island = String(row.island ?? "").trim().toLowerCase();
    return ["big island", "hawaii", "hawaiʻi", "kona"].includes(island);
  });
}

function rerankRows(rows: BiopsyExplorationRow[]) {
  const sorted = [...rows].sort((a, b) => b.exploratoryScore - a.exploratoryScore || rankSort(a.currentRank, b.currentRank) || a.pkBiopsyId.localeCompare(b.pkBiopsyId));
  let previousScore: number | null = null;
  let previousRank = 0;
  sorted.forEach((row, index) => {
    const rank = previousScore != null && row.exploratoryScore === previousScore ? previousRank : index + 1;
    row.exploratoryRank = rank;
    row.rankDelta = row.currentRank == null ? null : rank - row.currentRank;
    previousScore = row.exploratoryScore;
    previousRank = rank;
  });
  return rows;
}

function rankSort(a: number | null | undefined, b: number | null | undefined) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function byId(rows: BiopsyExplorationRow[]) {
  return new Map(rows.map((row) => [row.pkBiopsyId, row]));
}

function buildNeighborMap(rows: BiopsyExplorationRow[]) {
  const sorted = [...rows].sort((a, b) => rankSort(a.exploratoryRank, b.exploratoryRank) || a.pkBiopsyId.localeCompare(b.pkBiopsyId));
  return new Map(sorted.map((row, index) => [
    row.pkBiopsyId,
    {
      previous: sorted[index - 1]?.pkBiopsyId ?? null,
      next: sorted[index + 1]?.pkBiopsyId ?? null,
    },
  ]));
}

async function fetchResearchData(): Promise<ResearchData> {
  const [biopsies, ranks] = await Promise.all([
    selectAll<ResearchBiopsyRow>(
      "biopsies",
      "pk_biopsy_id,fk_manta_id,fk_sighting_id,fk_catalog_id,sample_date,sample_time,collector,island,region,location,lab_id,raw_sample_id,source",
      "pk_biopsy_id",
    ),
    selectAll<ResearchRankRow>("kona_biopsy_age_rank_view_v3", "*", "age_rank_v3"),
  ]);

  const biopsySightingIds = uniq(biopsies.map((row) => row.fk_sighting_id));
  const [catalogs, mantas] = await Promise.all([
    selectAll<ResearchCatalogRow>(
      "catalog",
      "pk_catalog_id,name,date_first_sighted,date_last_sighted,count_unique_years_sighted,years_between_first_last,total_sightings,total_sighting_days,last_age_class,last_gender,last_size_m,is_mprf,MPRF_first_sighted_date,MPRF_total_years_seen,MPRF_age_class_at_first_sighting,mprf_date_first_sighted,mprf_pupinitially,mprf_current_maturity,mprf_size_estimate",
      "pk_catalog_id",
    ),
    selectAll<ResearchMantaRow>(
      "mantas",
      "pk_manta_id,fk_catalog_id,fk_sighting_id,gender,age_class,size_m,estimated_size_m,jon_size_m,size_disc_width_m,size_dw_m,is_mprf,name,pk_mprf_catalog_id,mprf_date,sighting_date",
      "pk_manta_id",
    ),
  ]);

  const sightingIds = uniq([...biopsySightingIds, ...mantas.map((row) => row.fk_sighting_id)]);
  const mantaSizeIds = uniq(mantas.map((row) => row.pk_manta_id));
  const [sightings, sizes] = await Promise.all([
    selectIn<ResearchSightingRow>(
      "sightings",
      "pk_sighting_id,sighting_date,island,region,sitelocation,location,is_mprf",
      "pk_sighting_id",
      sightingIds,
    ),
    selectIn<ResearchSizeRow>(
      "manta_sizes",
      "pk_manta_size_id,fk_manta_id,measurement_type,size_m,measured_on,photo_code,quality_note,calibration_params,src_file",
      "fk_manta_id",
      mantaSizeIds,
    ),
  ]);

  return { biopsies, catalogs, mantas, sightings, sizes, ranks };
}

async function selectAll<T>(table: string, columns: string, orderColumn?: string) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (orderColumn) query = query.order(orderColumn, { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function selectIn<T>(table: string, columns: string, column: string, values: Array<string | number | null | undefined>) {
  const cleanValues = uniq(values);
  if (!cleanValues.length) return [];
  const rows: T[] = [];
  for (let index = 0; index < cleanValues.length; index += 500) {
    const chunk = cleanValues.slice(index, index + 500);
    const { data, error } = await supabase.from(table).select(columns).in(column, chunk);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

function uniq(values: Array<string | number | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string | number => value != null && value !== "")));
}

function mean(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => value != null && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function median(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => value != null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

function max(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => value != null && Number.isFinite(value));
  return clean.length ? Math.max(...clean) : null;
}

function round(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
