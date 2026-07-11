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
const OUT_DIR = "reports/population_age_model_sensitivity";
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

type PopulationScope = {
  key: string;
  label: string;
  population: "kona" | "maui_nui";
  mode: "biopsied" | "all";
  includeMprfAgeClassModel: boolean;
};

const populationScopes: PopulationScope[] = [
  { key: "kona_biopsied", label: "Kona biopsied mantas", population: "kona", mode: "biopsied", includeMprfAgeClassModel: true },
  { key: "kona_all", label: "Kona all mantas", population: "kona", mode: "all", includeMprfAgeClassModel: true },
  { key: "maui_nui_biopsied", label: "Maui Nui biopsied mantas", population: "maui_nui", mode: "biopsied", includeMprfAgeClassModel: false },
  { key: "maui_nui_all", label: "Maui Nui all mantas", population: "maui_nui", mode: "all", includeMprfAgeClassModel: false },
];

const baseScenarios: Scenario[] = [
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
    key: "best_evidence_no_mprf_class",
    label: "Best evidence model: Models 1-4, excluding MPRF age class",
    parameters: {
      ...DEFAULT_BIOPSY_AGE_PARAMETERS,
      includeLifeHistoryEvidence: true,
      includeSizeEvidence: true,
      includeAgeClassEvidence: true,
      includePupEvidence: true,
      treatPupAsBirthAnchor: true,
      includeMprfAgeClassEvidence: false,
      applySizeMaturityAssumptions: true,
      applyAgeClassMaturityAssumptions: true,
      applyMprfAgeClassMaturityAssumptions: false,
    },
  },
];

const mprfScenarios: Scenario[] = [
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
      includePupEvidence: true,
      treatPupAsBirthAnchor: true,
      includeSizeEvidence: true,
      includeAgeClassEvidence: true,
      includeMprfAgeClassEvidence: true,
      applySizeMaturityAssumptions: true,
      applyAgeClassMaturityAssumptions: true,
      applyMprfAgeClassMaturityAssumptions: true,
    },
  },
];

function scenariosForScope(scope: PopulationScope) {
  return scope.includeMprfAgeClassModel ? [...baseScenarios, ...mprfScenarios] : baseScenarios;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const data = await fetchResearchData();
  const results = populationScopes.map((scope) => runScopeAnalysis(data, scope));
  const combined = {
    generatedAt: new Date().toISOString(),
    ageReferenceDate: AGE_RANK_AS_OF_DATE,
    scopes: results,
  };
  const outJson = path.join(OUT_DIR, "population_age_model_sensitivity_report_data.json");
  const outWorkbook = path.join(OUT_DIR, "population_age_model_sensitivity_tables.xlsx");
  fs.writeFileSync(outJson, JSON.stringify(combined, null, 2));
  writePopulationWorkbook(combined);
  for (const scopeResult of combined.scopes) {
    const best = scopeResult.summaries.find((summary: any) => summary.key === "best_evidence_no_mprf_class");
    console.log(
      `${scopeResult.label}: ${scopeResult.recordCount} records; best model changed ${best?.minAge.changedCount ?? 0} ages, ` +
        `${best?.ranks.relativeOrderChangedCount ?? 0} relative ranks, ${best?.pairwise.pcRelationships ?? 0} P-C calls.`
    );
  }
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outWorkbook}`);
}

function runScopeAnalysis(data: ResearchData, scope: PopulationScope) {
  const scopedData = {
    ...data,
    biopsies: scope.mode === "all"
      ? buildCatalogAnchorRows(data)
      : data.biopsies,
  };
  const scopeScenarios = scenariosForScope(scope);
  const scenarioRows = new Map<string, BiopsyExplorationRow[]>();
  scopeScenarios.forEach((scenario) => {
    const rows = buildScopeRows(scopedData, scope, scenario.parameters);
    scenarioRows.set(scenario.key, rows);
  });

  const baseline = scenarioRows.get("m1");
  if (!baseline) throw new Error("Baseline scenario did not run.");

  const baselineById = byId(baseline);
  const baselineNeighbors = buildNeighborMap(baseline);
  const bestRows = scenarioRows.get("best_evidence_no_mprf_class") ?? [];
  const biopsyRowsForScope = buildScopeRows({ ...data, biopsies: data.biopsies }, scope, baseScenarios.find((scenario) => scenario.key === "best_evidence_no_mprf_class")?.parameters ?? DEFAULT_BIOPSY_AGE_PARAMETERS);
  const rawBiopsyRowsForScope = scopePopulationRows(buildBiopsyExplorationRows({ ...data, biopsies: data.biopsies, parameters: baseScenarios.find((scenario) => scenario.key === "best_evidence_no_mprf_class")?.parameters ?? DEFAULT_BIOPSY_AGE_PARAMETERS }), scope);
  const summaries = scopeScenarios.map((scenario) =>
    summarizeScenario(scenario, scenarioRows.get(scenario.key) ?? [], baselineById, baselineNeighbors, scenario.parameters),
  );
  const allModelsRows = scenarioRows.get("all_models") ?? [];
  const topParentContributors = buildPairwiseRowSummary(bestRows, baseScenarios.find((scenario) => scenario.key === "best_evidence_no_mprf_class")?.parameters ?? DEFAULT_BIOPSY_AGE_PARAMETERS)
    .sort((a, b) => b.P - a.P)
    .slice(0, 12);
  const topParentContributorsAllModels = allModelsRows.length ? buildPairwiseRowSummary(allModelsRows, mprfScenarios.find((scenario) => scenario.key === "all_models")?.parameters ?? DEFAULT_BIOPSY_AGE_PARAMETERS)
    .sort((a, b) => b.P - a.P)
    .slice(0, 12) : [];
  const maturityAgeSensitivity = buildMaturityAgeSensitivity(scopedData, scope, scopeScenarios);

  return {
    key: scope.key,
    label: scope.label,
    population: scope.population,
    mode: scope.mode,
    includesMprfAgeClassModel: scope.includeMprfAgeClassModel,
    recordCount: baseline.length,
    populationSummary: buildPopulationSummary(scope, bestRows, biopsyRowsForScope, rawBiopsyRowsForScope.length),
    parameters: {
      maleMaturityAgeYears: DEFAULT_BIOPSY_AGE_PARAMETERS.maleMaturityAgeYears,
      femaleMaturityAgeYears: DEFAULT_BIOPSY_AGE_PARAMETERS.femaleMaturityAgeYears,
      maleMaturitySizeM: DEFAULT_BIOPSY_AGE_PARAMETERS.maleMaturitySizeM,
      femaleMaturitySizeM: DEFAULT_BIOPSY_AGE_PARAMETERS.femaleMaturitySizeM,
    },
    summaries,
    bestModelKey: "best_evidence_no_mprf_class",
    bestModelLabel: "Models 1-4, excluding MPRF age class",
    topParentContributors,
    topParentContributorsAllModels,
    maturityAgeSensitivity,
    pairwiseMatrixRows: buildPairwiseMatrixExportRows(bestRows, baseScenarios.find((scenario) => scenario.key === "best_evidence_no_mprf_class")?.parameters ?? DEFAULT_BIOPSY_AGE_PARAMETERS),
  };
}

function buildMaturityAgeSensitivity(data: ResearchData, scope: PopulationScope, scopeScenarios: Scenario[]) {
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
    scopeScenarios.find((scenario) => scenario.key === "best_evidence_no_mprf_class"),
    scopeScenarios.find((scenario) => scenario.key === "all_models"),
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
      rowsByVariant.set(variant.key, buildScopeRows(data, scope, parameters));
    });
    const midpointRows = rowsByVariant.get("midpoint") ?? [];
    const midpointParameters = paramsByVariant.get("midpoint") ?? template.parameters;
    const midpointById = byId(midpointRows);
    const midpointNeighbors = buildNeighborMap(midpointRows);
    const midpointPcKeys = new Set(
      buildPairwiseRelationshipRows(midpointRows, midpointParameters, "pc").map((relationship) => relationshipKey(relationship, "pc")),
    );
    const midpointSKeys = new Set(
      buildPairwiseRelationshipRows(midpointRows, midpointParameters, "cc").map((relationship) => relationshipKey(relationship, "cc")),
    );

    return variants.map((variant) => {
      const rows = rowsByVariant.get(variant.key) ?? [];
      const parameters = paramsByVariant.get(variant.key) ?? template.parameters;
      const rowsWithDelta = rows.map((row) => {
        const base = midpointById.get(populationIdentityKey(row));
        const rankDelta = base?.exploratoryRank == null || row.exploratoryRank == null ? null : row.exploratoryRank - base.exploratoryRank;
        const ageDelta = base?.minimumAgeAsOfYears == null || row.minimumAgeAsOfYears == null ? null : row.minimumAgeAsOfYears - base.minimumAgeAsOfYears;
        const baseNeighbor = midpointNeighbors.get(populationIdentityKey(row));
        const activeNeighbor = buildNeighborMap(rows).get(populationIdentityKey(row));
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
      const pcRelationshipRows = pcRelationships.map((relationship) =>
        formatPcRelationshipRow(relationship, template, variant, midpointPcKeys.has(relationshipKey(relationship, "pc"))),
      );
      const sRelationshipRows = sRelationships.map((relationship) =>
        formatSRelationshipRow(relationship, template, variant, midpointSKeys.has(relationshipKey(relationship, "cc"))),
      );
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
        pcRelationshipRows,
        sRelationshipRows,
        pairwiseMatrixRows: scope.key === "kona_biopsied" ? buildPairwiseMatrixExportRows(rows, parameters) : [],
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
    const base = baselineById.get(populationIdentityKey(row));
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
  if (populationIdentityKey(row) === populationIdentityKey(column)) return { code: "—", detail: "Same animal." };
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
    if (populationIdentityKey(row) === populationIdentityKey(column)) return;
    const code = classifyPairwiseGeneration(row, column, parameters).code;
    if (code !== "—") idsByCode[code].add(populationIdentityKey(row));
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
    if (populationIdentityKey(row) === populationIdentityKey(column)) return;
    const cell = classifyPairwiseGeneration(row, column, parameters);
    if (mode === "pc" && cell.code === "P") relationships.push({ primary: row, secondary: column, code: cell.code, detail: cell.detail });
    if (mode === "cc" && cell.code === "S" && rowIndex < columnIndex) relationships.push({ primary: row, secondary: column, code: cell.code, detail: cell.detail });
  }));
  return relationships;
}

function relationshipKey(
  relationship: { primary: BiopsyExplorationRow; secondary: BiopsyExplorationRow },
  mode: PairwiseRelationshipMode,
) {
  const first = populationIdentityKey(relationship.primary);
  const second = populationIdentityKey(relationship.secondary);
  return mode === "cc" ? [first, second].sort().join("<->") : `${first}->${second}`;
}

function relationshipAnimalFields(row: BiopsyExplorationRow, prefix: string) {
  return {
    [`${prefix}Rank`]: row.exploratoryRank,
    [`${prefix}Name`]: row.name,
    [`${prefix}Sample_ID`]: row.jonathanSequenceId,
    [`${prefix}HAMERCatalogID`]: row.catalogId,
    [`${prefix}MPRFCatalogID`]: formatMprfCatalogId(row.mprfCatalogId),
    [`${prefix}BiopsyID`]: row.pkBiopsyId,
    [`${prefix}Gender`]: row.gender,
    [`${prefix}MinimumAge`]: round(row.minimumAgeAsOfYears),
  };
}

function formatPcRelationshipRow(
  relationship: { primary: BiopsyExplorationRow; secondary: BiopsyExplorationRow; code: PairwiseGenerationCode; detail: string },
  template: Scenario,
  variant: { key: string; label: string; maleMaturityAgeYears: number; femaleMaturityAgeYears: number },
  presentAtMidpoint: boolean,
) {
  return {
    modelKey: template.key,
    modelLabel: template.label,
    maturityVariant: variant.key,
    maturityLabel: variant.label,
    maleMaturityAgeYears: variant.maleMaturityAgeYears,
    femaleMaturityAgeYears: variant.femaleMaturityAgeYears,
    presentAtMidpoint,
    comparisonToMidpoint: variant.key === "midpoint" ? "midpoint" : presentAtMidpoint ? "unchanged from midpoint" : "added vs midpoint",
    code: relationship.code,
    ...relationshipAnimalFields(relationship.primary, "possibleParent"),
    ...relationshipAnimalFields(relationship.secondary, "possibleChild"),
    basis: relationship.detail,
  };
}

function formatSRelationshipRow(
  relationship: { primary: BiopsyExplorationRow; secondary: BiopsyExplorationRow; code: PairwiseGenerationCode; detail: string },
  template: Scenario,
  variant: { key: string; label: string; maleMaturityAgeYears: number; femaleMaturityAgeYears: number },
  presentAtMidpoint: boolean,
) {
  return {
    modelKey: template.key,
    modelLabel: template.label,
    maturityVariant: variant.key,
    maturityLabel: variant.label,
    maleMaturityAgeYears: variant.maleMaturityAgeYears,
    femaleMaturityAgeYears: variant.femaleMaturityAgeYears,
    presentAtMidpoint,
    comparisonToMidpoint: variant.key === "midpoint" ? "midpoint" : presentAtMidpoint ? "unchanged from midpoint" : "added vs midpoint",
    code: relationship.code,
    ...relationshipAnimalFields(relationship.primary, "mantaA"),
    ...relationshipAnimalFields(relationship.secondary, "mantaB"),
    basis: relationship.detail,
  };
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

function writePopulationWorkbook(result: { scopes: any[] }) {
  const workbook = XLSX.utils.book_new();
  const populationSummaryRows = result.scopes.map((scope) => ({
    Scope: scope.label,
    Population: scope.population,
    Mode: scope.mode,
    "Assessable mantas": scope.populationSummary.assessableMantas,
    "Unique biopsied mantas": scope.populationSummary.uniqueBiopsiedMantas,
    "Biopsy records": scope.populationSummary.biopsyRecords,
    "Duplicate biopsy records collapsed": scope.populationSummary.duplicateBiopsyRecordsCollapsed,
    "First sighting": scope.populationSummary.withFirstSighting,
    "Pup at first sighting": scope.populationSummary.pupAtFirstSighting,
    "Size evidence": scope.populationSummary.withSizeEvidence,
    "HAMER age class": scope.populationSummary.withHamerAgeClass,
    "MPRF age class": scope.populationSummary.withMprfAgeClass,
    "Adult evidence": scope.populationSummary.adultAgeClassEvidence,
    "Juvenile evidence": scope.populationSummary.juvenileAgeClassEvidence,
    Males: scope.populationSummary.male,
    Females: scope.populationSummary.female,
    "Unknown sex": scope.populationSummary.unknownSex,
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(populationSummaryRows), "Population summary");

  const summaryRows = result.scopes.flatMap((scope) =>
    scope.summaries.map((summary: any) => ({
      Scope: scope.label,
      Population: scope.population,
      Mode: scope.mode,
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
      "First sighting records": summary.evidenceCounts.withFirstSighting,
      "Pup first sighting records": summary.evidenceCounts.withPupFirstSighting,
      "Age class summaries": summary.evidenceCounts.withAgeClassSummary,
      "Size summaries": summary.evidenceCounts.withSizeSummary,
    })),
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Model sensitivity");

  const maturityRows = result.scopes.flatMap((scope) =>
    scope.maturityAgeSensitivity.map((row: any) => ({
      Scope: scope.label,
      Population: scope.population,
      Mode: scope.mode,
      ...row,
    })),
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(maturityRows), "Maturity sensitivity");

  const maturityPcRows = result.scopes.flatMap((scope) =>
    scope.maturityAgeSensitivity.flatMap((row: any) =>
      (row.pcRelationshipRows ?? []).map((relationship: any) => ({
        Scope: scope.label,
        Population: scope.population,
        Mode: scope.mode,
        ...relationship,
      })),
    ),
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(maturityPcRows), "Maturity P-C pairs");

  const maturitySRows = result.scopes.flatMap((scope) =>
    scope.maturityAgeSensitivity.flatMap((row: any) =>
      (row.sRelationshipRows ?? []).map((relationship: any) => ({
        Scope: scope.label,
        Population: scope.population,
        Mode: scope.mode,
        ...relationship,
      })),
    ),
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(maturitySRows), "Maturity S pairs");

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildMaturityRelationshipChangeRows(result.scopes, "pcRelationshipRows")),
    "P-C changes vs midpoint",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildMaturityRelationshipChangeRows(result.scopes, "sRelationshipRows")),
    "S changes vs midpoint",
  );

  const parentRows = result.scopes.flatMap((scope) =>
    scope.topParentContributors.map((row: any) => ({
      Scope: scope.label,
      Model: scope.bestModelLabel,
      ...row,
    })),
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(parentRows), "Top P contributors");

  result.scopes.forEach((scope) => {
    const sheetName = `${scope.key}_matrix`.slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(scope.pairwiseMatrixRows), sheetName);
    if (scope.key === "kona_biopsied") {
      scope.maturityAgeSensitivity.forEach((row: any) => {
        const matrixRows = row.pairwiseMatrixRows ?? [];
        if (!matrixRows.length) return;
        const modelPart = row.modelKey === "all_models" ? "all" : "best";
        const variantPart = row.maturityVariant === "midpoint" ? "mid" : row.maturityVariant;
        const variantSheetName = `kona_bio_${modelPart}_${variantPart}_matrix`.slice(0, 31);
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(matrixRows), variantSheetName);
      });
    }
  });

  XLSX.writeFile(workbook, path.join(OUT_DIR, "population_age_model_sensitivity_tables.xlsx"));
}

function buildMaturityRelationshipChangeRows(scopes: any[], relationshipField: "pcRelationshipRows" | "sRelationshipRows") {
  const keyFor = (row: any) => relationshipField === "pcRelationshipRows"
    ? `${row.possibleParentHAMERCatalogID || row.possibleParentSample_ID || row.possibleParentName}->${row.possibleChildHAMERCatalogID || row.possibleChildSample_ID || row.possibleChildName}`
    : [row.mantaAHAMERCatalogID || row.mantaASample_ID || row.mantaAName, row.mantaBHAMERCatalogID || row.mantaBSample_ID || row.mantaBName].sort().join("<->");
  return scopes.flatMap((scope) => {
    const rows = scope.maturityAgeSensitivity ?? [];
    const groups = new Map<string, any[]>();
    rows.forEach((row: any) => {
      const key = `${row.modelKey}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    });
    return Array.from(groups.entries()).flatMap(([modelKey, groupRows]) => {
      const midpoint = groupRows.find((row) => row.maturityVariant === "midpoint");
      const midpointRows = midpoint?.[relationshipField] ?? [];
      const midpointByKey = new Map(midpointRows.map((row: any) => [keyFor(row), row]));
      return groupRows
        .filter((row) => row.maturityVariant !== "midpoint")
        .flatMap((variantRow: any) => {
          const activeRows = variantRow[relationshipField] ?? [];
          const activeByKey = new Map(activeRows.map((row: any) => [keyFor(row), row]));
          const added = activeRows
            .filter((row: any) => !midpointByKey.has(keyFor(row)))
            .map((row: any) => ({
              Scope: scope.label,
              Population: scope.population,
              Mode: scope.mode,
              modelKey,
              modelLabel: variantRow.modelLabel,
              maturityVariant: variantRow.maturityVariant,
              maturityLabel: variantRow.maturityLabel,
              maleMaturityAgeYears: variantRow.maleMaturityAgeYears,
              femaleMaturityAgeYears: variantRow.femaleMaturityAgeYears,
              relationshipType: relationshipField === "pcRelationshipRows" ? "P-C" : "S",
              changeVsMidpoint: "added",
              ...row,
            }));
          const removed = midpointRows
            .filter((row: any) => !activeByKey.has(keyFor(row)))
            .map((row: any) => ({
              ...row,
              Scope: scope.label,
              Population: scope.population,
              Mode: scope.mode,
              modelKey,
              modelLabel: variantRow.modelLabel,
              maturityVariant: variantRow.maturityVariant,
              maturityLabel: variantRow.maturityLabel,
              maleMaturityAgeYears: variantRow.maleMaturityAgeYears,
              femaleMaturityAgeYears: variantRow.femaleMaturityAgeYears,
              relationshipType: relationshipField === "pcRelationshipRows" ? "P-C" : "S",
              changeVsMidpoint: "removed",
            }));
          return [...added, ...removed];
        });
    });
  });
}

function buildCatalogAnchorRows(data: ResearchData) {
  const biopsiedCatalogIds = new Set(data.biopsies.map((row) => num(row.fk_catalog_id)).filter((value): value is number => value != null));
  const sightingsById = new Map(data.sightings.map((row) => [num(row.pk_sighting_id), row]));
  const mantasByCatalog = new Map<number, ResearchMantaRow[]>();
  data.mantas.forEach((manta) => {
    const catalogId = num(manta.fk_catalog_id);
    if (catalogId == null) return;
    mantasByCatalog.set(catalogId, [...(mantasByCatalog.get(catalogId) ?? []), manta]);
  });
  const catalogAnchors = data.catalogs
    .filter((catalog) => {
      const catalogId = num(catalog.pk_catalog_id);
      return catalogId != null && !biopsiedCatalogIds.has(catalogId);
    })
    .map((catalog): ResearchBiopsyRow | null => {
      const catalogId = num(catalog.pk_catalog_id);
      if (catalogId == null) return null;
      const latestEvent = (mantasByCatalog.get(catalogId) ?? [])
        .map((manta) => {
          const sighting = num(manta.fk_sighting_id) == null ? undefined : sightingsById.get(num(manta.fk_sighting_id));
          const date = dateOnlyLocal(manta.sighting_date ?? sighting?.sighting_date ?? manta.mprf_date ?? null);
          return { manta, sighting, date };
        })
        .filter((event): event is { manta: ResearchMantaRow; sighting: ResearchSightingRow | undefined; date: string } => Boolean(event.date))
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      const anchorDate =
        latestEvent?.date ??
        dateOnlyLocal(catalog.date_last_sighted) ??
        dateOnlyLocal(catalog.date_first_sighted) ??
        dateOnlyLocal(catalog.MPRF_first_sighted_date) ??
        dateOnlyLocal(catalog.mprf_date_first_sighted);
      if (!anchorDate) return null;
      return {
        pk_biopsy_id: `catalog-${catalogId}`,
        fk_catalog_id: catalogId,
        fk_manta_id: latestEvent ? num(latestEvent.manta.pk_manta_id) : null,
        fk_sighting_id: latestEvent ? num(latestEvent.manta.fk_sighting_id) : null,
        sample_date: anchorDate,
        island: latestEvent?.sighting?.island ?? null,
        lab_id: null,
        raw_sample_id: null,
        source: catalog.is_mprf ? "MPRF-import" : "catalog-exploration",
      };
    })
    .filter((row): row is ResearchBiopsyRow => row != null);
  return [...data.biopsies, ...catalogAnchors];
}

function buildScopeRows(data: ResearchData, scope: PopulationScope, parameters: BiopsyAgeParameters) {
  return rerankRows(dedupePopulationRows(scopePopulationRows(buildBiopsyExplorationRows({ ...data, parameters }), scope)));
}

function scopePopulationRows(rows: BiopsyExplorationRow[], scope: PopulationScope) {
  return rows.filter((row) => {
    const island = normalizeIsland(row.island);
    if (scope.population === "kona") return ["big island", "hawaii", "hawaiʻi", "kona"].includes(island);
    if (scope.population === "maui_nui") return ["maui", "molokai", "molokaʻi", "lanai", "lanaʻi", "kahoolawe", "kahoʻolawe"].includes(island);
    return false;
  });
}

function dedupePopulationRows(rows: BiopsyExplorationRow[]) {
  const byIdentity = new Map<string, BiopsyExplorationRow>();
  rows.forEach((row) => {
    const key = populationIdentityKey(row);
    const existing = byIdentity.get(key);
    if (!existing || comparePopulationRepresentative(row, existing) < 0) {
      byIdentity.set(key, row);
    }
  });
  return Array.from(byIdentity.values());
}

function comparePopulationRepresentative(a: BiopsyExplorationRow, b: BiopsyExplorationRow) {
  return (
    compareNullableNumberDesc(a.minimumAgeAsOfYears, b.minimumAgeAsOfYears) ||
    compareNullableNumberDesc(evidenceStrength(a), evidenceStrength(b)) ||
    compareNullableDateAsc(a.firstSightingDate, b.firstSightingDate) ||
    compareNullableNumberAsc(a.catalogId, b.catalogId) ||
    a.pkBiopsyId.localeCompare(b.pkBiopsyId)
  );
}

function populationIdentityKey(row: BiopsyExplorationRow) {
  if (row.catalogId != null) return `catalog:${row.catalogId}`;
  if (row.mantaId != null) return `manta:${row.mantaId}`;
  if (row.mprfCatalogId != null) return `mprf:${row.mprfCatalogId}`;
  return `biopsy:${row.pkBiopsyId}`;
}

function evidenceStrength(row: BiopsyExplorationRow) {
  return (
    (row.firstSightingDate ? 1 : 0) +
    (row.firstSightingAsPup ? 4 : 0) +
    row.sizeObservationSummary.length * 3 +
    row.ageClassObservationSummary.length * 2 +
    row.ageIntervalCheckpoints.length
  );
}

function compareNullableNumberDesc(a: number | null | undefined, b: number | null | undefined) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function compareNullableNumberAsc(a: number | null | undefined, b: number | null | undefined) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function compareNullableDateAsc(a: string | null | undefined, b: string | null | undefined) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function buildPopulationSummary(scope: PopulationScope, rows: BiopsyExplorationRow[], biopsyRows: BiopsyExplorationRow[], biopsyRecordCount: number) {
  const sexCounts = countSexes(rows);
  const ageClassCounts = countAgeClasses(rows);
  return {
    population: scope.population,
    mode: scope.mode,
    assessableMantas: rows.length,
    uniqueBiopsiedMantas: biopsyRows.length,
    biopsyRecords: biopsyRecordCount,
    duplicateBiopsyRecordsCollapsed: Math.max(0, biopsyRecordCount - biopsyRows.length),
    withFirstSighting: rows.filter((row) => row.firstSightingDate).length,
    pupAtFirstSighting: rows.filter((row) => row.firstSightingAsPup).length,
    withSizeEvidence: rows.filter((row) => row.sizeObservationSummary.length > 0).length,
    withHamerAgeClass: rows.filter((row) => row.ageClassObservationSummary.some((summary) => !summary.toLowerCase().includes("mprf"))).length,
    withMprfAgeClass: rows.filter((row) => row.ageClassObservationSummary.some((summary) => summary.toLowerCase().includes("mprf")) || row.ageIntervalCheckpoints.some((checkpoint) => checkpoint.detail.toLowerCase().includes("mprf"))).length,
    adultAgeClassEvidence: ageClassCounts.adult,
    juvenileAgeClassEvidence: ageClassCounts.juvenile,
    male: sexCounts.male,
    female: sexCounts.female,
    unknownSex: sexCounts.unknown,
  };
}

function countSexes(rows: BiopsyExplorationRow[]) {
  return rows.reduce(
    (counts, row) => {
      const sex = normalizeSex(row.gender);
      if (sex === "male") counts.male += 1;
      else if (sex === "female") counts.female += 1;
      else counts.unknown += 1;
      return counts;
    },
    { male: 0, female: 0, unknown: 0 },
  );
}

function countAgeClasses(rows: BiopsyExplorationRow[]) {
  return rows.reduce(
    (counts, row) => {
      const summaries = [
        row.ageClassWhenBiopsied,
        row.ageClassOnFirstSighting,
        ...row.ageClassObservationSummary,
        ...row.ageIntervalCheckpoints.map((checkpoint) => checkpoint.detail),
      ];
      const stages = new Set(summaries.map((value) => ageClassStage(String(value ?? ""))).filter(Boolean));
      if (stages.has("adult")) counts.adult += 1;
      if (stages.has("juvenile")) counts.juvenile += 1;
      return counts;
    },
    { adult: 0, juvenile: 0 },
  );
}

function normalizeIsland(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function buildPairwiseMatrixExportRows(rows: BiopsyExplorationRow[], parameters: BiopsyAgeParameters) {
  const ordered = rankOrderRowsForExport(rows);
  return ordered.map((row) => {
    const counts: Record<Exclude<PairwiseGenerationCode, "—">, number> = { P: 0, C: 0, S: 0, U: 0 };
    const matrixValues: Record<string, string> = {};
    ordered.forEach((column) => {
      const cell = classifyPairwiseGeneration(row, column, parameters);
      if (cell.code !== "—") counts[cell.code] += 1;
      matrixValues[`#${column.exploratoryRank} ${column.name ?? column.pkBiopsyId}`] = cell.code;
    });
    return {
      Rank: row.exploratoryRank,
      Name: row.name,
      Sample_ID: row.jonathanSequenceId,
      "HAMER Catalog ID": row.catalogId,
      "MPRF Catalog ID": formatMprfCatalogId(row.mprfCatalogId),
      "Minimum age": round(row.minimumAgeAsOfYears),
      P: counts.P,
      C: counts.C,
      S: counts.S,
      U: counts.U,
      ...matrixValues,
    };
  });
}

function rankOrderRowsForExport(rows: BiopsyExplorationRow[]) {
  return [...rows].sort((a, b) => rankSort(a.exploratoryRank, b.exploratoryRank) || String(a.name ?? "").localeCompare(String(b.name ?? "")));
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
  const sorted = [...rows].sort((a, b) => b.exploratoryScore - a.exploratoryScore || rankSort(a.currentRank, b.currentRank) || populationIdentityKey(a).localeCompare(populationIdentityKey(b)));
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
  return new Map(rows.map((row) => [populationIdentityKey(row), row]));
}

function buildNeighborMap(rows: BiopsyExplorationRow[]) {
  const sorted = [...rows].sort((a, b) => rankSort(a.exploratoryRank, b.exploratoryRank) || populationIdentityKey(a).localeCompare(populationIdentityKey(b)));
  return new Map(sorted.map((row, index) => [
    populationIdentityKey(row),
    {
      previous: sorted[index - 1] ? populationIdentityKey(sorted[index - 1]) : null,
      next: sorted[index + 1] ? populationIdentityKey(sorted[index + 1]) : null,
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
