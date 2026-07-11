import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Info, RotateCcw } from "lucide-react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase";
import { dwM, sizeMeasurementIncludedInMean, sizeMeasurementUsable } from "@/utils/sizeMeasurements";
import {
  BIOPSY_AGE_CITATIONS,
  BIOPSY_FIELD_MAPPING,
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
} from "@/lib/research/biopsyAgeRanking";

type SortKey =
  | "exploratoryRank"
  | "currentRank"
  | "rankDelta"
  | "exploratoryScore"
  | "minimumAgeAsOfYears"
  | "maximumAgeAsOfYears"
  | "pkBiopsyId"
  | "name"
  | "totalSightings"
  | "totalYearsObserved"
  | "sizeAtBiopsyM";

const PAGE_SIZE = 1000;
const RESEARCH_DATA_CACHE_KEY = "biopsy-age-rankings-research-data-v2";
type IslandScope = "kona" | "maui" | "oahu";
type PopulationScope = "biopsied" | "all";
type MetricKey = "biopsies" | "size" | "changedCurrent" | "changedModel1Baseline" | "flags";
type CachedResearchData = {
  savedAt: string;
  fingerprint: string;
  biopsies: ResearchBiopsyRow[];
  catalogs: ResearchCatalogRow[];
  mantas: ResearchMantaRow[];
  sightings: ResearchSightingRow[];
  sizes: ResearchSizeRow[];
  ranks: ResearchRankRow[];
};
type BirthYearEstimateRow = {
  row: BiopsyExplorationRow;
  biopsyDate: string | null;
  sizeM: number | null;
  sizeSource: string;
  terminalSizeM: number | null;
  growthRateMPerYear: number | null;
  status: "preterminal" | "terminal" | "unknown";
  minimumAgeYears: number | null;
  latestPossibleBirthYear: number | null;
  weight: number;
  scaledAgeCue: number | null;
};
type PairwiseGenerationCode = "P" | "C" | "S" | "U" | "—";
type PairwiseAnimalCounts = Record<Exclude<PairwiseGenerationCode, "—">, number>;
type PairwiseGenerationCell = {
  code: PairwiseGenerationCode;
  detail: string;
};
type PairwiseRelationshipMode = "pc" | "cc";
type WorkbenchSummary = {
  total: number;
  biopsied: number;
  changedVsCurrent: number;
  changedFromModel1Baseline: number;
  missing: number;
  withSize: number;
};
type EvidenceSummary = {
  withFirstSighting: number;
  withPup: number;
  withAgeClass: number;
  withSize: number;
  withInterval: number;
};

const ISLAND_SCOPES: Array<{ key: IslandScope; label: string; match: (island: string | null) => boolean }> = [
  { key: "kona", label: "Kona", match: (island) => ["big island", "hawaii", "hawaiʻi", "kona"].includes(String(island ?? "").trim().toLowerCase()) },
  { key: "maui", label: "Maui", match: (island) => String(island ?? "").trim().toLowerCase() === "maui" },
  { key: "oahu", label: "Oahu", match: (island) => ["oahu", "oʻahu"].includes(String(island ?? "").trim().toLowerCase()) },
];

const tableColumns: Array<{ key: keyof BiopsyExplorationRow; label: string; numeric?: boolean }> = [
  { key: "currentRank", label: "Current rank", numeric: true },
  { key: "exploratoryRank", label: "Exploratory rank", numeric: true },
  { key: "rankDelta", label: "Rank delta", numeric: true },
  { key: "minimumAgeAsOfYears", label: `Min age as of ${AGE_RANK_AS_OF_DATE}`, numeric: true },
  { key: "maximumAgeAsOfYears", label: `Max age as of ${AGE_RANK_AS_OF_DATE}`, numeric: true },
  { key: "ageIntervalSummary", label: "Age interval" },
  { key: "exploratoryScore", label: "Minimum-age score", numeric: true },
  { key: "pkBiopsyId", label: "pk_biopsy_id" },
  { key: "mprfBiopsyId", label: "MPRF biopsy id" },
  { key: "jonathanSequenceId", label: "Jonathan sequence id" },
  { key: "name", label: "Name" },
  { key: "island", label: "Island" },
  { key: "gender", label: "gender" },
  { key: "ageClassWhenBiopsied", label: "age class when biopsied" },
  { key: "ageClassOnFirstSighting", label: "age class on first sighting" },
  { key: "totalSightings", label: "Total Sightings", numeric: true },
  { key: "totalSightingsPriorToBiopsy", label: "Total Sightings prior to biopsy", numeric: true },
  { key: "totalYearsObserved", label: "Total years observed", numeric: true },
  { key: "totalYearsObservedPriorToBiopsy", label: "Total years observed prior to biopsy", numeric: true },
  { key: "observationHistoryNote", label: "Observation history note" },
  { key: "firstSightingAsPup", label: "First sighting as pup" },
  { key: "ageClassChangedSinceFirstSighting", label: "Age class changed since first sighting" },
  { key: "sizeAtBiopsyM", label: "Size at biopsy", numeric: true },
  { key: "nearestSizeBeforeBiopsyM", label: "Nearest size before biopsy", numeric: true },
  { key: "daysBeforeBiopsySize", label: "Days before biopsy size", numeric: true },
  { key: "nearestSizeAfterBiopsyM", label: "Nearest size after biopsy", numeric: true },
  { key: "daysAfterBiopsySize", label: "Days after biopsy size", numeric: true },
  { key: "totalSizes", label: "Total sizes", numeric: true },
  { key: "probableAgeBasedOnSize", label: "Probable age based on size" },
  { key: "probableBirthYearBasedOnSize", label: "Probable birth year based on size" },
];

const MATURITY_AGE_ASSUMPTION_HELP =
  `Adult-at-date minimum age is calculated as elapsed time from first adult observation to ${AGE_RANK_AS_OF_DATE} plus the selected sex-specific maturity age. Defaults use midpoint values from literature-supported ranges: male 6.5 years from a 5-8 year range and female 11.5 years from an 8-15 year range. Sensitivity testing across those full ranges changed mean minimum-age estimates by 0.54 years and mean rank position by 1.2 ranks, supporting rank robustness. Sources: SciSpace Age Ranking Mantas Lit Review, July 3 2026; Manta Age Interval Framework, July 2026; workbench sensitivity analysis.`;

const AGE_INTERVAL_EVIDENCE_HELP =
  "Age intervals are built from selectable evidence modules: Model 1 first sighting baseline, Model 2 pup-at-first-sighting birth anchor, Model 3 HAMER size evidence, Model 4 HAMER dated age-class evidence, and Model 5 MPRF dated/first-sighting age-class evidence. Model 2 is direct birth-anchor evidence; Models 3-5 are assumption-assisted because they translate size or life-stage labels into maturity-age bounds.";

const ASSUMPTION_BOUNDS_HELP =
  "Maturity-age assumptions are baked into Models 3, 4, and 5 because the observed data alone did not alter minimum ages or rankings. When those models are on, they use the selected male/female maturity ages. Model 3 also depends on the selected maturity-size thresholds.";

const MODEL_1_HELP =
  `Uses only the earliest known first sighting date as a minimum-age floor as of ${AGE_RANK_AS_OF_DATE}. This is the non-arbitrary comparison baseline used to evaluate all other model combinations.`;

const MODEL_2_HELP =
  "Uses first-sighting pup/neonate labels as approximate birth anchors. For Kona, some pup labels may originate from MPRF, so this model is separated from HAMER age-class evidence and should be interpreted as provenance-sensitive.";

const MODEL_3_HELP =
  "Uses dated HAMER size measurements plus selected maturity-size thresholds and sex-specific maturity ages. Mature-sized animals can receive a maturity-age floor; below-maturity measurements can limit maximum plausible age.";

const MODEL_4_HELP =
  "Uses dated HAMER age-class determinations plus the selected sex-specific maturity ages. Adult labels can raise minimum age; juvenile labels can constrain maximum plausible age. MPRF first-sighting age classes and catalog last-age-class values are excluded.";

const MODEL_5_HELP =
  "Uses MPRF age-class labels tied to a date, plus the selected sex-specific maturity ages. This is separated from HAMER age-class evidence so its influence can be measured directly, especially when comparing against Eli's rankings. Catalog last-age-class values are not used as model evidence.";

const MALE_MATURITY_SIZE_HELP =
  "Male maturity size defaults to 2.8 m disc width, with 2.7-2.8 m treated as a transition/uncertain zone rather than a hard biological cliff. This follows the Hawaii manta maturity framework and the project model derived from Deakos 2010, Deakos 2011, Deakos Manta Repro 2012, and the July 2026 SciSpace maturity review.";

const FEMALE_MATURITY_SIZE_HELP =
  "Female maturity size defaults to 3.37 m disc width, with near-threshold animals interpreted cautiously as transition/uncertain. This value aligns with the existing project model and Hawaii M. alfredi maturity evidence summarized from Deakos 2010, Deakos 2011, Deakos Manta Repro 2012, and the July 2026 SciSpace maturity review.";

const MALE_TERMINAL_SIZE_HELP =
  "Male terminal size defaults to 3.03 m disc width. Terminal size is used as a descriptive benchmark for size status and optional birth-year sensitivity, not as a maximum-age cap. Source basis: Hawaii size distributions and maturity context from Deakos 2010, Deakos 2011, Deakos Manta Repro 2012, plus the workbench age-growth exploration.";

const FEMALE_TERMINAL_SIZE_HELP =
  "Female terminal size defaults to 3.64 m disc width. Terminal size is used as a descriptive benchmark for size status and optional birth-year sensitivity, not as a maximum-age cap. Source basis: Hawaii size distributions and maturity context from Deakos 2010, Deakos 2011, Deakos Manta Repro 2012, plus the workbench age-growth exploration.";

const BIRTH_SIZE_HELP =
  "Birth size defaults to 1.6 m disc width as a conservative lower bound for optional growth/birth-year sensitivity. Justification comes from captive Okinawa M. alfredi birth-to-maturity observations, Deakos near-term fetus/reproductive observations, and small juvenile/nursery-area measurements summarized in the July 2026 literature review. This value is not used in the primary age-ranking decision tree.";

const GROWTH_RATE_HELP =
  "Growth rate is not used in the primary age-ranking decision tree or pairwise generation calls. It is only used in the separate latest-possible-birth-year sensitivity modal. Because local observed growth rates and the Okinawa captive growth trajectory may not represent lifelong wild growth, this should be treated as exploratory context, not a primary age-ranking driver.";

export default function BiopsyAgeRankingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialScope = parseIslandScope(searchParams.get("island"));
  const [activeScope, setActiveScope] = useState<IslandScope>(initialScope);
  const [scopeParameters, setScopeParameters] = useState<Record<IslandScope, BiopsyAgeParameters>>({
    kona: DEFAULT_BIOPSY_AGE_PARAMETERS,
    maui: DEFAULT_BIOPSY_AGE_PARAMETERS,
    oahu: DEFAULT_BIOPSY_AGE_PARAMETERS,
  });
  const [biopsies, setBiopsies] = useState<ResearchBiopsyRow[]>([]);
  const [catalogs, setCatalogs] = useState<ResearchCatalogRow[]>([]);
  const [mantas, setMantas] = useState<ResearchMantaRow[]>([]);
  const [sightings, setSightings] = useState<ResearchSightingRow[]>([]);
  const [sizes, setSizes] = useState<ResearchSizeRow[]>([]);
  const [ranks, setRanks] = useState<ResearchRankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showChangedOnly, setShowChangedOnly] = useState(false);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("exploratoryRank");
  const [sortAsc, setSortAsc] = useState(true);
  const [metricModal, setMetricModal] = useState<MetricKey | null>(null);
  const [modalPopulation, setModalPopulation] = useState<PopulationScope>("biopsied");
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [pairwiseOpen, setPairwiseOpen] = useState(false);
  const [birthYearOpen, setBirthYearOpen] = useState(false);
  const [preterminalBirthYearWeight, setPreterminalBirthYearWeight] = useState(75);
  const [terminalBirthYearWeight, setTerminalBirthYearWeight] = useState(10);
  const parameters = scopeParameters[activeScope];

  useEffect(() => {
    const nextScope = parseIslandScope(searchParams.get("island"));
    setActiveScope((current) => (current === nextScope ? current : nextScope));
  }, [searchParams]);

  function changeScope(scope: IslandScope) {
    setActiveScope(scope);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("island", scope);
      return next;
    }, { replace: true });
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);
      const cached = readCachedResearchData();
      if (cached) {
        applyResearchData(cached);
        setLoading(false);
        setCacheStatus(`Loaded cached data from ${formatCacheTimestamp(cached.savedAt)}; checking database for updates...`);
      }

      try {
        const fresh = await fetchResearchData();
        if (!alive) return;
        applyResearchData(fresh);
        writeCachedResearchData(fresh);
        setCacheStatus(cached && cached.fingerprint === fresh.fingerprint
          ? `Using cached data; database check completed ${formatCacheTimestamp(fresh.savedAt)}.`
          : `Database data refreshed ${formatCacheTimestamp(fresh.savedAt)}.`);
      } catch (err) {
        console.error("[BiopsyAgeRankings] load error", err);
        if (alive) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, []);

  function applyResearchData(data: CachedResearchData) {
    setBiopsies(data.biopsies);
    setRanks(data.ranks);
    setCatalogs(data.catalogs);
    setMantas(data.mantas);
    setSightings(data.sightings);
    setSizes(data.sizes);
  }

  const populationBiopsyAnchors = useMemo(
    () => ({
      biopsied: biopsies,
      all: buildPopulationBiopsyAnchors({ biopsies, catalogs, mantas, sightings }),
    }),
    [biopsies, catalogs, mantas, sightings],
  );

  const populationRows = useMemo(
    () => ({
      biopsied: rerankRows(scopeRows(buildBiopsyExplorationRows({ biopsies: populationBiopsyAnchors.biopsied, catalogs, mantas, sightings, sizes, ranks, parameters }), activeScope)),
      all: rerankRows(scopeRows(buildBiopsyExplorationRows({ biopsies: populationBiopsyAnchors.all, catalogs, mantas, sightings, sizes, ranks, parameters }), activeScope)),
    }),
    [activeScope, catalogs, mantas, parameters, populationBiopsyAnchors, ranks, sightings, sizes],
  );

  const populationModel1BaselineRows = useMemo(
    () => ({
      biopsied: rerankRows(scopeRows(buildBiopsyExplorationRows({ biopsies: populationBiopsyAnchors.biopsied, catalogs, mantas, sightings, sizes, ranks, parameters: MODEL_1_BASELINE_BIOPSY_AGE_PARAMETERS }), activeScope)),
      all: rerankRows(scopeRows(buildBiopsyExplorationRows({ biopsies: populationBiopsyAnchors.all, catalogs, mantas, sightings, sizes, ranks, parameters: MODEL_1_BASELINE_BIOPSY_AGE_PARAMETERS }), activeScope)),
    }),
    [activeScope, catalogs, mantas, populationBiopsyAnchors, ranks, sightings, sizes],
  );

  const rows = populationRows[modalPopulation];
  const model1BaselineRows = populationModel1BaselineRows[modalPopulation];

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      const inSearch =
        !needle ||
        [row.pkBiopsyId, row.mprfBiopsyId, row.jonathanSequenceId, row.name, row.catalogId, row.mantaId]
          .some((value) => String(value ?? "").toLowerCase().includes(needle));
      const changedOk = !showChangedOnly || (row.rankDelta != null && row.rankDelta !== 0) || row.ageClassChangedSinceFirstSighting;
      const missingOk = !showMissingOnly || row.flags.length > 0;
      return inSearch && changedOk && missingOk;
    });

    return filtered.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const result = compareValues(av, bv);
      return sortAsc ? result : -result;
    });
  }, [rows, search, showChangedOnly, showMissingOnly, sortKey, sortAsc]);

  const populationSummaries = useMemo(
    () => ({
      biopsied: summarizeWorkbenchRows(populationRows.biopsied, populationModel1BaselineRows.biopsied),
      all: summarizeWorkbenchRows(populationRows.all, populationModel1BaselineRows.all),
    }),
    [populationModel1BaselineRows, populationRows],
  );

  const populationEvidenceSummaries = useMemo(
    () => ({
      biopsied: summarizeEvidenceRows(populationRows.biopsied, populationSummaries.biopsied.withSize),
      all: summarizeEvidenceRows(populationRows.all, populationSummaries.all.withSize),
    }),
    [populationRows, populationSummaries],
  );

  const populationMetricRows = useMemo(
    () => ({
      biopsied: buildMetricRows(populationRows.biopsied, populationModel1BaselineRows.biopsied),
      all: buildMetricRows(populationRows.all, populationModel1BaselineRows.all),
    }),
    [populationModel1BaselineRows, populationRows],
  );

  const birthYearRows = useMemo(
    () => buildBirthYearEstimateRows({
      rows,
      biopsies,
      sightings,
      growthRate: parameters.juvenileGrowthRateMPerYear,
      birthSize: parameters.birthSizeM,
      maleTerminalSize: parameters.maleTerminalSizeM,
      femaleTerminalSize: parameters.femaleTerminalSizeM,
      preterminalWeight: preterminalBirthYearWeight,
      terminalWeight: terminalBirthYearWeight,
    }),
    [
      biopsies,
      parameters.birthSizeM,
      parameters.femaleTerminalSizeM,
      parameters.juvenileGrowthRateMPerYear,
      parameters.maleTerminalSizeM,
      preterminalBirthYearWeight,
      rows,
      sightings,
      terminalBirthYearWeight,
    ],
  );
  const populationPairwiseSummaries = useMemo(
    () => ({
      biopsied: buildPairwiseGenerationAnimalCounts(populationRows.biopsied, parameters),
      all: buildPairwiseGenerationAnimalCounts(populationRows.all, parameters),
    }),
    [parameters, populationRows],
  );

  function updateNumber(key: keyof BiopsyAgeParameters, value: string) {
    const n = Number(value);
    setScopeParameters((current) => ({
      ...current,
      [activeScope]: { ...current[activeScope], [key]: Number.isFinite(n) ? n : current[activeScope][key] },
    }));
  }

  function updateBoolean(key: keyof BiopsyAgeParameters, value: boolean) {
    setScopeParameters((current) => ({
      ...current,
      [activeScope]: { ...current[activeScope], [key]: value },
    }));
  }

  function openMetricModal(population: PopulationScope, metric: MetricKey) {
    setModalPopulation(population);
    setMetricModal(metric);
  }

  function openRecordsModal(population: PopulationScope) {
    setModalPopulation(population);
    setRecordsOpen(true);
  }

  function openPairwiseModal(population: PopulationScope) {
    setModalPopulation(population);
    setPairwiseOpen(true);
  }

  function exportCsv() {
    const headers = tableColumns.map((column) => column.label).concat(["Evidence", "Flags"]);
    const csvRows = filteredRows.map((row) =>
      tableColumns
        .map((column) => formatCsv(formatRowCell(row, column.key)))
        .concat([formatCsv(row.evidence.join(" | ")), formatCsv(row.flags.join(" | "))]),
    );
    const csv = [headers, ...csvRows].map((line) => line.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "biopsy_age_ranking_exploration.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50">
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white py-8 px-4">
          <div className="max-w-[1600px] mx-auto">
            <h1 className="text-3xl font-semibold">Biopsy Age Ranking Workbenches</h1>
            <p className="mt-2 max-w-4xl text-blue-50">
              One island-scoped exploratory ranking deck for biopsy records, sighting history, size evidence, and adjustable maturity assumptions.
            </p>
          </div>
        </div>

        <div className="max-w-[1600px] mx-auto px-4 py-2">
          <Link to="/admin" className="text-sm text-blue-700 underline">
            Admin
          </Link>
          <span className="text-sm text-slate-600"> / </span>
          <Link to="/admin/research" className="text-sm text-blue-700 underline">
            Research Exploration
          </Link>
          <span className="text-sm text-slate-600"> / Biopsy Age Rankings</span>
        </div>

        <main className="max-w-[1600px] mx-auto px-4 pb-8 space-y-4">
          <section className="sticky top-0 z-20 bg-slate-50 pt-3 pb-3 border-b">
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {activeIslandLabel(activeScope)} manta ray workbench
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Biopsied-only and all-mantas scopes are calculated side by side using the same active model settings.
                    </p>
                  </div>
                  <div className="flex rounded-md border bg-white p-1">
                    {ISLAND_SCOPES.map((scope) => (
                      <Button
                        key={scope.key}
                        variant={activeScope === scope.key ? "default" : "ghost"}
                        size="sm"
                        onClick={() => changeScope(scope.key)}
                      >
                        {scope.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {cacheStatus ? <div className="rounded-md border bg-white px-3 py-2 text-xs text-slate-500">{cacheStatus}</div> : null}

                <section className="rounded-md border bg-white p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="flex items-center gap-1 font-semibold text-slate-900">
                        <span>Age interval evidence</span>
                        <HelpTip text={AGE_INTERVAL_EVIDENCE_HELP} />
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Each record gets checkpoint-based minimum and maximum plausible ages as of {AGE_RANK_AS_OF_DATE}.
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    <PopulationScopePanel
                      title="Biopsied mantas"
                      description={`${activeIslandLabel(activeScope)} biopsy records only.`}
                      loading={loading}
                      summary={populationSummaries.biopsied}
                      evidenceSummary={populationEvidenceSummaries.biopsied}
                      pairwiseSummary={populationPairwiseSummaries.biopsied}
                      onMetricClick={(metric) => openMetricModal("biopsied", metric)}
                      onShowRecords={() => openRecordsModal("biopsied")}
                      onViewMatrix={() => openPairwiseModal("biopsied")}
                    />
                    <PopulationScopePanel
                      title="All mantas"
                      description={`${activeIslandLabel(activeScope)} catalog mantas, including ${populationSummaries.all.biopsied} biopsy records.`}
                      loading={loading}
                      summary={populationSummaries.all}
                      evidenceSummary={populationEvidenceSummaries.all}
                      pairwiseSummary={populationPairwiseSummaries.all}
                      onMetricClick={(metric) => openMetricModal("all", metric)}
                      onShowRecords={() => openRecordsModal("all")}
                      onViewMatrix={() => openPairwiseModal("all")}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                    <NumberControl
                      label="Male maturity size"
                      value={parameters.maleMaturitySizeM}
                      defaultValue={DEFAULT_BIOPSY_AGE_PARAMETERS.maleMaturitySizeM}
                      suffix="m"
                      help={MALE_MATURITY_SIZE_HELP}
                      onChange={(value) => updateNumber("maleMaturitySizeM", value)}
                      onReset={() => updateNumber("maleMaturitySizeM", String(DEFAULT_BIOPSY_AGE_PARAMETERS.maleMaturitySizeM))}
                    />
                    <NumberControl
                      label="Female maturity size"
                      value={parameters.femaleMaturitySizeM}
                      defaultValue={DEFAULT_BIOPSY_AGE_PARAMETERS.femaleMaturitySizeM}
                      suffix="m"
                      help={FEMALE_MATURITY_SIZE_HELP}
                      onChange={(value) => updateNumber("femaleMaturitySizeM", value)}
                      onReset={() => updateNumber("femaleMaturitySizeM", String(DEFAULT_BIOPSY_AGE_PARAMETERS.femaleMaturitySizeM))}
                    />
                    <NumberControl
                      label="Male maturity age"
                      value={parameters.maleMaturityAgeYears}
                      defaultValue={DEFAULT_BIOPSY_AGE_PARAMETERS.maleMaturityAgeYears}
                      suffix="yrs"
                      help={MATURITY_AGE_ASSUMPTION_HELP}
                      onChange={(value) => updateNumber("maleMaturityAgeYears", value)}
                      onReset={() => updateNumber("maleMaturityAgeYears", String(DEFAULT_BIOPSY_AGE_PARAMETERS.maleMaturityAgeYears))}
                    />
                    <NumberControl
                      label="Female maturity age"
                      value={parameters.femaleMaturityAgeYears}
                      defaultValue={DEFAULT_BIOPSY_AGE_PARAMETERS.femaleMaturityAgeYears}
                      suffix="yrs"
                      help={MATURITY_AGE_ASSUMPTION_HELP}
                      onChange={(value) => updateNumber("femaleMaturityAgeYears", value)}
                      onReset={() => updateNumber("femaleMaturityAgeYears", String(DEFAULT_BIOPSY_AGE_PARAMETERS.femaleMaturityAgeYears))}
                    />
                    <NumberControl
                      label="Male terminal size"
                      value={parameters.maleTerminalSizeM}
                      defaultValue={DEFAULT_BIOPSY_AGE_PARAMETERS.maleTerminalSizeM}
                      suffix="m"
                      help={MALE_TERMINAL_SIZE_HELP}
                      onChange={(value) => updateNumber("maleTerminalSizeM", value)}
                      onReset={() => updateNumber("maleTerminalSizeM", String(DEFAULT_BIOPSY_AGE_PARAMETERS.maleTerminalSizeM))}
                    />
                    <NumberControl
                      label="Female terminal size"
                      value={parameters.femaleTerminalSizeM}
                      defaultValue={DEFAULT_BIOPSY_AGE_PARAMETERS.femaleTerminalSizeM}
                      suffix="m"
                      help={FEMALE_TERMINAL_SIZE_HELP}
                      onChange={(value) => updateNumber("femaleTerminalSizeM", value)}
                      onReset={() => updateNumber("femaleTerminalSizeM", String(DEFAULT_BIOPSY_AGE_PARAMETERS.femaleTerminalSizeM))}
                    />
                    <NumberControl
                      label="Birth size"
                      value={parameters.birthSizeM}
                      defaultValue={DEFAULT_BIOPSY_AGE_PARAMETERS.birthSizeM}
                      suffix="m"
                      help={BIRTH_SIZE_HELP}
                      onChange={(value) => updateNumber("birthSizeM", value)}
                      onReset={() => updateNumber("birthSizeM", String(DEFAULT_BIOPSY_AGE_PARAMETERS.birthSizeM))}
                    />
                    <NumberControl
                      label="Growth rate"
                      value={parameters.juvenileGrowthRateMPerYear}
                      defaultValue={DEFAULT_BIOPSY_AGE_PARAMETERS.juvenileGrowthRateMPerYear}
                      suffix="m/yr"
                      step="0.01"
                      help={GROWTH_RATE_HELP}
                      onChange={(value) => updateNumber("juvenileGrowthRateMPerYear", value)}
                      onReset={() => updateNumber("juvenileGrowthRateMPerYear", String(DEFAULT_BIOPSY_AGE_PARAMETERS.juvenileGrowthRateMPerYear))}
                    />
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-5">
                    <ModelControlCard
                      title="Model 1. First sighting baseline"
                      description="Earliest known first sighting date only."
                      help={MODEL_1_HELP}
                      checked={parameters.includeLifeHistoryEvidence}
                      locked
                    />
                    <ModelControlCard
                      title="Model 2. Pup first sighting"
                      description="Direct birth-anchor evidence for first-sighting pup labels."
                      help={MODEL_2_HELP}
                      checked={parameters.includePupEvidence && parameters.treatPupAsBirthAnchor}
                      onCheckedChange={(checked) => {
                        updateBoolean("includePupEvidence", checked);
                        updateBoolean("treatPupAsBirthAnchor", checked);
                      }}
                    />
                    <ModelControlCard
                      title="Model 3. HAMER size evidence"
                      description="Dated HAMER size measurements + maturity assumptions."
                      help={MODEL_3_HELP}
                      checked={parameters.includeSizeEvidence}
                      onCheckedChange={(checked) => {
                        updateBoolean("includeSizeEvidence", checked);
                        updateBoolean("applySizeMaturityAssumptions", checked);
                      }}
                    />
                    <ModelControlCard
                      title="Model 4. HAMER age-class evidence"
                      description="Dated HAMER age classes + maturity assumptions."
                      help={MODEL_4_HELP}
                      checked={parameters.includeAgeClassEvidence}
                      onCheckedChange={(checked) => {
                        updateBoolean("includeAgeClassEvidence", checked);
                        updateBoolean("applyAgeClassMaturityAssumptions", checked);
                      }}
                    />
                    <ModelControlCard
                      title="Model 5. MPRF age class"
                      description="Dated MPRF age classes + maturity assumptions."
                      help={MODEL_5_HELP}
                      checked={parameters.includeMprfAgeClassEvidence}
                      onCheckedChange={(checked) => {
                        updateBoolean("includeMprfAgeClassEvidence", checked);
                        updateBoolean("applyMprfAgeClassMaturityAssumptions", checked);
                      }}
                    />
                  </div>
                </section>

                <details className="rounded-md border bg-white">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-800">
                    Age interval decision tree documentation
                  </summary>
                  <div className="border-t p-3">
                    <AgeDecisionTreePanel parameters={parameters} />
                  </div>
                </details>

                <details className="rounded-md border bg-white">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-800">
                    Ranking decision rule
                  </summary>
                  <div className="border-t p-3">
                    <RankDecisionRulePanel />
                  </div>
                </details>

                <details className="rounded-md border bg-white">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-800">
                    Literature assumptions
                  </summary>
                  <div className="grid grid-cols-1 gap-2 border-t p-3 text-xs text-slate-600 md:grid-cols-3">
                    {BIOPSY_AGE_CITATIONS.map((citation) => (
                      <div key={citation.label} className="rounded border bg-white px-3 py-2">
                        <div className="font-semibold text-slate-800">{citation.label}</div>
                        <div>{citation.detail}</div>
                      </div>
                    ))}
                  </div>
                </details>
              </CardContent>
            </Card>
          </section>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Failed to load biopsy exploration data: {error}
            </div>
          ) : null}
        </main>

        <MetricRowsModal
          open={metricModal != null}
          onOpenChange={(open) => !open && setMetricModal(null)}
          title={metricModal ? `${activeIslandLabel(activeScope)} ${populationScopeLabel(modalPopulation)}: ${metricTitle(metricModal, modalPopulation === "biopsied")}` : ""}
          rows={metricModal ? populationMetricRows[modalPopulation][metricModal] : []}
          model1BaselineRows={model1BaselineRows}
        />
        <AgeEvidenceRecordsModal
          open={recordsOpen}
          onOpenChange={setRecordsOpen}
          title={`${activeIslandLabel(activeScope)} ${populationScopeLabel(modalPopulation)} age evidence`}
          rows={rows}
          model1BaselineRows={model1BaselineRows}
          parameters={parameters}
          biopsiedOnly={modalPopulation === "biopsied"}
        />
        <PairwiseGenerationMatrixModal
          open={pairwiseOpen}
          onOpenChange={setPairwiseOpen}
          title={`${activeIslandLabel(activeScope)} ${populationScopeLabel(modalPopulation)} pairwise generation diagnostics`}
          rows={rows}
          parameters={parameters}
          biopsiedOnly={modalPopulation === "biopsied"}
        />
        <BirthYearEstimateModal
          open={birthYearOpen}
          onOpenChange={setBirthYearOpen}
          rows={birthYearRows}
          growthRate={parameters.juvenileGrowthRateMPerYear}
          birthSize={parameters.birthSizeM}
          maleTerminalSize={parameters.maleTerminalSizeM}
          femaleTerminalSize={parameters.femaleTerminalSizeM}
          preterminalWeight={preterminalBirthYearWeight}
          terminalWeight={terminalBirthYearWeight}
          onPreterminalWeightChange={setPreterminalBirthYearWeight}
          onTerminalWeightChange={setTerminalBirthYearWeight}
        />
      </div>
    </Layout>
  );
}

function activeIslandLabel(scope: IslandScope) {
  return ISLAND_SCOPES.find((item) => item.key === scope)?.label ?? scope;
}

function populationScopeLabel(scope: PopulationScope) {
  return scope === "biopsied" ? "biopsied mantas" : "all mantas";
}

function parseIslandScope(value: string | null): IslandScope {
  return ISLAND_SCOPES.some((item) => item.key === value) ? (value as IslandScope) : "kona";
}

function summarizeWorkbenchRows(rows: BiopsyExplorationRow[], model1BaselineRows: BiopsyExplorationRow[]): WorkbenchSummary {
  const changedVsCurrent = rows.filter((row) => row.rankDelta != null && row.rankDelta !== 0).length;
  const changedFromModel1Baseline = rowsWithRelativeOrderChange(rows, model1BaselineRows).length;
  const missing = rows.filter((row) => row.flags.length > 0).length;
  const withSize = rows.filter((row) => row.sizeAtBiopsyM != null || row.nearestSizeBeforeBiopsyM != null || row.nearestSizeAfterBiopsyM != null).length;
  const biopsied = rows.filter((row) => !row.pkBiopsyId.startsWith("catalog-")).length;
  return { total: rows.length, biopsied, changedVsCurrent, changedFromModel1Baseline, missing, withSize };
}

function summarizeEvidenceRows(rows: BiopsyExplorationRow[], withSize: number): EvidenceSummary {
  const withPup = rows.filter((row) => row.firstSightingAsPup).length;
  const withAgeClass = rows.filter((row) => row.ageClassWhenBiopsied || row.ageClassOnFirstSighting).length;
  const withFirstSighting = rows.filter((row) => row.firstSightingDate).length;
  const withInterval = rows.filter((row) => row.minimumAgeAsOfYears != null || row.maximumAgeAsOfYears != null).length;
  return { withFirstSighting, withPup, withAgeClass, withSize, withInterval };
}

function buildMetricRows(rows: BiopsyExplorationRow[], model1BaselineRows: BiopsyExplorationRow[]) {
  return {
    biopsies: rows,
    size: rows.filter((row) => row.sizeAtBiopsyM != null || row.nearestSizeBeforeBiopsyM != null || row.nearestSizeAfterBiopsyM != null),
    changedCurrent: rows.filter((row) => row.rankDelta != null && row.rankDelta !== 0),
    changedModel1Baseline: rowsWithRelativeOrderChange(rows, model1BaselineRows),
    flags: rows.filter((row) => row.flags.length > 0),
  } satisfies Record<MetricKey, BiopsyExplorationRow[]>;
}

function buildPopulationBiopsyAnchors({
  biopsies,
  catalogs,
  mantas,
  sightings,
}: {
  biopsies: ResearchBiopsyRow[];
  catalogs: ResearchCatalogRow[];
  mantas: ResearchMantaRow[];
  sightings: ResearchSightingRow[];
}) {
  const biopsiedCatalogIds = new Set(biopsies.map((row) => toNumberLocal(row.fk_catalog_id)).filter((value): value is number => value != null));
  const sightingsById = new Map(sightings.map((row) => [toNumberLocal(row.pk_sighting_id), row]));
  const mantasByCatalog = new Map<number, ResearchMantaRow[]>();
  mantas.forEach((manta) => {
    const catalogId = toNumberLocal(manta.fk_catalog_id);
    if (catalogId == null) return;
    mantasByCatalog.set(catalogId, [...(mantasByCatalog.get(catalogId) ?? []), manta]);
  });

  const catalogAnchors = catalogs
    .filter((catalog) => {
      const catalogId = toNumberLocal(catalog.pk_catalog_id);
      return catalogId != null && !biopsiedCatalogIds.has(catalogId);
    })
    .map((catalog): ResearchBiopsyRow | null => {
      const catalogId = toNumberLocal(catalog.pk_catalog_id);
      if (catalogId == null) return null;
      const relatedMantas = mantasByCatalog.get(catalogId) ?? [];
      const latestEvent = relatedMantas
        .map((manta) => {
          const sighting = toNumberLocal(manta.fk_sighting_id) == null ? undefined : sightingsById.get(toNumberLocal(manta.fk_sighting_id));
          const date = dateOnlyLocal(manta.sighting_date ?? sighting?.sighting_date ?? manta.mprf_date ?? null);
          return { manta, sighting, date };
        })
        .filter((event): event is { manta: ResearchMantaRow; sighting: ResearchSightingRow | undefined; date: string } => Boolean(event.date))
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      const anchorDate = latestEvent?.date ?? dateOnlyLocal(catalog.date_last_sighted) ?? dateOnlyLocal(catalog.date_first_sighted) ?? dateOnlyLocal(catalog.MPRF_first_sighted_date);
      if (!anchorDate) return null;
      return {
        pk_biopsy_id: `catalog-${catalogId}`,
        fk_catalog_id: catalogId,
        fk_manta_id: latestEvent ? toNumberLocal(latestEvent.manta.pk_manta_id) : null,
        fk_sighting_id: latestEvent ? toNumberLocal(latestEvent.manta.fk_sighting_id) : null,
        sample_date: anchorDate,
        island: latestEvent?.sighting?.island ?? null,
        lab_id: null,
        raw_sample_id: null,
        source: catalog.is_mprf ? "MPRF-import" : "catalog-exploration",
      };
    })
    .filter((row): row is ResearchBiopsyRow => row != null);

  return [...biopsies, ...catalogAnchors];
}

function scopeRows(rows: BiopsyExplorationRow[], scope: IslandScope) {
  const config = ISLAND_SCOPES.find((item) => item.key === scope);
  if (!config) return rows;
  return rows.filter((row) => config.match(row.island));
}

function rerankRows(rows: BiopsyExplorationRow[]) {
  const nextRows = rows.map((row) => ({ ...row }));
  const sortedScores = [...nextRows].sort(
    (a, b) =>
      (b.exploratoryScore ?? 0) - (a.exploratoryScore ?? 0) ||
      compareValues(a.currentRank, b.currentRank) ||
      compareValues(a.pkBiopsyId, b.pkBiopsyId),
  );
  let previousScore: number | null = null;
  let previousRank = 0;
  sortedScores.forEach((row, index) => {
    const rank = previousScore != null && row.exploratoryScore === previousScore ? previousRank : index + 1;
    row.exploratoryRank = rank;
    row.rankDelta = row.currentRank == null ? null : rank - row.currentRank;
    previousScore = row.exploratoryScore;
    previousRank = rank;
  });
  return nextRows;
}

type RankNeighbor = {
  previous: string | null;
  next: string | null;
};

function rowsWithRelativeOrderChange(rows: BiopsyExplorationRow[], baselineRows: BiopsyExplorationRow[]) {
  const activeNeighbors = buildRankNeighborMap(rows);
  const baselineNeighbors = buildRankNeighborMap(baselineRows);
  return rows.filter((row) => {
    const active = activeNeighbors.get(row.pkBiopsyId);
    const baseline = baselineNeighbors.get(row.pkBiopsyId);
    if (!active || !baseline) return false;
    return active.previous !== baseline.previous && active.next !== baseline.next;
  });
}

function buildRankNeighborMap(rows: BiopsyExplorationRow[]) {
  const orderedRows = rankOrderRows(rows);
  return new Map(
    orderedRows.map((row, index) => [
      row.pkBiopsyId,
      {
        previous: orderedRows[index - 1]?.pkBiopsyId ?? null,
        next: orderedRows[index + 1]?.pkBiopsyId ?? null,
      },
    ]),
  );
}

function rankOrderRows(rows: BiopsyExplorationRow[]) {
  return [...rows].sort(
    (a, b) =>
      compareValues(a.exploratoryRank, b.exploratoryRank) ||
      compareValues(a.currentRank, b.currentRank) ||
      compareValues(a.pkBiopsyId, b.pkBiopsyId),
  );
}

function buildBirthYearEstimateRows({
  rows,
  biopsies,
  sightings,
  growthRate,
  birthSize,
  maleTerminalSize,
  femaleTerminalSize,
  preterminalWeight,
  terminalWeight,
}: {
  rows: BiopsyExplorationRow[];
  biopsies: ResearchBiopsyRow[];
  sightings: ResearchSightingRow[];
  growthRate: number;
  birthSize: number;
  maleTerminalSize: number;
  femaleTerminalSize: number;
  preterminalWeight: number;
  terminalWeight: number;
}): BirthYearEstimateRow[] {
  const sightingById = new Map(sightings.map((row) => [toNumberLocal(row.pk_sighting_id), row]));
  const biopsyById = new Map(biopsies.map((row) => [String(row.pk_biopsy_id), row]));
  return rows.map((row) => {
    const sex = normalizeSex(row.gender);
    const sizeM = row.sizeAtBiopsyM ?? row.nearestSizeBeforeBiopsyM ?? row.nearestSizeAfterBiopsyM;
    const sizeSource = row.sizeAtBiopsyM != null
      ? "biopsy date"
      : row.nearestSizeBeforeBiopsyM != null
        ? `nearest before (${row.daysBeforeBiopsySize ?? "?"} d)`
        : row.nearestSizeAfterBiopsyM != null
          ? `nearest after (${row.daysAfterBiopsySize ?? "?"} d)`
          : "none";
    const biopsy = biopsyById.get(row.pkBiopsyId);
    const sighting = toNumberLocal(biopsy?.fk_sighting_id) == null ? undefined : sightingById.get(toNumberLocal(biopsy?.fk_sighting_id));
    const biopsyDate = dateOnlyLocal(biopsy?.sample_date ?? sighting?.sighting_date ?? null);
    const terminalSizeM = sex === "male" ? maleTerminalSize : sex === "female" ? femaleTerminalSize : null;
    const growthRateMPerYear = sex ? growthRate : null;
    const status = !sex || !sizeM || !terminalSizeM ? "unknown" : sizeM >= terminalSizeM ? "terminal" : "preterminal";
    const sizeForAge = status === "terminal" ? terminalSizeM : sizeM;
    const minimumAgeYears = sizeForAge != null && growthRateMPerYear != null
      ? Math.max(0, (Math.max(sizeForAge, birthSize) - birthSize) / growthRateMPerYear)
      : null;
    const latestPossibleBirthYear = minimumAgeYears != null && biopsyDate
      ? Math.floor(yearDecimal(biopsyDate) - minimumAgeYears)
      : null;
    const weight = status === "terminal" ? terminalWeight : status === "preterminal" ? preterminalWeight : 0;
    return {
      row,
      biopsyDate,
      sizeM: sizeM ?? null,
      sizeSource,
      terminalSizeM,
      growthRateMPerYear,
      status,
      minimumAgeYears,
      latestPossibleBirthYear,
      weight,
      scaledAgeCue: minimumAgeYears == null ? null : minimumAgeYears * (weight / 100),
    };
  }).filter((estimate) => estimate.sizeM != null && estimate.growthRateMPerYear != null && estimate.biopsyDate);
}

function normalizeSex(value: unknown): "male" | "female" | null {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "m" || text === "male") return "male";
  if (text === "f" || text === "female") return "female";
  return null;
}

function dateOnlyLocal(value: unknown) {
  if (!value) return null;
  const text = String(value);
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function yearDecimal(date: string) {
  const parsed = new Date(date);
  const year = parsed.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return year + (parsed.getTime() - start) / (end - start);
}

function toNumberLocal(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function metricTitle(metric: MetricKey, biopsiedOnly: boolean) {
  if (metric === "biopsies") return biopsiedOnly ? "Biopsy records" : "Catalog mantas";
  if (metric === "size") return "Records with size evidence";
  if (metric === "changedCurrent") return "Ranks changed vs current";
  if (metric === "changedModel1Baseline") return "Relative order changed from Model 1 baseline";
  return "Flagged records";
}

function ModelModule({
  title,
  description,
  checked,
  onCheckedChange,
  weight,
  onWeightChange,
  children,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  weight: number;
  onWeightChange: (value: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className={checked ? "rounded-md border border-blue-200 bg-blue-50 p-3" : "rounded-md border bg-white p-3"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-xs text-slate-600">{description}</div>
        </div>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Label className="w-14 text-xs text-slate-600">Weight</Label>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={weight}
          onChange={(event) => onWeightChange(event.target.value)}
          className="min-w-0 flex-1 accent-blue-600"
        />
        <span className="w-8 text-right text-xs tabular-nums text-slate-700">{weight}</span>
      </div>
      {children ? <div className="mt-3 border-t border-blue-100 pt-3">{children}</div> : null}
    </div>
  );
}

function RankDecisionRulePanel() {
  return (
    <div className="rounded-md border bg-white p-3">
      <div className="flex items-center gap-1 text-sm font-semibold text-slate-900">
        <span>Ranking decision rule</span>
        <HelpTip text={`This is a checkpoint decision tree, not a weighted average. Each evidence source can set a lower or upper age bound as of ${AGE_RANK_AS_OF_DATE}; the final rank is based on the strongest defensible minimum age.`} />
      </div>
      <div className="mt-2 rounded bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800">
        final_min_age = max(valid checkpoint minimum ages)
      </div>
      <div className="mt-2 rounded bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800">
        final_max_age = min(valid checkpoint maximum ages)
      </div>
      <div className="mt-2 rounded bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800">
        rank = order records by final_min_age, oldest to youngest
      </div>
      <div className="mt-2 text-xs text-slate-600">
        When a maximum-age bound is lower than a stronger minimum-age bound, the maximum is rejected and shown in the evidence table as superseded. Ties keep the same exploratory rank, then fall back to current rank and biopsy ID for stable ordering.
      </div>
    </div>
  );
}

function AgeDecisionTreePanel({ parameters }: { parameters: BiopsyAgeParameters }) {
  const maleMaturity = parameters.maleMaturityAgeYears;
  const femaleMaturity = parameters.femaleMaturityAgeYears;
  const rows = [
    {
      checkpoint: "Model 1. First sighting date",
      enabled: parameters.includeLifeHistoryEvidence,
      help: `Uses the earliest known sighting date as a hard lower bound. If the manta was seen on that date, then on ${AGE_RANK_AS_OF_DATE} it cannot be younger than the years elapsed since that sighting. This does not tell us how old it was when first seen, so it does not create a maximum age.`,
      question: "Was the manta confirmed alive on a known first-sighting date?",
      minimum: `Not younger than years from first sighting to ${AGE_RANK_AS_OF_DATE}.`,
      maximum: "No maximum by itself.",
      reliability: "Direct observation: the animal was alive on or before this date.",
    },
    {
      checkpoint: "Model 2. Pup at first sighting",
      enabled: parameters.includePupEvidence && parameters.treatPupAsBirthAnchor,
      help: `Uses a first-sighting pup/neonate label as an approximate birth anchor. The current workbench treats a pup as roughly 0-1 year old at first sighting, so it creates both a minimum age and a maximum age as of ${AGE_RANK_AS_OF_DATE}.`,
      question: "Was the first sighting marked as pup/neonate?",
      minimum: `Not younger than years from pup sighting to ${AGE_RANK_AS_OF_DATE}.`,
      maximum: "Not older than that value plus 1 year, using the current pup-age assumption.",
      reliability: "Provenance-sensitive interpretation: useful as an approximate birth anchor when the pup/neonate label is accepted.",
    },
    {
      checkpoint: "Model 3. HAMER size measurement",
      enabled: parameters.includeSizeEvidence,
      help: `Uses dated HAMER disc-width measurements with selected maturity sizes and maturity ages. Below-maturity measurements can cap the age range; mature-sized animals can receive a maturity-age floor.`,
      question: "Was a dated HAMER size measurement available?",
      minimum: "Mature-sized animals are at least selected maturity age by measurement date; below-maturity animals remain anchored by the measurement date.",
      maximum: `If below maturity size, selected maturity age plus elapsed calendar years to ${AGE_RANK_AS_OF_DATE} can cap the range. Mature or terminal-sized animals have no maximum from size.`,
      reliability: `Assumption-assisted size interpretation. Uses male/female maturity sizes ${parameters.maleMaturitySizeM}/${parameters.femaleMaturitySizeM} m and maturity ages ${maleMaturity}/${femaleMaturity} yrs.`,
    },
    {
      checkpoint: "Model 4. HAMER age class",
      enabled: parameters.includeAgeClassEvidence,
      help: `Uses dated HAMER juvenile/adult labels with the selected sex-specific maturity ages. Adult means the animal had already reached maturity by that date; juvenile labels can cap how many years could be added before that observation date.`,
      question: "Was the manta observed as juvenile, pup, or adult on a dated sighting?",
      minimum: "Adult: maturity age plus years since sighting. Juvenile/pup: at least years since sighting.",
      maximum: "Juvenile: maturity age plus years since sighting. Pup: years since sighting plus 1 year.",
      reliability: `HAMER dated observation model. Uses selected maturity ages: male ${maleMaturity} yrs and female ${femaleMaturity} yrs.`,
    },
    {
      checkpoint: "Model 5. MPRF age class",
      enabled: parameters.includeMprfAgeClassEvidence,
      help: "Uses MPRF age-class labels tied to a date with the selected sex-specific maturity ages. Catalog last-age-class values are not used as age-model evidence.",
      question: "Was an MPRF age-class label tied to a first-sighting or dated record?",
      minimum: "Adult: maturity age plus years since the dated MPRF class. Juvenile/pup: at least years since the dated class.",
      maximum: "Juvenile: maturity age plus years since the dated MPRF class. Pup: years since sighting plus 1 year.",
      reliability: `Sensitivity model using selected maturity ages: male ${maleMaturity} yrs and female ${femaleMaturity} yrs. Conflicts with HAMER size or age-class evidence should be reviewed.`,
    },
  ];

  return (
    <div className="rounded-md border bg-white p-3">
      <div className="flex items-center gap-1 text-sm font-semibold text-slate-900">
        <span>Age interval decision tree</span>
        <HelpTip text="This table shows how each selected checkpoint contributes to the minimum and maximum plausible age interval. The final minimum is the strongest lower bound; the final maximum is the tightest upper bound where one exists." />
      </div>
      <div className="mt-2 overflow-x-auto rounded-md border">
        <table className="w-full min-w-[980px] text-xs">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="px-3 py-2">Checkpoint</th>
              <th className="px-3 py-2">On</th>
              <th className="px-3 py-2">Decision question</th>
              <th className="px-3 py-2">Minimum age effect</th>
              <th className="px-3 py-2">Maximum age effect</th>
              <th className="px-3 py-2">Interpretation note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.checkpoint} className="border-t align-top">
                <td className="px-3 py-2 font-medium text-slate-900">
                  <div className="flex items-center gap-1">
                    <span>{row.checkpoint}</span>
                    <HelpTip text={row.help} />
                  </div>
                </td>
                <td className="px-3 py-2">{row.enabled ? "Yes" : "No"}</td>
                <td className="px-3 py-2">{row.question}</td>
                <td className="px-3 py-2">{row.minimum}</td>
                <td className="px-3 py-2">{row.maximum}</td>
                <td className="px-3 py-2">{row.reliability}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AgeEvidenceRecordsModal({
  open,
  onOpenChange,
  title,
  rows,
  model1BaselineRows,
  parameters,
  biopsiedOnly,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  rows: BiopsyExplorationRow[];
  model1BaselineRows: BiopsyExplorationRow[];
  parameters: BiopsyAgeParameters;
  biopsiedOnly: boolean;
}) {
  const model1BaselineRankByBiopsy = useMemo(
    () => new Map(model1BaselineRows.map((row) => [row.pkBiopsyId, row.exploratoryRank])),
    [model1BaselineRows],
  );
  const activeNeighborByBiopsy = useMemo(() => buildRankNeighborMap(rows), [rows]);
  const model1BaselineNeighborByBiopsy = useMemo(() => buildRankNeighborMap(model1BaselineRows), [model1BaselineRows]);
  const rowLabelByBiopsy = useMemo(() => {
    const labels = new Map<string, string>();
    [...model1BaselineRows, ...rows].forEach((row) => {
      labels.set(row.pkBiopsyId, row.name ? `${row.name} (${displayMprfBiopsyId(row) ?? row.pkBiopsyId})` : String(displayMprfBiopsyId(row) ?? row.pkBiopsyId));
    });
    return labels;
  }, [model1BaselineRows, rows]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"rank" | "name" | "minAge" | "maxAge" | "interval">("rank");
  const sortedRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = rows.filter((row) =>
      !needle ||
      [row.pkBiopsyId, row.mprfBiopsyId, row.mprfLegacyBiopsyId, row.jonathanSequenceId, row.name, row.catalogId, row.mprfCatalogId, row.mantaId]
        .some((value) => String(value ?? "").toLowerCase().includes(needle)),
    );
    return filtered.sort((a, b) => {
      if (sortKey === "name") return compareValues(a.name, b.name);
      if (sortKey === "minAge") return compareValues(b.minimumAgeAsOfYears, a.minimumAgeAsOfYears);
      if (sortKey === "maxAge") return compareValues(b.maximumAgeAsOfYears, a.maximumAgeAsOfYears);
      if (sortKey === "interval") return compareValues(a.ageIntervalWidthYears, b.ageIntervalWidthYears);
      return compareValues(a.exploratoryRank, b.exploratoryRank);
    });
  }, [rows, search, sortKey]);
  const modelUsage = modelUsageMap(parameters);

  function exportRecordsCsv() {
    const headers = [
      "Rank",
      "Model 1 baseline rank",
      "Model 1 delta",
      "Current rank",
      "Current delta",
      "Model 1 neighbors",
      "Active neighbors",
      "Name",
      "Gender",
      "Island",
      "Sample_ID",
      "HAMER Catalog ID",
      "pk_manta_id",
      "Biopsy ID",
      "MPRF biopsy id",
      "MPRF Catalog ID",
      "Age class when biopsied",
      `Minimum age as of ${AGE_RANK_AS_OF_DATE}`,
      `Maximum age as of ${AGE_RANK_AS_OF_DATE}`,
      "Age interval",
      usedColumnLabel("First sighting date", modelUsage.firstSighting),
      usedColumnLabel("First sighting checkpoint", modelUsage.firstSighting),
      usedColumnLabel("Pup first sighting", modelUsage.pupFirstSighting),
      usedColumnLabel("Pup checkpoint", modelUsage.pupFirstSighting),
      usedColumnLabel("HAMER size measurements", modelUsage.hamerSize),
      usedColumnLabel("HAMER size checkpoint", modelUsage.hamerSize),
      usedColumnLabel("HAMER age-class determinations", modelUsage.hamerAgeClass),
      usedColumnLabel("HAMER age-class checkpoint", modelUsage.hamerAgeClass),
      usedColumnLabel("MPRF age-class determinations", modelUsage.mprfAgeClass),
      usedColumnLabel("MPRF age-class checkpoint", modelUsage.mprfAgeClass),
      usedColumnLabel("Male maturity age", modelUsage.anyMaturityAgeAssumption),
      usedColumnLabel("Female maturity age", modelUsage.anyMaturityAgeAssumption),
      usedColumnLabel("Male maturity size", modelUsage.hamerSize),
      usedColumnLabel("Female maturity size", modelUsage.hamerSize),
      usedColumnLabel("Male terminal size", modelUsage.hamerSize),
      usedColumnLabel("Female terminal size", modelUsage.hamerSize),
      usedColumnLabel("Birth size", modelUsage.sizeGrowthAssumption),
      usedColumnLabel("Growth rate", modelUsage.sizeGrowthAssumption),
      "Flags",
    ];
    const csvRows = sortedRows.map((row) => {
      const model1BaselineRank = model1BaselineRankByBiopsy.get(row.pkBiopsyId);
      const model1Delta = model1BaselineRank != null && row.exploratoryRank != null ? row.exploratoryRank - model1BaselineRank : null;
      return [
        row.exploratoryRank,
        model1BaselineRank,
        model1Delta,
        row.currentRank,
        row.rankDelta,
        formatNeighborCell(model1BaselineNeighborByBiopsy.get(row.pkBiopsyId), rowLabelByBiopsy),
        formatNeighborCell(activeNeighborByBiopsy.get(row.pkBiopsyId), rowLabelByBiopsy),
        row.name,
        row.gender,
        row.island,
        row.jonathanSequenceId,
        row.catalogId,
        row.mantaId,
        row.pkBiopsyId,
        displayMprfBiopsyId(row),
        formatMprfCatalogId(row.mprfCatalogId),
        row.ageClassWhenBiopsied,
        formatAgeYears(row.minimumAgeAsOfYears),
        formatAgeYears(row.maximumAgeAsOfYears),
        row.ageIntervalSummary,
        row.firstSightingDate,
        formatCheckpointCell(row, "life_history"),
        row.firstSightingAsPup && row.firstSightingDate ? `Yes; ${row.firstSightingDate}` : "No",
        formatCheckpointCell(row, "pup_first_sighting"),
        formatSizeObservationsCell(row, "hamer"),
        formatCheckpointCell(row, "size"),
        formatAgeClassObservationsCell(row, "hamer"),
        formatAgeClassCheckpointCell(row, "hamer"),
        formatAgeClassObservationsCell(row, "mprf"),
        formatAgeClassCheckpointCell(row, "mprf"),
        `${parameters.maleMaturityAgeYears} yrs`,
        `${parameters.femaleMaturityAgeYears} yrs`,
        `${parameters.maleMaturitySizeM} m`,
        `${parameters.femaleMaturitySizeM} m`,
        `${parameters.maleTerminalSizeM} m`,
        `${parameters.femaleTerminalSizeM} m`,
        `${parameters.birthSizeM} m`,
        `${parameters.juvenileGrowthRateMPerYear} m/yr`,
        row.flags.join(" | "),
      ].map((value) => formatCsv(value));
    });
    downloadCsv(`${slugifyFilename(title)}.csv`, title, biopsiedOnly, parameters, sortedRows.length, headers, csvRows);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                Age as of {AGE_RANK_AS_OF_DATE}. {sortedRows.length} of {rows.length} records shown. Checkpoints show how each evidence source contributed to the age interval.
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={exportRecordsCsv} disabled={sortedRows.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <div>
            <Label htmlFor="records-search">Search</Label>
            <Input id="records-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, biopsy, sequence, catalog, manta" />
          </div>
          <div>
            <Label htmlFor="records-sort">Sort</Label>
            <select
              id="records-sort"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as typeof sortKey)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="rank">Rank</option>
              <option value="name">Name</option>
              <option value="minAge">Minimum age</option>
              <option value="maxAge">Maximum age</option>
              <option value="interval">Interval width</option>
            </select>
          </div>
        </div>

        <div className="overflow-auto rounded-md border">
          <table className="w-full min-w-[3900px] text-sm">
            <thead className="sticky top-0 bg-slate-100 text-left">
              <tr>
                <th className="px-3 py-2">Rank</th>
                <th className="px-3 py-2">Model 1 baseline rank</th>
                <th className="px-3 py-2">Model 1 delta</th>
                <th className="px-3 py-2">Current rank</th>
                <th className="px-3 py-2">Current delta</th>
                <th className="px-3 py-2">Model 1 neighbors</th>
                <th className="px-3 py-2">Active neighbors</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Gender</th>
                <th className="px-3 py-2">Island</th>
                <th className="px-3 py-2">Sample_ID</th>
                <th className="px-3 py-2">HAMER Catalog ID</th>
                <th className="px-3 py-2">pk_manta_id</th>
                <th className="px-3 py-2">Biopsy ID</th>
                <th className="px-3 py-2">MPRF biopsy id</th>
                <th className="px-3 py-2">MPRF Catalog ID</th>
                <th className="px-3 py-2">Age class when biopsied</th>
                <th className="px-3 py-2">Min age</th>
                <th className="px-3 py-2">Max age</th>
                <th className="px-3 py-2">Range</th>
                <th className={modelHeaderClass(modelUsage.firstSighting)}>{usedColumnLabel("First sighting", modelUsage.firstSighting)}</th>
                <th className={modelHeaderClass(modelUsage.pupFirstSighting)}>{usedColumnLabel("Pup first sighting", modelUsage.pupFirstSighting)}</th>
                <th className={modelHeaderClass(modelUsage.hamerSize)}>{usedColumnLabel("HAMER size measurements", modelUsage.hamerSize)}</th>
                <th className={modelHeaderClass(modelUsage.hamerSize)}>{usedColumnLabel("HAMER size checkpoint", modelUsage.hamerSize)}</th>
                <th className={modelHeaderClass(modelUsage.hamerAgeClass)}>{usedColumnLabel("HAMER age class", modelUsage.hamerAgeClass)}</th>
                <th className={modelHeaderClass(modelUsage.hamerAgeClass)}>{usedColumnLabel("HAMER age-class checkpoint", modelUsage.hamerAgeClass)}</th>
                <th className={modelHeaderClass(modelUsage.mprfAgeClass)}>{usedColumnLabel("MPRF age class", modelUsage.mprfAgeClass)}</th>
                <th className={modelHeaderClass(modelUsage.mprfAgeClass)}>{usedColumnLabel("MPRF age-class checkpoint", modelUsage.mprfAgeClass)}</th>
                <th className={modelHeaderClass(modelUsage.anyMaturityAgeAssumption)}>{usedColumnLabel("Male maturity age", modelUsage.anyMaturityAgeAssumption)}</th>
                <th className={modelHeaderClass(modelUsage.anyMaturityAgeAssumption)}>{usedColumnLabel("Female maturity age", modelUsage.anyMaturityAgeAssumption)}</th>
                <th className={modelHeaderClass(modelUsage.hamerSize)}>{usedColumnLabel("Male maturity size", modelUsage.hamerSize)}</th>
                <th className={modelHeaderClass(modelUsage.hamerSize)}>{usedColumnLabel("Female maturity size", modelUsage.hamerSize)}</th>
                <th className={modelHeaderClass(modelUsage.sizeGrowthAssumption)}>{usedColumnLabel("Birth size", modelUsage.sizeGrowthAssumption)}</th>
                <th className={modelHeaderClass(modelUsage.sizeGrowthAssumption)}>{usedColumnLabel("Growth rate", modelUsage.sizeGrowthAssumption)}</th>
                <th className="px-3 py-2">Flags</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={37} className="px-3 py-8 text-center text-muted-foreground">
                    No records match this search.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => {
                  const model1BaselineRank = model1BaselineRankByBiopsy.get(row.pkBiopsyId);
                  const model1Delta = model1BaselineRank != null && row.exploratoryRank != null ? row.exploratoryRank - model1BaselineRank : null;
                  return (
                    <tr key={row.pkBiopsyId} className="border-t align-top">
                      <td className="px-3 py-2 tabular-nums">{formatCell(row.exploratoryRank)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatCell(model1BaselineRank)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatCell(model1Delta)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatCell(row.currentRank)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatCell(row.rankDelta)}</td>
                      <td className="px-3 py-2 min-w-[220px] text-xs text-slate-700">{formatNeighborCell(model1BaselineNeighborByBiopsy.get(row.pkBiopsyId), rowLabelByBiopsy)}</td>
                      <td className="px-3 py-2 min-w-[220px] text-xs text-slate-700">{formatNeighborCell(activeNeighborByBiopsy.get(row.pkBiopsyId), rowLabelByBiopsy)}</td>
                      <td className="px-3 py-2">{row.name ?? "—"}</td>
                      <td className="px-3 py-2">{row.gender ?? "—"}</td>
                      <td className="px-3 py-2">{row.island ?? "—"}</td>
                      <td className="px-3 py-2">{row.jonathanSequenceId ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{formatCell(row.catalogId)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatCell(row.mantaId)}</td>
                      <td className="px-3 py-2">{row.pkBiopsyId}</td>
                      <td className="px-3 py-2">{displayMprfBiopsyId(row) ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{formatMprfCatalogId(row.mprfCatalogId) ?? "—"}</td>
                      <td className="px-3 py-2">{row.ageClassWhenBiopsied ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{formatAgeYears(row.minimumAgeAsOfYears)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatAgeYears(row.maximumAgeAsOfYears)}</td>
                      <td className="px-3 py-2">{row.ageIntervalSummary ?? "—"}</td>
                      <td className="px-3 py-2 min-w-[260px] whitespace-pre-line text-xs text-slate-700">{formatCheckpointCell(row, "life_history")}</td>
                      <td className="px-3 py-2 min-w-[260px] whitespace-pre-line text-xs text-slate-700">{formatCheckpointCell(row, "pup_first_sighting")}</td>
                      <td className="px-3 py-2 min-w-[260px] whitespace-pre-line text-xs text-slate-700">{formatSizeObservationsCell(row, "hamer")}</td>
                      <td className="px-3 py-2 min-w-[260px] whitespace-pre-line text-xs text-slate-700">{formatCheckpointCell(row, "size")}</td>
                      <td className="px-3 py-2 min-w-[260px] whitespace-pre-line text-xs text-slate-700">{formatAgeClassObservationsCell(row, "hamer")}</td>
                      <td className="px-3 py-2 min-w-[260px] whitespace-pre-line text-xs text-slate-700">{formatAgeClassCheckpointCell(row, "hamer")}</td>
                      <td className="px-3 py-2 min-w-[260px] whitespace-pre-line text-xs text-slate-700">{formatAgeClassObservationsCell(row, "mprf")}</td>
                      <td className="px-3 py-2 min-w-[260px] whitespace-pre-line text-xs text-slate-700">{formatAgeClassCheckpointCell(row, "mprf")}</td>
                      <td className="px-3 py-2 tabular-nums">{parameters.maleMaturityAgeYears} yrs</td>
                      <td className="px-3 py-2 tabular-nums">{parameters.femaleMaturityAgeYears} yrs</td>
                      <td className="px-3 py-2 tabular-nums">{parameters.maleMaturitySizeM} m</td>
                      <td className="px-3 py-2 tabular-nums">{parameters.femaleMaturitySizeM} m</td>
                      <td className="px-3 py-2 tabular-nums">{parameters.birthSizeM} m</td>
                      <td className="px-3 py-2 tabular-nums">{parameters.juvenileGrowthRateMPerYear} m/yr</td>
                      <td className="px-3 py-2 min-w-[220px] text-xs text-slate-700">{row.flags.join(" | ") || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetricRowsModal({
  open,
  onOpenChange,
  title,
  rows,
  model1BaselineRows,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  rows: BiopsyExplorationRow[];
  model1BaselineRows: BiopsyExplorationRow[];
}) {
  const model1BaselineRankByBiopsy = useMemo(
    () => new Map(model1BaselineRows.map((row) => [row.pkBiopsyId, row.exploratoryRank])),
    [model1BaselineRows],
  );
  const activeNeighborByBiopsy = useMemo(() => buildRankNeighborMap(rows), [rows]);
  const model1BaselineNeighborByBiopsy = useMemo(() => buildRankNeighborMap(model1BaselineRows), [model1BaselineRows]);
  const rowLabelByBiopsy = useMemo(() => {
    const labels = new Map<string, string>();
    [...model1BaselineRows, ...rows].forEach((row) => {
      labels.set(row.pkBiopsyId, row.name ? `${row.name} (${row.mprfBiopsyId ?? row.pkBiopsyId})` : String(row.mprfBiopsyId ?? row.pkBiopsyId));
    });
    return labels;
  }, [model1BaselineRows, rows]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"rank" | "name" | "minAge" | "current" | "delta">("rank");
  const sortedRows = useMemo(
    () => {
      const needle = search.trim().toLowerCase();
      const filtered = rows.filter((row) =>
        !needle ||
        [row.pkBiopsyId, row.mprfBiopsyId, row.jonathanSequenceId, row.name, row.catalogId, row.mantaId]
          .some((value) => String(value ?? "").toLowerCase().includes(needle)),
      );
      return filtered.sort((a, b) => {
        if (sortKey === "name") return compareValues(a.name, b.name);
        if (sortKey === "minAge") return compareValues(b.minimumAgeAsOfYears, a.minimumAgeAsOfYears);
        if (sortKey === "current") return compareValues(a.currentRank, b.currentRank);
        if (sortKey === "delta") return compareValues(b.rankDelta, a.rankDelta);
        return compareValues(a.exploratoryRank, b.exploratoryRank);
      });
    },
    [rows, search, sortKey],
  );

  function exportModalCsv() {
    const headers = [
      "Rank",
      "Model 1 baseline rank",
      "Model 1 delta",
      "Current rank",
      "Current delta",
      "Model 1 neighbors",
      "Active neighbors",
      "Biopsy",
      "Name",
      "Island",
      "Gender",
      "Age class",
      "First sighting used",
      "Years before biopsy",
      "Size evidence",
      "Evidence",
      "Flags",
    ];
    const csvRows = sortedRows.map((row) => {
      const model1BaselineRank = model1BaselineRankByBiopsy.get(row.pkBiopsyId);
      const model1Delta = model1BaselineRank != null && row.exploratoryRank != null ? row.exploratoryRank - model1BaselineRank : null;
      return [
        row.exploratoryRank,
        model1BaselineRank,
        model1Delta,
        row.currentRank,
        row.rankDelta,
        formatNeighborCell(model1BaselineNeighborByBiopsy.get(row.pkBiopsyId), rowLabelByBiopsy),
        formatNeighborCell(activeNeighborByBiopsy.get(row.pkBiopsyId), rowLabelByBiopsy),
        row.mprfBiopsyId ?? row.pkBiopsyId,
        row.name,
        row.island,
        row.gender,
        row.ageClassWhenBiopsied,
        row.firstSightingDate,
        formatYearsObservedCell(row, "prior"),
        formatSizeEvidence(row),
        row.evidence.join(" | "),
        row.flags.join(" | "),
      ].map((value) => formatCsv(value));
    });
    const csv = [headers.map((value) => formatCsv(value)), ...csvRows].map((line) => line.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugifyFilename(title)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <DialogTitle>{title}</DialogTitle>
            <Button variant="outline" size="sm" onClick={exportModalCsv} disabled={sortedRows.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
          <DialogDescription>
            {sortedRows.length} of {rows.length} record{rows.length === 1 ? "" : "s"} represented in this count.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <div>
            <Label htmlFor="ranking-search">Search</Label>
            <Input id="ranking-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, biopsy, sequence, catalog, manta" />
          </div>
          <div>
            <Label htmlFor="ranking-sort">Sort</Label>
            <select
              id="ranking-sort"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as typeof sortKey)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="rank">Exploratory rank</option>
              <option value="name">Name</option>
              <option value="minAge">Minimum age</option>
              <option value="current">Current rank</option>
              <option value="delta">Rank delta</option>
            </select>
          </div>
        </div>
        <div className="overflow-auto rounded-md border">
          <table className="w-full min-w-[1800px] text-sm">
            <thead className="sticky top-0 bg-slate-100 text-left">
              <tr>
                <th className="px-3 py-2">Rank</th>
                <th className="px-3 py-2">Model 1 baseline rank</th>
                <th className="px-3 py-2">Model 1 delta</th>
                <th className="px-3 py-2">Current rank</th>
                <th className="px-3 py-2">Current delta</th>
                <th className="px-3 py-2">Model 1 neighbors</th>
                <th className="px-3 py-2">Active neighbors</th>
                <th className="px-3 py-2">Biopsy</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Island</th>
                <th className="px-3 py-2">Gender</th>
                <th className="px-3 py-2">Age class</th>
                <th className="px-3 py-2">First sighting used</th>
                <th className="px-3 py-2">Years before biopsy</th>
                <th className="px-3 py-2">Size evidence</th>
                <th className="px-3 py-2">Evidence</th>
                <th className="px-3 py-2">Flags</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-3 py-8 text-center text-muted-foreground">
                    No records in this set.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => {
                  const model1BaselineRank = model1BaselineRankByBiopsy.get(row.pkBiopsyId);
                  const model1Delta = model1BaselineRank != null && row.exploratoryRank != null ? row.exploratoryRank - model1BaselineRank : null;
                  return (
                    <tr key={row.pkBiopsyId} className="border-t align-top">
                      <td className="px-3 py-2 tabular-nums">{formatCell(row.exploratoryRank)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatCell(model1BaselineRank)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatCell(model1Delta)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatCell(row.currentRank)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatCell(row.rankDelta)}</td>
                      <td className="px-3 py-2 min-w-[220px] text-xs text-slate-700">{formatNeighborCell(model1BaselineNeighborByBiopsy.get(row.pkBiopsyId), rowLabelByBiopsy)}</td>
                      <td className="px-3 py-2 min-w-[220px] text-xs text-slate-700">{formatNeighborCell(activeNeighborByBiopsy.get(row.pkBiopsyId), rowLabelByBiopsy)}</td>
                      <td className="px-3 py-2">{row.mprfBiopsyId ?? row.pkBiopsyId}</td>
                      <td className="px-3 py-2">{row.name ?? "—"}</td>
                      <td className="px-3 py-2">{row.island ?? "—"}</td>
                      <td className="px-3 py-2">{row.gender ?? "—"}</td>
                      <td className="px-3 py-2">{row.ageClassWhenBiopsied ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{row.firstSightingDate ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{formatYearsObservedCell(row, "prior")}</td>
                      <td className="px-3 py-2">{formatSizeEvidence(row)}</td>
                      <td className="px-3 py-2 min-w-[300px] text-xs text-slate-700">{row.evidence.join(" | ") || "—"}</td>
                      <td className="px-3 py-2">{row.flags.join(" | ") || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PairwiseGenerationMatrixModal({
  open,
  onOpenChange,
  title,
  rows,
  parameters,
  biopsiedOnly,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  rows: BiopsyExplorationRow[];
  parameters: BiopsyAgeParameters;
  biopsiedOnly: boolean;
}) {
  const [search, setSearch] = useState("");
  const [relationshipMode, setRelationshipMode] = useState<PairwiseRelationshipMode | null>(null);
  const sortedRows = useMemo(() => rankOrderRows(rows), [rows]);
  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sortedRows;
    return sortedRows.filter((row) =>
      [row.pkBiopsyId, row.mprfBiopsyId, row.mprfLegacyBiopsyId, row.jonathanSequenceId, row.name, row.catalogId, row.mprfCatalogId, row.mantaId]
        .some((value) => String(value ?? "").toLowerCase().includes(needle)),
    );
  }, [search, sortedRows]);
  const counts = useMemo(() => {
    return buildPairwiseGenerationCounts(visibleRows, parameters, true);
  }, [parameters, visibleRows]);
  const rowCounts = useMemo(
    () => new Map(visibleRows.map((row) => [row.pkBiopsyId, buildPairwiseRowCounts(row, visibleRows, parameters)])),
    [parameters, visibleRows],
  );
  const mantaCounts = useMemo(
    () => buildPairwiseGenerationAnimalCounts(visibleRows, parameters),
    [parameters, visibleRows],
  );
  const relationships = useMemo(
    () => buildPairwiseRelationshipRows(visibleRows, parameters, relationshipMode),
    [parameters, relationshipMode, visibleRows],
  );

  function exportMatrixCsv() {
    const headers = [
      "Row animal",
      ...identifierCsvHeaders("Row"),
      "P",
      "C",
      "S",
      "U",
      ...visibleRows.map(pairwiseAnimalLabel),
    ];
    const csvRows = visibleRows.map((row) => [
      formatCsv(pairwiseAnimalLabel(row)),
      ...identifierCsvValues(row).map((value) => formatCsv(value)),
      formatCsv(rowCounts.get(row.pkBiopsyId)?.P ?? 0),
      formatCsv(rowCounts.get(row.pkBiopsyId)?.C ?? 0),
      formatCsv(rowCounts.get(row.pkBiopsyId)?.S ?? 0),
      formatCsv(rowCounts.get(row.pkBiopsyId)?.U ?? 0),
      ...visibleRows.map((column) => formatCsv(classifyPairwiseGeneration(row, column, parameters).code)),
    ]);
    downloadCsv(`${slugifyFilename(title)}.csv`, title, biopsiedOnly, parameters, visibleRows.length, headers, csvRows);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                Age as of {AGE_RANK_AS_OF_DATE}. Dated adult-versus-juvenile evidence is used first; final age intervals are used only when specific life-stage comparisons are unavailable.
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={exportMatrixCsv} disabled={visibleRows.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4 xl:grid-cols-7">
          <SummaryStat label="Scope" value={biopsiedOnly ? "Biopsied only" : "All mantas"} />
          <SummaryStat label="Age model" value={ageModelCsvLabel(parameters)} />
          <SummaryStat label="Mantas in matrix" value={visibleRows.length} />
          <SummaryStat label="Mantas with P" value={mantaCounts.P} />
          <SummaryStat label="Mantas with C" value={mantaCounts.C} />
          <SummaryStat label="Mantas with S" value={mantaCounts.S} />
          <SummaryStat label="Mantas with U" value={mantaCounts.U} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setRelationshipMode("pc")}>
            Show P-C Relationships
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRelationshipMode("cc")}>
            Show S Relationships
          </Button>
        </div>

        <PairwiseRelationshipModal
          open={relationshipMode != null}
          onOpenChange={(nextOpen) => !nextOpen && setRelationshipMode(null)}
          mode={relationshipMode ?? "pc"}
          relationships={relationships}
          titlePrefix={title}
          biopsiedOnly={biopsiedOnly}
          parameters={parameters}
        />

        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <Label htmlFor="pairwise-search">Search</Label>
            <Input
              id="pairwise-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, biopsy, sequence, catalog, manta"
            />
          </div>
          <div className="grid grid-cols-5 gap-2 text-xs">
            <div className="col-span-5 text-[11px] font-medium text-slate-500">Cell counts in visible matrix</div>
            <PairwiseLegendItem code="P" label="row could be parent" count={counts.P} />
            <PairwiseLegendItem code="C" label="row could be child" count={counts.C} />
            <PairwiseLegendItem code="S" label="same generation" count={counts.S} />
            <PairwiseLegendItem code="U" label="unknown" count={counts.U} />
            <PairwiseLegendItem code="—" label="same animal" count={counts["—"]} />
          </div>
        </div>

        <div className="max-h-[68vh] overflow-auto rounded-md border">
          <table className="border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th rowSpan={2} className="sticky left-0 top-0 z-40 min-w-[190px] border-b border-r bg-slate-100 px-2 py-2 text-left">
                  Row \ Column
                </th>
                <th colSpan={4} className="sticky left-[190px] top-0 z-40 min-w-[168px] border-b border-r bg-slate-100 px-2 py-1 text-center">
                  Totals
                </th>
                <th colSpan={visibleRows.length} className="sticky top-0 z-20 border-b border-r bg-slate-100 px-2 py-1 text-left text-slate-500">
                  Pairwise matrix
                </th>
              </tr>
              <tr>
                {(["P", "C", "S", "U"] as const).map((code, index) => (
                  <th
                    key={code}
                    className={`sticky top-[29px] z-30 min-w-[42px] border-b border-r bg-slate-100 px-2 py-2 text-center ${pairwiseCountStickyLeftClass(index)}`}
                  >
                    {code}
                  </th>
                ))}
                {visibleRows.map((column) => (
                  <th
                    key={column.pkBiopsyId}
                    className="sticky top-[29px] z-20 min-w-[105px] max-w-[105px] border-b border-r bg-slate-100 px-2 py-2 text-left align-bottom"
                    title={pairwiseAnimalLabel(column)}
                  >
                    <div className="line-clamp-3">{pairwiseShortLabel(column)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-muted-foreground">No records match this search.</td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.pkBiopsyId}>
                    <th
                      className="sticky left-0 z-10 min-w-[190px] max-w-[190px] border-b border-r bg-white px-2 py-2 text-left font-medium"
                      title={pairwiseAnimalLabel(row)}
                    >
                      <div className="line-clamp-3">{pairwiseShortLabel(row)}</div>
                    </th>
                    {(["P", "C", "S", "U"] as const).map((code, index) => (
                      <td
                        key={`${row.pkBiopsyId}-${code}`}
                        className={`sticky z-10 h-9 min-w-[42px] border-b border-r bg-white px-2 py-1 text-center font-semibold tabular-nums ${pairwiseCountStickyLeftClass(index)}`}
                      >
                        {rowCounts.get(row.pkBiopsyId)?.[code] ?? 0}
                      </td>
                    ))}
                    {visibleRows.map((column) => {
                      const cell = classifyPairwiseGeneration(row, column, parameters);
                      return (
                        <td
                          key={`${row.pkBiopsyId}-${column.pkBiopsyId}`}
                          className={`h-9 min-w-[105px] border-b border-r px-2 py-1 text-center font-semibold ${pairwiseCodeClass(cell.code)}`}
                          title={cell.detail}
                        >
                          {cell.code}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PairwiseLegendItem({ code, label, count }: { code: PairwiseGenerationCode; label: string; count: number }) {
  return (
    <div className={`rounded border px-2 py-1 ${pairwiseCodeClass(code)}`}>
      <div className="font-semibold">{code}</div>
      <div>{label}</div>
      <div className="tabular-nums">{count}</div>
    </div>
  );
}

function PairwiseRelationshipModal({
  open,
  onOpenChange,
  mode,
  relationships,
  titlePrefix,
  biopsiedOnly,
  parameters,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: PairwiseRelationshipMode;
  relationships: Array<{ primary: BiopsyExplorationRow; secondary: BiopsyExplorationRow; code: PairwiseGenerationCode; detail: string }>;
  titlePrefix: string;
  biopsiedOnly: boolean;
  parameters: BiopsyAgeParameters;
}) {
  const [search, setSearch] = useState("");
  const title = mode === "pc" ? "P-C relationship candidates" : "S relationship candidates";
  const description = mode === "pc"
    ? "Directional parent-child candidates where the first manta is the possible parent and the second is the possible child."
    : "Same-generation candidates where dated evidence does not support a maturity-age parent-child gap.";
  const filteredRelationships = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? relationships.filter((relationship) =>
          [relationship.primary, relationship.secondary].some((row) =>
            [row.pkBiopsyId, row.mprfBiopsyId, row.mprfLegacyBiopsyId, row.jonathanSequenceId, row.name, row.catalogId, row.mprfCatalogId, row.mantaId]
              .some((value) => String(value ?? "").toLowerCase().includes(needle)),
          ),
        )
      : relationships;
    return [...filtered].sort(
      (a, b) =>
        compareValues(a.primary.exploratoryRank, b.primary.exploratoryRank) ||
        compareValues(a.secondary.exploratoryRank, b.secondary.exploratoryRank) ||
        compareValues(a.primary.name, b.primary.name) ||
        compareValues(a.secondary.name, b.secondary.name) ||
        compareValues(a.primary.pkBiopsyId, b.primary.pkBiopsyId) ||
        compareValues(a.secondary.pkBiopsyId, b.secondary.pkBiopsyId),
    );
  }, [relationships, search]);

  function exportRelationshipsCsv() {
    const headers = [
      mode === "pc" ? "Possible parent" : "Manta 1",
      ...identifierCsvHeaders(mode === "pc" ? "Parent" : "Manta 1"),
      mode === "pc" ? "Parent rank" : "Manta 1 rank",
      mode === "pc" ? "Parent minimum age" : "Manta 1 minimum age",
      mode === "pc" ? "Possible child" : "Manta 2",
      ...identifierCsvHeaders(mode === "pc" ? "Child" : "Manta 2"),
      mode === "pc" ? "Child rank" : "Manta 2 rank",
      mode === "pc" ? "Child minimum age" : "Manta 2 minimum age",
      "Code",
      "Basis",
    ];
    const csvRows = filteredRelationships.map((relationship) =>
      [
        pairwiseAnimalLabel(relationship.primary),
        ...identifierCsvValues(relationship.primary),
        relationship.primary.exploratoryRank,
        formatAgeYears(relationship.primary.minimumAgeAsOfYears),
        pairwiseAnimalLabel(relationship.secondary),
        ...identifierCsvValues(relationship.secondary),
        relationship.secondary.exploratoryRank,
        formatAgeYears(relationship.secondary.minimumAgeAsOfYears),
        relationship.code,
        relationship.detail,
      ].map((value) => formatCsv(value)),
    );
    downloadCsv(
      `${slugifyFilename(`${titlePrefix} ${title}`)}.csv`,
      `${titlePrefix}: ${title}`,
      biopsiedOnly,
      parameters,
      filteredRelationships.length,
      headers,
      csvRows,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                {filteredRelationships.length} of {relationships.length} relationship{relationships.length === 1 ? "" : "s"} shown. {description}
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={exportRelationshipsCsv} disabled={filteredRelationships.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </DialogHeader>
        <div>
          <Label htmlFor={`pairwise-${mode}-search`}>Search</Label>
          <Input
            id={`pairwise-${mode}-search`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search parent, child, name, biopsy, sequence, catalog, manta"
          />
        </div>
        <div className="max-h-[62vh] overflow-auto rounded-md border">
          <table className="w-full min-w-[2100px] text-sm">
            <thead className="sticky top-0 bg-slate-100 text-left">
              <tr>
                <th className="px-3 py-2">{mode === "pc" ? "Possible parent" : "Manta 1"}</th>
                <th className="px-3 py-2">{mode === "pc" ? "Parent Sample_ID" : "Manta 1 Sample_ID"}</th>
                <th className="px-3 py-2">{mode === "pc" ? "Parent HAMER Catalog ID" : "Manta 1 HAMER Catalog ID"}</th>
                <th className="px-3 py-2">{mode === "pc" ? "Parent Biopsy ID" : "Manta 1 Biopsy ID"}</th>
                <th className="px-3 py-2">{mode === "pc" ? "Parent MPRF biopsy id" : "Manta 1 MPRF biopsy id"}</th>
                <th className="px-3 py-2">{mode === "pc" ? "Parent MPRF Catalog ID" : "Manta 1 MPRF Catalog ID"}</th>
                <th className="px-3 py-2">{mode === "pc" ? "Parent rank" : "Manta 1 rank"}</th>
                <th className="px-3 py-2">{mode === "pc" ? "Parent min age" : "Manta 1 min age"}</th>
                <th className="px-3 py-2">{mode === "pc" ? "Possible child" : "Manta 2"}</th>
                <th className="px-3 py-2">{mode === "pc" ? "Child Sample_ID" : "Manta 2 Sample_ID"}</th>
                <th className="px-3 py-2">{mode === "pc" ? "Child HAMER Catalog ID" : "Manta 2 HAMER Catalog ID"}</th>
                <th className="px-3 py-2">{mode === "pc" ? "Child Biopsy ID" : "Manta 2 Biopsy ID"}</th>
                <th className="px-3 py-2">{mode === "pc" ? "Child MPRF biopsy id" : "Manta 2 MPRF biopsy id"}</th>
                <th className="px-3 py-2">{mode === "pc" ? "Child MPRF Catalog ID" : "Manta 2 MPRF Catalog ID"}</th>
                <th className="px-3 py-2">{mode === "pc" ? "Child rank" : "Manta 2 rank"}</th>
                <th className="px-3 py-2">{mode === "pc" ? "Child min age" : "Manta 2 min age"}</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Basis</th>
              </tr>
            </thead>
            <tbody>
              {filteredRelationships.length === 0 ? (
                <tr>
                  <td colSpan={18} className="px-3 py-6 text-center text-muted-foreground">
                    No relationships match this search.
                  </td>
                </tr>
              ) : (
                filteredRelationships.map((relationship) => (
                  <tr key={`${relationship.primary.pkBiopsyId}-${relationship.secondary.pkBiopsyId}-${relationship.code}`} className="border-t align-top">
                    <td className="px-3 py-2">{pairwiseAnimalLabel(relationship.primary)}</td>
                    <td className="px-3 py-2">{relationship.primary.jonathanSequenceId ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{formatCell(relationship.primary.catalogId)}</td>
                    <td className="px-3 py-2">{relationship.primary.pkBiopsyId}</td>
                    <td className="px-3 py-2">{displayMprfBiopsyId(relationship.primary) ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMprfCatalogId(relationship.primary.mprfCatalogId) ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{formatCell(relationship.primary.exploratoryRank)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatAgeYears(relationship.primary.minimumAgeAsOfYears)}</td>
                    <td className="px-3 py-2">{pairwiseAnimalLabel(relationship.secondary)}</td>
                    <td className="px-3 py-2">{relationship.secondary.jonathanSequenceId ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{formatCell(relationship.secondary.catalogId)}</td>
                    <td className="px-3 py-2">{relationship.secondary.pkBiopsyId}</td>
                    <td className="px-3 py-2">{displayMprfBiopsyId(relationship.secondary) ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMprfCatalogId(relationship.secondary.mprfCatalogId) ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{formatCell(relationship.secondary.exploratoryRank)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatAgeYears(relationship.secondary.minimumAgeAsOfYears)}</td>
                    <td className="px-3 py-2 font-semibold">{relationship.code}</td>
                    <td className="px-3 py-2 text-xs text-slate-700">{relationship.detail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MaturityAgeSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-md border bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-900">{label}</span>
        <span className="tabular-nums text-slate-700">{value.toFixed(1)} yrs</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step="0.5"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-blue-600"
      />
    </div>
  );
}

function BirthYearEstimateModal({
  open,
  onOpenChange,
  rows,
  growthRate,
  birthSize,
  maleTerminalSize,
  femaleTerminalSize,
  preterminalWeight,
  terminalWeight,
  onPreterminalWeightChange,
  onTerminalWeightChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: BirthYearEstimateRow[];
  growthRate: number;
  birthSize: number;
  maleTerminalSize: number;
  femaleTerminalSize: number;
  preterminalWeight: number;
  terminalWeight: number;
  onPreterminalWeightChange: (value: number) => void;
  onTerminalWeightChange: (value: number) => void;
}) {
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => compareValues(a.latestPossibleBirthYear, b.latestPossibleBirthYear)),
    [rows],
  );
  const preterminalRows = rows.filter((row) => row.status === "preterminal");
  const terminalRows = rows.filter((row) => row.status === "terminal");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Latest Possible Birth Year From Size</DialogTitle>
          <DialogDescription>
            Uses birth size {birthSize.toFixed(2)} m, active growth rate {growthRate.toFixed(2)} m/yr, and selected terminal sizes of {maleTerminalSize.toFixed(2)} m / {femaleTerminalSize.toFixed(2)} m.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Records" value={rows.length} />
          <Metric label="Preterminal" value={preterminalRows.length} help="Measured below sex-specific terminal size, so size-growth birth year is treated as more informative." />
          <Metric label="Terminal" value={terminalRows.length} help="Measured at or above sex-specific terminal size; size only provides the youngest possible age if the manta had just reached terminal size." />
          <Metric label="Unknown" value={rows.filter((row) => row.status === "unknown").length} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-1 text-sm font-medium">
              Preterminal sensitivity
              <HelpTip text="Exploratory sensitivity value for comparing latest-birth-year cues. This does not currently drive the main age ranking." />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <input type="range" min="0" max="100" step="5" value={preterminalWeight} onChange={(event) => onPreterminalWeightChange(Number(event.target.value))} className="flex-1 accent-blue-600" />
              <Input type="number" min={0} max={100} value={preterminalWeight} onChange={(event) => onPreterminalWeightChange(clampNumber(event.target.value, 0, 100))} className="h-9 w-20" />
            </div>
          </div>
          <div className="rounded-md border bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-1 text-sm font-medium">
              Terminal-size sensitivity
              <HelpTip text="Exploratory sensitivity value for terminal-sized animals. This does not currently drive the main age ranking; terminal size can only say the youngest possible age." />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <input type="range" min="0" max="100" step="5" value={terminalWeight} onChange={(event) => onTerminalWeightChange(Number(event.target.value))} className="flex-1 accent-blue-600" />
              <Input type="number" min={0} max={100} value={terminalWeight} onChange={(event) => onTerminalWeightChange(clampNumber(event.target.value, 0, 100))} className="h-9 w-20" />
            </div>
          </div>
        </div>
        <div className="rounded-md border bg-amber-50 px-3 py-2 text-sm text-amber-900">
          For terminal-size mantas, the birth year is a latest possible birth year only: it assumes the manta had just reached terminal size at measurement. The true birth year could be earlier.
        </div>
        <div className="overflow-auto rounded-md border">
          <table className="w-full min-w-[1450px] text-sm">
            <thead className="sticky top-0 bg-slate-100 text-left">
              <tr>
                <th className="px-3 py-2">Latest birth year</th>
                <th className="px-3 py-2">Minimum age</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Sensitivity</th>
                <th className="px-3 py-2">Biopsy</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Island</th>
                <th className="px-3 py-2">Sex</th>
                <th className="px-3 py-2">Biopsy date</th>
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Growth</th>
                <th className="px-3 py-2">Terminal</th>
                <th className="px-3 py-2">Scaled cue</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-3 py-8 text-center text-muted-foreground">No records have usable sex, biopsy date, and size evidence.</td>
                </tr>
              ) : (
                sortedRows.map((estimate) => (
                  <tr key={estimate.row.pkBiopsyId} className="border-t">
                    <td className="px-3 py-2 tabular-nums">{formatCell(estimate.latestPossibleBirthYear)}</td>
                    <td className="px-3 py-2 tabular-nums">{estimate.minimumAgeYears == null ? "—" : `${estimate.minimumAgeYears.toFixed(1)} yrs`}</td>
                    <td className="px-3 py-2 capitalize">{estimate.status}</td>
                    <td className="px-3 py-2 tabular-nums">{estimate.weight}%</td>
                    <td className="px-3 py-2">{estimate.row.mprfBiopsyId ?? estimate.row.pkBiopsyId}</td>
                    <td className="px-3 py-2">{estimate.row.name ?? "—"}</td>
                    <td className="px-3 py-2">{estimate.row.island ?? "—"}</td>
                    <td className="px-3 py-2">{estimate.row.gender ?? "—"}</td>
                    <td className="px-3 py-2">{estimate.biopsyDate ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{estimate.sizeM == null ? "—" : `${estimate.sizeM.toFixed(2)} m`}</td>
                    <td className="px-3 py-2">{estimate.sizeSource}</td>
                    <td className="px-3 py-2 tabular-nums">{estimate.growthRateMPerYear == null ? "—" : `${estimate.growthRateMPerYear.toFixed(2)} m/yr`}</td>
                    <td className="px-3 py-2 tabular-nums">{estimate.terminalSizeM == null ? "—" : `${estimate.terminalSizeM.toFixed(2)} m`}</td>
                    <td className="px-3 py-2 tabular-nums">{estimate.scaledAgeCue == null ? "—" : `${estimate.scaledAgeCue.toFixed(1)} yrs`}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NumberControl({
  label,
  value,
  defaultValue,
  suffix,
  step = "0.1",
  help,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  defaultValue: number;
  suffix: string;
  step?: string;
  help?: string;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const isDefault = value === defaultValue;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Label className="text-xs">{label}</Label>
          {help ? <HelpTip text={help} /> : null}
        </div>
        <button
          type="button"
          className="text-slate-500 hover:text-blue-700 disabled:opacity-30"
          disabled={isDefault}
          onClick={onReset}
          title={`Reset to ${defaultValue}`}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Input type="number" min="0" step={step} value={value} onChange={(event) => onChange(event.target.value)} className="h-9" />
        <span className="w-8 text-xs text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}

function ModelControlCard({
  title,
  description,
  help,
  checked,
  locked = false,
  children,
  onCheckedChange,
}: {
  title: string;
  description: string;
  help: string;
  checked: boolean;
  locked?: boolean;
  children?: ReactNode;
  onCheckedChange?: (value: boolean) => void;
}) {
  return (
    <div className={`rounded-md border p-3 ${checked ? "border-blue-200 bg-blue-50" : "bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1 text-sm font-semibold text-slate-900">
            <span>{title}</span>
            <HelpTip text={help} />
          </div>
          <p className="mt-1 text-xs text-slate-600">{description}</p>
        </div>
        <Switch checked={checked} disabled={locked} onCheckedChange={(value) => onCheckedChange?.(Boolean(value))} />
      </div>
      {locked ? <div className="mt-2 text-[11px] font-medium text-blue-700">Baseline always on</div> : null}
      {children ? <div className="mt-3 border-t border-slate-200 pt-3">{children}</div> : null}
    </div>
  );
}

function ToggleControl({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-white px-3 py-2">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function WeightControl({
  label,
  value,
  help,
  onChange,
}: {
  label: string;
  value: number;
  help: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-md border bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs font-medium text-slate-700">
          <span>{label}</span>
          <HelpTip text={help} />
        </div>
        <span className="text-xs tabular-nums text-slate-600">{value}</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full accent-blue-600"
      />
    </div>
  );
}

function CheckboxLine({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
        <span>{label}</span>
      </label>
      <HelpTip text={help} />
    </div>
  );
}

function PopulationScopePanel({
  title,
  description,
  loading,
  summary,
  evidenceSummary,
  pairwiseSummary,
  onMetricClick,
  onShowRecords,
  onViewMatrix,
}: {
  title: string;
  description: string;
  loading: boolean;
  summary: WorkbenchSummary;
  evidenceSummary: EvidenceSummary;
  pairwiseSummary: PairwiseAnimalCounts;
  onMetricClick: (metric: MetricKey) => void;
  onShowRecords: () => void;
  onViewMatrix: () => void;
}) {
  return (
    <div className="rounded-md border bg-white p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="font-semibold text-slate-900">{title}</h4>
          <p className="text-xs text-slate-600">{loading ? "Loading biopsy, catalog, sighting, and size records..." : description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onShowRecords} disabled={loading || summary.total === 0}>
            Show Records
          </Button>
          <Button variant="outline" size="sm" onClick={onViewMatrix} disabled={loading || summary.total === 0}>
            View Matrix
          </Button>
        </div>
      </div>

      <TooltipProvider>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
          <Metric label="Records" value={loading ? "Loading..." : summary.total} onClick={() => onMetricClick("biopsies")} />
          <Metric
            label="With size evidence"
            value={loading ? "Loading..." : summary.withSize}
            help="Rows with an exact biopsy size, nearest size before biopsy, or nearest size after biopsy available to the exploratory model."
            onClick={() => onMetricClick("size")}
          />
          <Metric
            label="Changed vs current"
            value={loading ? "Loading..." : summary.changedVsCurrent}
            help="Rows whose exploratory rank differs from the existing saved database rank for this population scope."
            onClick={() => onMetricClick("changedCurrent")}
          />
          <Metric
            label="Relative change from Model 1"
            value={loading ? "Loading..." : summary.changedFromModel1Baseline}
            help="Counts rows whose immediate neighbor above or below changed compared with the Model 1 life-history-only baseline in this population scope."
            onClick={() => onMetricClick("changedModel1Baseline")}
          />
          <Metric
            label="Flagged rows"
            value={loading ? "Loading..." : summary.missing}
            help="Rows with missing or incomplete data used by this workbench."
            onClick={() => onMetricClick("flags")}
          />
        </div>
      </TooltipProvider>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        <SummaryStat label="First sighting" value={loading ? "Loading..." : evidenceSummary.withFirstSighting} />
        <SummaryStat label="Pup first sighting" value={loading ? "Loading..." : evidenceSummary.withPup} />
        <SummaryStat label="Age class" value={loading ? "Loading..." : evidenceSummary.withAgeClass} />
        <SummaryStat label="Age intervals" value={loading ? "Loading..." : evidenceSummary.withInterval} />
        <SummaryStat label="Biopsied records" value={loading ? "Loading..." : summary.biopsied} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <SummaryStat label="Mantas with P" value={loading ? "Loading..." : pairwiseSummary.P} />
        <SummaryStat label="Mantas with C" value={loading ? "Loading..." : pairwiseSummary.C} />
        <SummaryStat label="Mantas with S" value={loading ? "Loading..." : pairwiseSummary.S} />
        <SummaryStat label="Mantas with U" value={loading ? "Loading..." : pairwiseSummary.U} />
      </div>
    </div>
  );
}

function Metric({ label, value, help, onClick }: { label: string; value: number | string; help?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border bg-white px-3 py-2 text-left transition hover:border-blue-300 hover:bg-blue-50"
    >
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>{label}</span>
        {help ? <HelpTip text={help} /> : null}
      </div>
      <div className={typeof value === "number" ? "text-2xl font-semibold" : "text-base font-semibold"}>{value}</div>
    </button>
  );
}

function SummaryStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border bg-slate-50 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={typeof value === "number" ? "text-xl font-semibold tabular-nums" : "text-sm font-semibold"}>{value}</div>
    </div>
  );
}

function HelpTip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-blue-700">
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

type GrowthObservation = {
  catalogId: number;
  name: string | null;
  gender: "male" | "female" | null;
  date: string;
  sizeM: number;
  source: string;
};

type GrowthCatalogRow = {
  catalogId: number;
  name: string | null;
  gender: "male" | "female" | null;
  firstDate: string | null;
  lastDate: string | null;
  firstSizeM: number | null;
  maxSizeM: number | null;
  observations: number;
  intervalCount: number;
  medianGrowthCmPerYear: number | null;
  maxGrowthCmPerYear: number | null;
  terminalCandidate: boolean;
};

type GrowthSummary = {
  gender: "male" | "female";
  individuals: number;
  observations: number;
  medianMaxSizeM: number | null;
  p90MaxSizeM: number | null;
  medianGrowthCmPerYear: number | null;
  suggestedTerminalM: number | null;
  suggestedGrowthMPerYear: number | null;
};

type GrowthExploration = {
  observations: GrowthObservation[];
  catalogRows: GrowthCatalogRow[];
  summaries: GrowthSummary[];
};

function GrowthExplorationModal({
  open,
  onOpenChange,
  exploration,
  parameters,
  onApplySuggestion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exploration: GrowthExploration;
  parameters: BiopsyAgeParameters;
  onApplySuggestion: (patch: Partial<BiopsyAgeParameters>) => void;
}) {
  const male = exploration.summaries.find((row) => row.gender === "male");
  const female = exploration.summaries.find((row) => row.gender === "female");
  const suggestedGrowth = median(
    exploration.summaries
      .map((row) => row.suggestedGrowthMPerYear)
      .filter((value): value is number => value != null),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Age-growth exploration</DialogTitle>
          <DialogDescription>
            Observed size histories by sex, pre-terminal growth intervals, and suggested growth-model defaults for the age-ranking workbench.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {exploration.summaries.map((summary) => (
            <div key={summary.gender} className="rounded-md border bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold capitalize">{summary.gender}</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onApplySuggestion(
                      summary.gender === "male"
                        ? {
                            maleTerminalSizeM: summary.suggestedTerminalM ?? parameters.maleTerminalSizeM,
                            juvenileGrowthRateMPerYear: suggestedGrowth ?? parameters.juvenileGrowthRateMPerYear,
                          }
                        : {
                            femaleTerminalSizeM: summary.suggestedTerminalM ?? parameters.femaleTerminalSizeM,
                            juvenileGrowthRateMPerYear: suggestedGrowth ?? parameters.juvenileGrowthRateMPerYear,
                          },
                    )
                  }
                >
                  Apply suggested
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <GrowthStat label="Individuals" value={summary.individuals} />
                <GrowthStat label="Size observations" value={summary.observations} />
                <GrowthStat label="Median max size" value={formatMetersPlain(summary.medianMaxSizeM)} />
                <GrowthStat label="P90 max size" value={formatMetersPlain(summary.p90MaxSizeM)} />
                <GrowthStat label="Median growth" value={formatCmPerYear(summary.medianGrowthCmPerYear)} />
                <GrowthStat label="Suggested terminal" value={formatMetersPlain(summary.suggestedTerminalM)} />
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-md border bg-white p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-semibold">Current model values</h3>
              <p className="text-sm text-muted-foreground">
                These are the values currently feeding the checkpoint age-interval model.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <GrowthStat label="Male terminal" value={formatMetersPlain(parameters.maleTerminalSizeM)} />
              <GrowthStat label="Female terminal" value={formatMetersPlain(parameters.femaleTerminalSizeM)} />
              <GrowthStat label="Birth size" value={formatMetersPlain(parameters.birthSizeM)} />
              <GrowthStat label="Growth rate" value={`${parameters.juvenileGrowthRateMPerYear.toFixed(2)} m/yr`} />
            </div>
          </div>
        </div>

        <div className="rounded-md border bg-white">
          <div className="border-b px-3 py-2">
            <h3 className="font-semibold">Catalog growth intervals</h3>
            <p className="text-sm text-muted-foreground">
              Growth rates are calculated from positive size changes between dated observations before terminal size.
            </p>
          </div>
          <div className="max-h-[42vh] overflow-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="sticky top-0 bg-slate-100 text-left">
                <tr>
                  <th className="px-3 py-2">Catalog</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Gender</th>
                  <th className="px-3 py-2">First size</th>
                  <th className="px-3 py-2">Max size</th>
                  <th className="px-3 py-2">First date</th>
                  <th className="px-3 py-2">Last date</th>
                  <th className="px-3 py-2">Obs.</th>
                  <th className="px-3 py-2">Intervals</th>
                  <th className="px-3 py-2">Median growth</th>
                  <th className="px-3 py-2">Terminal candidate</th>
                </tr>
              </thead>
              <tbody>
                {exploration.catalogRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                      No repeated dated size records available.
                    </td>
                  </tr>
                ) : (
                  exploration.catalogRows.map((row) => (
                    <tr key={row.catalogId} className="border-t">
                      <td className="px-3 py-2">{row.catalogId}</td>
                      <td className="px-3 py-2">{row.name ?? "—"}</td>
                      <td className="px-3 py-2">{row.gender ?? "—"}</td>
                      <td className="px-3 py-2">{formatMetersPlain(row.firstSizeM)}</td>
                      <td className="px-3 py-2">{formatMetersPlain(row.maxSizeM)}</td>
                      <td className="px-3 py-2">{row.firstDate ?? "—"}</td>
                      <td className="px-3 py-2">{row.lastDate ?? "—"}</td>
                      <td className="px-3 py-2">{row.observations}</td>
                      <td className="px-3 py-2">{row.intervalCount}</td>
                      <td className="px-3 py-2">{formatCmPerYear(row.medianGrowthCmPerYear)}</td>
                      <td className="px-3 py-2">{row.terminalCandidate ? "Yes" : "No"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-md border bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This is an exploratory descriptive curve, not a fitted population growth model. It uses observed repeated sizes, current sex labels,
          and positive pre-terminal growth intervals. Outliers, calibration quality, and age-class validation still need review before treating
          suggested values as biological constants.
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GrowthStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border bg-white px-2 py-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}

function buildGrowthExploration({
  catalogs,
  mantas,
  sightings,
  sizes,
  parameters,
}: {
  catalogs: ResearchCatalogRow[];
  mantas: ResearchMantaRow[];
  sightings: ResearchSightingRow[];
  sizes: ResearchSizeRow[];
  parameters: BiopsyAgeParameters;
}): GrowthExploration {
  const catalogById = new Map(catalogs.map((row) => [toNumber(row.pk_catalog_id), row]));
  const sightingById = new Map(sightings.map((row) => [toNumber(row.pk_sighting_id), row]));
  const mantaById = new Map(mantas.map((row) => [toNumber(row.pk_manta_id), row]));
  const observations: GrowthObservation[] = [];

  mantas.forEach((manta) => {
    const catalogId = toNumber(manta.fk_catalog_id);
    if (catalogId == null) return;
    const sighting = toNumber(manta.fk_sighting_id) == null ? undefined : sightingById.get(toNumber(manta.fk_sighting_id));
    const date = toDateOnly(manta.sighting_date ?? sighting?.sighting_date);
    if (!date) return;
    const gender = normalizeGender(manta.gender ?? catalogById.get(catalogId)?.last_gender);
    sizeValuesFromMantaLike(manta).forEach((sizeM) => {
      observations.push({
        catalogId,
        name: cleanDisplay(catalogById.get(catalogId)?.name ?? manta.name),
        gender,
        date,
        sizeM,
        source: `manta ${manta.pk_manta_id}`,
      });
    });
  });

  sizes.forEach((sizeRow) => {
    if (!sizeMeasurementUsable(sizeRow) || (!sizeMeasurementIncludedInMean(sizeRow) && sizeRow.size_m == null)) return;
    const manta = toNumber(sizeRow.fk_manta_id) == null ? undefined : mantaById.get(toNumber(sizeRow.fk_manta_id));
    const catalogId = toNumber(manta?.fk_catalog_id);
    const date = toDateOnly(sizeRow.measured_on);
    const sizeM = dwM(sizeRow) ?? toNumber(sizeRow.size_m);
    if (catalogId == null || !date || sizeM == null) return;
    const catalog = catalogById.get(catalogId);
    observations.push({
      catalogId,
      name: cleanDisplay(catalog?.name ?? manta?.name),
      gender: normalizeGender(manta?.gender ?? catalog?.last_gender),
      date,
      sizeM,
      source: `size ${sizeRow.pk_manta_size_id}`,
    });
  });

  const grouped = groupGrowthObservations(observations);
  const catalogRows = Array.from(grouped.entries())
    .map(([catalogId, rawRows]) => {
      const rows = dedupeGrowthObservations(rawRows).sort((a, b) => a.date.localeCompare(b.date));
      const gender = rows.find((row) => row.gender)?.gender ?? null;
      const terminalSize =
        gender === "female" ? parameters.femaleTerminalSizeM : gender === "male" ? parameters.maleTerminalSizeM : null;
      const intervals = growthIntervals(rows, terminalSize);
      const sizesOnly = rows.map((row) => row.sizeM);
      return {
        catalogId,
        name: rows[0]?.name ?? null,
        gender,
        firstDate: rows[0]?.date ?? null,
        lastDate: rows[rows.length - 1]?.date ?? null,
        firstSizeM: rows[0]?.sizeM ?? null,
        maxSizeM: max(sizesOnly),
        observations: rows.length,
        intervalCount: intervals.length,
        medianGrowthCmPerYear: median(intervals.map((row) => row.growthCmPerYear)),
        maxGrowthCmPerYear: max(intervals.map((row) => row.growthCmPerYear)),
        terminalCandidate: terminalSize != null && max(sizesOnly) != null ? (max(sizesOnly) as number) >= terminalSize * 0.97 : false,
      };
    })
    .filter((row) => row.observations >= 1)
    .sort((a, b) => String(a.gender ?? "").localeCompare(String(b.gender ?? "")) || (b.maxSizeM ?? 0) - (a.maxSizeM ?? 0));

  const summaries = (["male", "female"] as const).map((gender) => {
    const genderRows = catalogRows.filter((row) => row.gender === gender);
    const maxSizes = genderRows.map((row) => row.maxSizeM).filter((value): value is number => value != null);
    const growthRates = genderRows
      .map((row) => row.medianGrowthCmPerYear)
      .filter((value): value is number => value != null && value > 0 && value < 80);
    const p90MaxSizeM = percentile(maxSizes, 0.9);
    const medianGrowthCmPerYear = median(growthRates);
    return {
      gender,
      individuals: genderRows.length,
      observations: genderRows.reduce((sum, row) => sum + row.observations, 0),
      medianMaxSizeM: median(maxSizes),
      p90MaxSizeM,
      medianGrowthCmPerYear,
      suggestedTerminalM: p90MaxSizeM,
      suggestedGrowthMPerYear: medianGrowthCmPerYear == null ? null : medianGrowthCmPerYear / 100,
    };
  });

  return { observations, catalogRows, summaries };
}

function groupGrowthObservations(rows: GrowthObservation[]) {
  const grouped = new Map<number, GrowthObservation[]>();
  rows.forEach((row) => {
    grouped.set(row.catalogId, [...(grouped.get(row.catalogId) ?? []), row]);
  });
  return grouped;
}

function dedupeGrowthObservations(rows: GrowthObservation[]) {
  const byDate = new Map<string, GrowthObservation[]>();
  rows.forEach((row) => {
    byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);
  });
  return Array.from(byDate.entries()).map(([date, dateRows]) => {
    const sorted = [...dateRows].sort((a, b) => a.sizeM - b.sizeM);
    const mid = sorted[Math.floor(sorted.length / 2)];
    return {
      ...mid,
      date,
      sizeM: median(sorted.map((row) => row.sizeM)) ?? mid.sizeM,
    };
  });
}

function growthIntervals(rows: GrowthObservation[], terminalSize: number | null) {
  const intervals: Array<{ growthCmPerYear: number }> = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const next = rows[i];
    const years = yearsBetweenDates(prev.date, next.date);
    const delta = next.sizeM - prev.sizeM;
    if (years == null || years < 0.25 || delta <= 0) continue;
    if (terminalSize != null && prev.sizeM >= terminalSize * 0.97) continue;
    intervals.push({ growthCmPerYear: (delta / years) * 100 });
  }
  return intervals;
}

function sizeValuesFromMantaLike(manta: ResearchMantaRow) {
  return [
    toNumber(manta.size_dw_m),
    toNumber(manta.size_disc_width_m),
    toNumber(manta.size_m),
    toNumber(manta.estimated_size_m),
    toNumber(manta.jon_size_m),
  ].filter((value): value is number => value != null && value > 0.5 && value < 6);
}

function normalizeGender(value: unknown): "male" | "female" | null {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "m" || text === "male") return "male";
  if (text === "f" || text === "female") return "female";
  return null;
}

function cleanDisplay(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function toNumber(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDateOnly(value: unknown) {
  if (!value) return null;
  const text = String(value);
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function yearsBetweenDates(a: string, b: string) {
  const diff = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(diff)) return null;
  return diff / 86400000 / 365.25;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

function max(values: number[]) {
  return values.length ? Math.max(...values) : null;
}

function formatMetersPlain(value: number | null | undefined) {
  return value == null ? "—" : `${value.toFixed(2)} m`;
}

function formatCmPerYear(value: number | null | undefined) {
  return value == null ? "—" : `${value.toFixed(1)} cm/yr`;
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

async function fetchResearchData(): Promise<CachedResearchData> {
  const [biopsyRows, rankRows] = await Promise.all([
    selectAll<ResearchBiopsyRow>(
      "biopsies",
      "pk_biopsy_id,fk_manta_id,fk_sighting_id,fk_catalog_id,sample_date,sample_time,collector,island,region,location,lab_id,raw_sample_id,source",
      "pk_biopsy_id",
    ),
    selectAll<ResearchRankRow>("kona_biopsy_age_rank_view_v3", "*", "age_rank_v3"),
  ]);

  const biopsySightingIds = uniq(biopsyRows.map((row) => row.fk_sighting_id));

  const [catalogRows, mantaRows] = await Promise.all([
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

  const sightingIds = uniq([...biopsySightingIds, ...mantaRows.map((row) => row.fk_sighting_id)]);
  const mantaSizeIds = uniq(mantaRows.map((row) => row.pk_manta_id));

  const [sightingRows, sizeRows] = await Promise.all([
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

  const data = {
    savedAt: new Date().toISOString(),
    fingerprint: "",
    biopsies: biopsyRows,
    catalogs: catalogRows,
    mantas: mantaRows,
    sightings: sightingRows,
    sizes: sizeRows,
    ranks: rankRows,
  };
  return { ...data, fingerprint: researchDataFingerprint(data) };
}

function readCachedResearchData() {
  try {
    const raw = window.localStorage.getItem(RESEARCH_DATA_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedResearchData;
    return parsed?.fingerprint ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedResearchData(data: CachedResearchData) {
  try {
    window.localStorage.setItem(RESEARCH_DATA_CACHE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("[BiopsyAgeRankings] unable to cache research data", err);
  }
}

function researchDataFingerprint(data: Omit<CachedResearchData, "fingerprint">) {
  return [
    data.biopsies.length,
    data.catalogs.length,
    data.mantas.length,
    data.sightings.length,
    data.sizes.length,
    data.ranks.length,
    lastId(data.biopsies, "pk_biopsy_id"),
    lastId(data.catalogs, "pk_catalog_id"),
    lastId(data.mantas, "pk_manta_id"),
    lastId(data.sightings, "pk_sighting_id"),
    lastId(data.sizes, "pk_manta_size_id"),
  ].join(":");
}

function lastId(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce((maxId, row) => Math.max(maxId, Number(row[key]) || 0), 0);
}

function formatCacheTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

async function selectIn<T>(table: string, columns: string, column: string, values: unknown[]) {
  const cleanValues = uniq(values);
  if (cleanValues.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < cleanValues.length; i += 80) {
    const chunk = cleanValues.slice(i, i + 80);
    const { data, error } = await supabase.from(table).select(columns).in(column, chunk);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

function uniq(values: unknown[]) {
  return Array.from(new Set(values.filter((value) => value != null && value !== "").map((value) => Number.isFinite(Number(value)) ? Number(value) : String(value))));
}

function dedupeBy<T>(rows: T[], getKey: (row: T) => unknown) {
  const map = new Map<string, T>();
  rows.forEach((row) => map.set(String(getKey(row)), row));
  return Array.from(map.values());
}

function compareValues(a: unknown, b: unknown) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function formatCell(value: unknown) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

function displayMprfBiopsyId(row: BiopsyExplorationRow) {
  return row.mprfLegacyBiopsyId ?? row.mprfBiopsyId ?? null;
}

function formatMprfCatalogId(value: number | null | undefined) {
  if (value == null) return null;
  return `MP${String(value).padStart(3, "0")}`;
}

function formatRowCell(row: BiopsyExplorationRow, key: keyof BiopsyExplorationRow) {
  if (key === "totalYearsObserved") return formatYearsObservedCell(row, "total");
  if (key === "totalYearsObservedPriorToBiopsy") return formatYearsObservedCell(row, "prior");
  return formatCell(row[key]);
}

function formatYearsObservedCell(row: BiopsyExplorationRow, scope: "total" | "prior") {
  const value = scope === "total" ? row.totalYearsObserved : row.totalYearsObservedPriorToBiopsy;
  const isMinimum = scope === "total" ? row.totalYearsObservedIsMinimum : row.totalYearsObservedPriorToBiopsyIsMinimum;
  const formatted = formatCell(value);
  if (formatted === "—") return formatted;
  return isMinimum ? `>=${formatted} (minimum; pre-2010 MPRF history incomplete)` : formatted;
}

function formatSizeEvidence(row: BiopsyExplorationRow) {
  return [
    row.sizeAtBiopsyM != null ? `biopsy ${row.sizeAtBiopsyM.toFixed(2)} m` : null,
    row.nearestSizeBeforeBiopsyM != null ? `before ${row.nearestSizeBeforeBiopsyM.toFixed(2)} m (${row.daysBeforeBiopsySize} d)` : null,
    row.nearestSizeAfterBiopsyM != null ? `after ${row.nearestSizeAfterBiopsyM.toFixed(2)} m (${row.daysAfterBiopsySize} d)` : null,
  ].filter(Boolean).join(" | ") || "—";
}

function formatAgeYears(value: number | null | undefined) {
  return value == null ? "—" : `${value.toFixed(1)} yrs`;
}

function modelUsageMap(parameters: BiopsyAgeParameters) {
  const sizeMaturityAssumption = parameters.includeSizeEvidence;
  const hamerAgeClassAssumption = parameters.includeAgeClassEvidence;
  const mprfAgeClassAssumption = parameters.includeMprfAgeClassEvidence;
  return {
    firstSighting: parameters.includeLifeHistoryEvidence,
    hamerSize: parameters.includeSizeEvidence,
    hamerAgeClass: parameters.includeAgeClassEvidence,
    pupFirstSighting: parameters.includePupEvidence && parameters.treatPupAsBirthAnchor,
    mprfAgeClass: parameters.includeMprfAgeClassEvidence,
    sizeMaturityAssumption,
    hamerAgeClassAssumption,
    mprfAgeClassAssumption,
    anyMaturityAgeAssumption: sizeMaturityAssumption || hamerAgeClassAssumption || mprfAgeClassAssumption,
    sizeGrowthAssumption: false,
  };
}

function usedColumnLabel(label: string, used: boolean) {
  return `${label} [${used ? "USED" : "NOT USED"}]`;
}

function modelHeaderClass(used: boolean) {
  return `px-3 py-2 ${used ? "bg-emerald-50 text-emerald-900" : "bg-slate-200 text-slate-500"}`;
}

function isMprfAgeClassText(value: string) {
  return /\bMPRF\b/i.test(value);
}

function isHamerAgeClassText(value: string) {
  return !isMprfAgeClassText(value);
}

function formatAgeClassObservationsCell(row: BiopsyExplorationRow, source: "hamer" | "mprf") {
  const observations = row.ageClassObservationSummary.filter((value) => source === "mprf" ? isMprfAgeClassText(value) : isHamerAgeClassText(value));
  if (!observations.length) return source === "mprf" ? "No dated MPRF age-class observations" : "No dated HAMER age-class observations";
  return observations.map((value) => `- ${value}`).join("\n");
}

function formatAgeClassCheckpointCell(row: BiopsyExplorationRow, source: "hamer" | "mprf") {
  const checkpoints = row.ageIntervalCheckpoints.filter((checkpoint) => {
    if (checkpoint.key !== "age_class") return false;
    const text = `${checkpoint.label} ${checkpoint.detail}`;
    return source === "mprf" ? isMprfAgeClassText(text) : isHamerAgeClassText(text);
  });
  if (!checkpoints.length) return "—";
  return checkpoints.map(formatCheckpointBounds).join("\n");
}

function formatSizeObservationsCell(row: BiopsyExplorationRow, source: "hamer") {
  const observations = row.sizeObservationSummary;
  if (!observations.length) return source === "hamer" ? "No dated HAMER size measurements" : "No dated size measurements";
  return observations.map((value) => `- ${value}`).join("\n");
}

function formatCheckpointCell(
  row: BiopsyExplorationRow,
  key: "life_history" | "pup_first_sighting" | "age_class" | "size",
) {
  const checkpoints = row.ageIntervalCheckpoints.filter((checkpoint) => checkpoint.key === key);
  if (key === "age_class") {
    const observations = row.ageClassObservationSummary.length
      ? `Age classes:\n${row.ageClassObservationSummary.map((value) => `- ${value}`).join("\n")}`
      : "No dated age-class observations";
    const bounds = checkpoints.length ? checkpoints.map(formatCheckpointBounds).join("\n") : null;
    return bounds ? `${observations}\n${bounds}` : observations;
  }
  if (key === "size") {
    const observations = row.sizeObservationSummary.length
      ? `Measurements:\n${row.sizeObservationSummary.map((value) => `- ${value}`).join("\n")}`
      : "No dated size measurements";
    const bounds = checkpoints.length ? checkpoints.map(formatCheckpointBounds).join("\n") : null;
    return bounds ? `${observations}\n${bounds}` : observations;
  }
  if (key === "pup_first_sighting" && row.firstSightingAsPup && row.firstSightingDate) {
    const bounds = checkpoints.length ? checkpoints.map(formatCheckpointBounds).join("\n") : null;
    return `First seen as pup ${row.firstSightingDate}${bounds ? `\n${bounds}` : ""}`;
  }
  if (key === "life_history" && row.firstSightingDate) {
    const bounds = checkpoints.length ? checkpoints.map(formatCheckpointBounds).join("\n") : null;
    return `First seen ${row.firstSightingDate}${bounds ? `\n${bounds}` : ""}`;
  }
  if (checkpoints.length === 0) return "—";
  return checkpoints.map(formatCheckpointBounds).join("\n");
}

function formatCheckpointBounds(checkpoint: BiopsyExplorationRow["ageIntervalCheckpoints"][number]) {
  const bounds = [
    checkpoint.minimumAgeYears == null ? null : `min ${formatAgeYears(checkpoint.minimumAgeYears)}`,
    checkpoint.maximumAgeYears == null ? null : `max ${formatAgeYears(checkpoint.maximumAgeYears)}`,
  ].filter(Boolean).join("; ");
  const rejected = checkpoint.rejectedMaximumAgeYears == null
    ? null
    : `\n  rejected max ${formatAgeYears(checkpoint.rejectedMaximumAgeYears)}: ${checkpoint.rejectedMaximumReason ?? "stronger evidence overrides this bound"}`;
  const detail = checkpoint.detail ? `\n  ${checkpoint.detail}` : "";
  return `- ${checkpoint.label} ${checkpoint.date ?? "undated"}: ${bounds || "no bound"}${detail}${rejected ?? ""}`;
}

function formatNeighborCell(neighbor: RankNeighbor | undefined, labels: Map<string, string>) {
  if (!neighbor) return "—";
  const above = neighbor.previous ? labels.get(neighbor.previous) ?? neighbor.previous : "top";
  const below = neighbor.next ? labels.get(neighbor.next) ?? neighbor.next : "bottom";
  return `above: ${above}; below: ${below}`;
}

function classifyPairwiseGeneration(
  row: BiopsyExplorationRow,
  column: BiopsyExplorationRow,
  parameters: BiopsyAgeParameters,
): PairwiseGenerationCell {
  if (row.pkBiopsyId === column.pkBiopsyId) {
    return { code: "—", detail: "Same animal." };
  }

  const rowMin = row.minimumAgeAsOfYears;
  const columnMin = column.minimumAgeAsOfYears;
  const rowLabel = pairwiseAnimalLabel(row);
  const columnLabel = pairwiseAnimalLabel(column);

  const rowAsParent = classifyDatedParentChildEvidence(row, column, parameters);
  if (rowAsParent.code === "P") return rowAsParent;
  const columnAsParent = classifyDatedParentChildEvidence(column, row, parameters);
  if (columnAsParent.code === "P") {
    return {
      code: "C",
      detail: columnAsParent.detail.replace("could be parent of", "could be parent of"),
    };
  }
  if (rowAsParent.code === "S" || columnAsParent.code === "S") {
    return {
      code: "S",
      detail: [
        rowAsParent.code === "S" ? rowAsParent.detail : null,
        columnAsParent.code === "S" ? columnAsParent.detail : null,
      ].filter(Boolean).join(" "),
    };
  }

  if (rowMin == null || columnMin == null) {
    return {
      code: "U",
      detail: `Unknown: ${rowLabel} or ${columnLabel} is missing a minimum age estimate.`,
    };
  }

  return {
    code: "U",
    detail: `Unknown: no dated adult-versus-juvenile comparison is available. Minimum-age intervals are used for age ranking, but they are not used to back-date adult status for P/C generation calls.`,
  };
}

function buildPairwiseGenerationCounts(
  rows: BiopsyExplorationRow[],
  parameters: BiopsyAgeParameters,
  includeSameAnimal: boolean,
) {
  const next: Record<PairwiseGenerationCode, number> = { P: 0, C: 0, S: 0, U: 0, "—": 0 };
  rows.forEach((row) => {
    rows.forEach((column) => {
      const code = classifyPairwiseGeneration(row, column, parameters).code;
      if (code === "—" && !includeSameAnimal) return;
      next[code] += 1;
    });
  });
  return next;
}

function buildPairwiseRowCounts(
  row: BiopsyExplorationRow,
  columns: BiopsyExplorationRow[],
  parameters: BiopsyAgeParameters,
) {
  const counts: Record<Exclude<PairwiseGenerationCode, "—">, number> = { P: 0, C: 0, S: 0, U: 0 };
  columns.forEach((column) => {
    const code = classifyPairwiseGeneration(row, column, parameters).code;
    if (code === "—") return;
    counts[code] += 1;
  });
  return counts;
}

function buildPairwiseGenerationAnimalCounts(
  rows: BiopsyExplorationRow[],
  parameters: BiopsyAgeParameters,
) {
  const idsByCode: Record<Exclude<PairwiseGenerationCode, "—">, Set<string>> = {
    P: new Set(),
    C: new Set(),
    S: new Set(),
    U: new Set(),
  };
  rows.forEach((row) => {
    rows.forEach((column) => {
      if (row.pkBiopsyId === column.pkBiopsyId) return;
      const code = classifyPairwiseGeneration(row, column, parameters).code;
      if (code === "—") return;
      idsByCode[code].add(row.pkBiopsyId);
    });
  });
  return {
    P: idsByCode.P.size,
    C: idsByCode.C.size,
    S: idsByCode.S.size,
    U: idsByCode.U.size,
  };
}

function buildPairwiseRelationshipRows(
  rows: BiopsyExplorationRow[],
  parameters: BiopsyAgeParameters,
  mode: PairwiseRelationshipMode | null,
) {
  if (!mode) return [];
  const relationships: Array<{ primary: BiopsyExplorationRow; secondary: BiopsyExplorationRow; code: PairwiseGenerationCode; detail: string }> = [];
  rows.forEach((row, rowIndex) => {
    rows.forEach((column, columnIndex) => {
      if (row.pkBiopsyId === column.pkBiopsyId) return;
      const cell = classifyPairwiseGeneration(row, column, parameters);
      if (mode === "pc" && cell.code === "P") {
        relationships.push({ primary: row, secondary: column, code: cell.code, detail: cell.detail });
      }
      if (mode === "cc" && cell.code === "S" && rowIndex < columnIndex) {
        relationships.push({ primary: row, secondary: column, code: cell.code, detail: cell.detail });
      }
    });
  });
  return relationships;
}

function pairwiseCountStickyLeftClass(index: number) {
  if (index === 0) return "left-[190px]";
  if (index === 1) return "left-[232px]";
  if (index === 2) return "left-[274px]";
  return "left-[316px]";
}

function classifyDatedParentChildEvidence(
  possibleParent: BiopsyExplorationRow,
  possibleChild: BiopsyExplorationRow,
  parameters: BiopsyAgeParameters,
): PairwiseGenerationCell {
  const maturityAge = maturityAgeForPotentialChild(possibleChild, parameters);
  const parentLabel = pairwiseAnimalLabel(possibleParent);
  const childLabel = pairwiseAnimalLabel(possibleChild);
  if (maturityAge == null) {
    return { code: "U", detail: `${childLabel} has no maturity threshold for dated generation comparison.` };
  }
  const parentEvidence = generationStageEvidence(possibleParent, parameters);
  const childEvidence = generationStageEvidence(possibleChild, parameters);
  let strongestShortGap: { adultDate: string; juvenileDate: string; gap: number } | null = null;

  for (const adultDate of parentEvidence.adultDates) {
    for (const juvenileDate of childEvidence.juvenileDates) {
      const gap = yearsBetweenLocal(adultDate, juvenileDate);
      if (gap == null || gap < 0) continue;
      if (gap >= maturityAge) {
        return {
          code: "P",
          detail: `${parentLabel} could be parent of ${childLabel}: ${parentLabel} was adult/mature on ${adultDate}, ${childLabel} was juvenile/pup or below maturity size on ${juvenileDate}, and the ${gap.toFixed(1)}-yr separation is >= the possible child's selected maturity threshold (${maturityAge.toFixed(1)} yrs; unknown sex uses the female threshold).`,
        };
      }
      if (!strongestShortGap || gap > strongestShortGap.gap) {
        strongestShortGap = { adultDate, juvenileDate, gap };
      }
    }
  }

  if (strongestShortGap) {
    return {
      code: "S",
      detail: `${parentLabel} is not separated far enough to be parent of ${childLabel} using dated evidence: adult/mature on ${strongestShortGap.adultDate}, paired juvenile evidence on ${strongestShortGap.juvenileDate}, gap ${strongestShortGap.gap.toFixed(1)} yrs < possible child's selected maturity threshold ${maturityAge.toFixed(1)} yrs.`,
    };
  }

  return {
    code: "U",
    detail: `No dated adult-versus-juvenile comparison was available for ${parentLabel} as potential parent of ${childLabel}.`,
  };
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

  return {
    adultDates: Array.from(new Set(adultDates)).sort(),
    juvenileDates: Array.from(new Set(juvenileDates)).sort(),
  };
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

function pairwiseAnimalLabel(row: BiopsyExplorationRow) {
  const id = row.mprfBiopsyId ?? row.catalogId ?? row.pkBiopsyId;
  return row.name ? `${row.name} (${id})` : String(id);
}

function pairwiseShortLabel(row: BiopsyExplorationRow) {
  const rank = row.exploratoryRank == null ? "" : `#${row.exploratoryRank} `;
  const name = row.name ?? row.mprfBiopsyId ?? row.catalogId ?? row.pkBiopsyId;
  return `${rank}${name}`;
}

function pairwiseCodeClass(code: PairwiseGenerationCode) {
  if (code === "P") return "bg-emerald-50 text-emerald-800";
  if (code === "C") return "bg-sky-50 text-sky-800";
  if (code === "S") return "bg-violet-50 text-violet-800";
  if (code === "U") return "bg-slate-50 text-slate-600";
  return "bg-white text-slate-400";
}

function identifierCsvHeaders(prefix: string) {
  return [
    `${prefix} Sample_ID`,
    `${prefix} HAMER Catalog ID`,
    `${prefix} Biopsy ID`,
    `${prefix} MPRF biopsy id`,
    `${prefix} MPRF Catalog ID`,
  ];
}

function identifierCsvValues(row: BiopsyExplorationRow) {
  return [
    row.jonathanSequenceId,
    row.catalogId,
    row.pkBiopsyId,
    displayMprfBiopsyId(row),
    formatMprfCatalogId(row.mprfCatalogId),
  ];
}

function ageModelCsvLabel(parameters: BiopsyAgeParameters) {
  const models = ["Model 1 first sighting"];
  if (parameters.includePupEvidence && parameters.treatPupAsBirthAnchor) {
    models.push("Model 2 pup first sighting");
  }
  if (parameters.includeSizeEvidence) {
    models.push("Model 3 HAMER size + maturity-size/age assumptions");
  }
  if (parameters.includeAgeClassEvidence) {
    models.push("Model 4 HAMER age class + maturity-age assumptions");
  }
  if (parameters.includeMprfAgeClassEvidence) {
    models.push("Model 5 MPRF age class + maturity-age assumptions");
  }
  return models.join(" | ");
}

function csvMetadataRows(title: string, biopsiedOnly: boolean, parameters: BiopsyAgeParameters, rowCount: number) {
  return [
    ["Export title", title],
    ["Population filter", biopsiedOnly ? "Biopsied animals only" : "All mantas in selected population"],
    ["Age model applied", ageModelCsvLabel(parameters)],
    ["Model 2 pup first sighting", parameters.includePupEvidence && parameters.treatPupAsBirthAnchor ? "On" : "Off"],
    ["Model 3 HAMER size maturity-size/age assumptions", parameters.includeSizeEvidence ? "On" : "Off"],
    ["Model 4 HAMER age-class maturity-age assumptions", parameters.includeAgeClassEvidence ? "On" : "Off"],
    ["Model 5 MPRF age-class maturity-age assumptions", parameters.includeMprfAgeClassEvidence ? "On" : "Off"],
    ["Male maturity age assumption", `${parameters.maleMaturityAgeYears} years`],
    ["Female maturity age assumption", `${parameters.femaleMaturityAgeYears} years`],
    ["Male maturity size assumption", `${parameters.maleMaturitySizeM} m`],
    ["Female maturity size assumption", `${parameters.femaleMaturitySizeM} m`],
    ["Age reference date", AGE_RANK_AS_OF_DATE],
    ["Rows exported", rowCount],
    [],
  ];
}

function downloadCsv(
  filename: string,
  title: string,
  biopsiedOnly: boolean,
  parameters: BiopsyAgeParameters,
  rowCount: number,
  headers: unknown[],
  formattedRows: string[][],
) {
  const csv = [
    ...csvMetadataRows(title, biopsiedOnly, parameters, rowCount).map((row) => row.map((value) => formatCsv(value))),
    headers.map((value) => formatCsv(value)),
    ...formattedRows,
  ].map((line) => line.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatCsv(value: unknown) {
  const text = formatCell(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function slugifyFilename(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "biopsy-age-ranking-records";
}

function clampNumber(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}
