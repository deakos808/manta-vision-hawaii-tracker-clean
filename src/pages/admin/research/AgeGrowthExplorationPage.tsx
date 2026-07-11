import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import {
  BIOPSY_AGE_CITATIONS,
  DEFAULT_BIOPSY_AGE_PARAMETERS,
  ResearchCatalogRow,
  ResearchMantaRow,
  ResearchSightingRow,
  ResearchSizeRow,
} from "@/lib/research/biopsyAgeRanking";
import { dwM, sizeMeasurementIncludedInMean, sizeMeasurementUsable } from "@/utils/sizeMeasurements";

const PAGE_SIZE = 1000;
const CACHE_KEY = "age-growth-exploration-data-v2";
const IDB_NAME = "manta-age-growth-cache";
const IDB_STORE = "cache";
const TERMINAL_REMEASUREMENT_SIZE_M: Record<Gender, number> = {
  male: 3.02,
  female: 3.54,
};
let ageGrowthDataCache: AgeGrowthData | null = null;
let ageGrowthDataPromise: Promise<AgeGrowthData> | null = null;
let ageGrowthLastCacheSource = "not loaded";

type Gender = "male" | "female";
type PopulationFilter = "all" | "big-island" | "maui-nui" | "oahu" | "kauai";
type PopulationTab = {
  id: number;
  population: PopulationFilter;
  excludeTerminalMeasurements: boolean;
  remeasurementThreshold: number;
};
type AgeGrowthData = {
  catalogs: ResearchCatalogRow[];
  mantas: ResearchMantaRow[];
  sightings: ResearchSightingRow[];
  sizes: ResearchSizeRow[];
};
type GrowthObservation = {
  catalogId: number;
  name: string | null;
  gender: Gender | null;
  date: string;
  sizeM: number;
  population: PopulationFilter | "unknown";
};

type GrowthCatalogRow = {
  catalogId: number;
  name: string | null;
  gender: Gender | null;
  firstDate: string | null;
  lastDate: string | null;
  firstSizeM: number | null;
  maxSizeM: number | null;
  observations: number;
  intervalCount: number;
  medianGrowthCmPerYear: number | null;
  terminalCandidate: boolean;
};

type GrowthIntervalRow = {
  catalogId: number;
  name?: string | null;
  gender: Gender | null;
  startSizeM: number;
  endSizeM: number;
  growthMPerYear: number;
  years: number;
  startDate?: string;
  endDate?: string;
  intervalIndex?: number;
  signed?: boolean;
};

type SizeGrowthBin = {
  gender: Gender;
  label: string;
  minM: number;
  maxM: number;
  intervals: number;
  medianGrowthMPerYear: number | null;
};

type GrowthTrend = {
  intervals: GrowthIntervalRow[];
  bins: SizeGrowthBin[];
  slopeMPerYearPerM: number | null;
  interceptMPerYear: number | null;
  r2: number | null;
};

type RemeasuredMantaRow = {
  catalogId: number;
  name: string | null;
  gender: Gender | null;
  observations: number;
  firstDate: string | null;
  lastDate: string | null;
  yearsObserved: number | null;
  intervals: GrowthIntervalRow[];
  positiveIntervals: GrowthIntervalRow[];
  negativeIntervals: GrowthIntervalRow[];
  medianSignedGrowthMPerYear: number | null;
  medianPositiveGrowthMPerYear: number | null;
  intervalIqrMPerYear: number | null;
  intervalSlopeMPerYearPerInterval: number | null;
  intervalR2: number | null;
};

type RemeasurementSizeBin = {
  gender: Gender;
  label: string;
  minM: number;
  maxM: number;
  intervals: number;
  positiveIntervals: number;
  negativeIntervals: number;
  medianSignedGrowthMPerYear: number | null;
  medianPositiveGrowthMPerYear: number | null;
  negativeIntervalPercent: number | null;
};

type RemeasurementAnalysis = {
  threshold: number;
  threshold10Count: number;
  threshold5Count: number;
  mantas: RemeasuredMantaRow[];
  intervals: GrowthIntervalRow[];
  medianSignedGrowthMPerYear: number | null;
  medianPositiveGrowthMPerYear: number | null;
  medianWithinMantaIqrMPerYear: number | null;
  negativeIntervalPercent: number | null;
  sizeBins: RemeasurementSizeBin[];
};

type GrowthSummary = {
  gender: Gender;
  individuals: number;
  observations: number;
  medianMaxSizeM: number | null;
  p90MaxSizeM: number | null;
  medianGrowthCmPerYear: number | null;
  suggestedTerminalM: number | null;
};

export default function AgeGrowthExplorationPage() {
  const [catalogs, setCatalogs] = useState<ResearchCatalogRow[]>([]);
  const [mantas, setMantas] = useState<ResearchMantaRow[]>([]);
  const [sightings, setSightings] = useState<ResearchSightingRow[]>([]);
  const [sizes, setSizes] = useState<ResearchSizeRow[]>([]);
  const [populationTabs, setPopulationTabs] = useState<PopulationTab[]>([{ id: 1, population: "maui-nui", excludeTerminalMeasurements: false, remeasurementThreshold: 10 }]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [cacheSource, setCacheSource] = useState("not loaded");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeTab = populationTabs.find((tab) => tab.id === activeTabId) ?? populationTabs[0];
  const population = activeTab?.population ?? "all";
  const excludeTerminalMeasurements = activeTab?.excludeTerminalMeasurements ?? false;
  const remeasurementThreshold = activeTab?.remeasurementThreshold ?? 10;

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { catalogs: catalogRows, mantas: mantaRows, sightings: sightingRows, sizes: sizeRows } = await loadAgeGrowthData();
        if (!alive) return;
        setCatalogs(catalogRows);
        setMantas(mantaRows);
        setSightings(sightingRows);
        setSizes(sizeRows);
        setCacheSource(ageGrowthLastCacheSource);
      } catch (err) {
        console.error("[AgeGrowthExploration] load error", err);
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

  const exploration = useMemo(
    () => buildGrowthExploration({ catalogs, mantas, sightings, sizes, population, excludeTerminalMeasurements, remeasurementThreshold }),
    [catalogs, mantas, sightings, sizes, population, excludeTerminalMeasurements, remeasurementThreshold],
  );

  function updateActivePopulation(nextPopulation: PopulationFilter) {
    setPopulationTabs((tabs) => tabs.map((tab) => tab.id === activeTabId ? { ...tab, population: nextPopulation } : tab));
  }

  function updateActiveTab(patch: Partial<Omit<PopulationTab, "id">>) {
    setPopulationTabs((tabs) => tabs.map((tab) => tab.id === activeTabId ? { ...tab, ...patch } : tab));
  }

  function addPopulationTab() {
    setPopulationTabs((tabs) => {
      const nextId = Math.max(...tabs.map((tab) => tab.id), 0) + 1;
      const nextPopulation = firstUnusedPopulation(tabs.map((tab) => tab.population)) ?? population;
      setActiveTabId(nextId);
      return [...tabs, { id: nextId, population: nextPopulation, excludeTerminalMeasurements, remeasurementThreshold }];
    });
  }

  function closePopulationTab(id: number) {
    setPopulationTabs((tabs) => {
      if (tabs.length === 1) return tabs;
      const nextTabs = tabs.filter((tab) => tab.id !== id);
      if (activeTabId === id) setActiveTabId(nextTabs[0]?.id ?? 1);
      return nextTabs;
    });
  }

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50">
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white py-8 px-4">
          <div className="max-w-[1400px] mx-auto">
            <h1 className="text-3xl font-semibold">Age-growth Exploration</h1>
            <p className="mt-2 max-w-4xl text-blue-50">
              Observed size histories by sex, pre-terminal growth intervals, and suggested growth defaults for age-ranking research.
            </p>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto px-4 py-2">
          <Link to="/admin" className="text-sm text-blue-700 underline">Admin</Link>
          <span className="text-sm text-slate-600"> / </span>
          <Link to="/admin/research" className="text-sm text-blue-700 underline">Research Exploration</Link>
          <span className="text-sm text-slate-600"> / Age-growth Exploration</span>
        </div>

        <main className="max-w-[1400px] mx-auto px-4 pb-8 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                {populationTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`rounded-md border px-3 py-1 text-sm ${tab.id === activeTabId ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300 bg-white text-slate-700"}`}
                    onClick={() => setActiveTabId(tab.id)}
                  >
                    Workbench {tab.id}: {populationLabel(tab.population)}
                    {populationTabs.length > 1 ? (
                      <span
                        className="ml-2 text-slate-400 hover:text-slate-700"
                        onClick={(event) => {
                          event.stopPropagation();
                          closePopulationTab(tab.id);
                        }}
                      >
                        x
                      </span>
                    ) : null}
                  </button>
                ))}
                <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700" onClick={addPopulationTab}>
                  + workbench
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,320px)_1fr]">
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="population-filter">Population</label>
                  <select
                    id="population-filter"
                    className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={population}
                    onChange={(event) => updateActivePopulation(event.target.value as PopulationFilter)}
                  >
                    <option value="all">All populations</option>
                    <option value="big-island">Big Island</option>
                    <option value="maui-nui">Maui Nui</option>
                    <option value="oahu">Oahu</option>
                    <option value="kauai">Kauai</option>
                  </select>
                </div>
                <label className="mt-7 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={excludeTerminalMeasurements}
                    onChange={(event) => updateActiveTab({ excludeTerminalMeasurements: event.target.checked })}
                  />
                  Remove measurements after terminal size is reached: male 3.02 m, female 3.54 m
                </label>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Population is assigned from the linked sighting island for each dated size observation. Controls recalculate the analysis immediately. Data source for this page load: {cacheSource}.
              </p>
            </CardContent>
          </Card>
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Failed to load growth exploration data: {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {exploration.summaries.map((summary) => (
              <Card key={summary.gender}>
                <CardContent className="p-4">
                  <h2 className="font-semibold capitalize">{summary.gender}</h2>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <Stat label="Individuals" value={loading ? "..." : summary.individuals} />
                    <Stat label="Size observations" value={loading ? "..." : summary.observations} />
                    <Stat label="Median max size" value={formatMeters(summary.medianMaxSizeM)} />
                    <Stat label="P90 max size" value={formatMeters(summary.p90MaxSizeM)} />
                    <Stat label="Median growth" value={formatMPerYear(summary.medianGrowthCmPerYear)} />
                    <Stat label="Suggested terminal" value={formatMeters(summary.suggestedTerminalM)} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                Age Ranking Defaults Based on Literature and Hawaii Data
                <InfoTip text={defaultsInfoText} />
              </h2>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <Stat label="Hawaii male terminal" value={formatMeters(TERMINAL_REMEASUREMENT_SIZE_M.male)} />
                <Stat label="Hawaii female terminal" value={formatMeters(TERMINAL_REMEASUREMENT_SIZE_M.female)} />
                <Stat label="Birth size" value={formatMeters(DEFAULT_BIOPSY_AGE_PARAMETERS.birthSizeM)} />
                <Stat label="Observed Hawaii growth" value="0.04 m/yr" />
              </div>
              <p className="mt-2 text-xs text-slate-600">
                Nozu et al. 2017 remains useful captive literature context, but this exploratory page now emphasizes Hawaii field terminal-size and growth signals for regional age-ranking assumptions.
              </p>
            </CardContent>
          </Card>

          <GrowthTrendPanel trend={exploration.growthTrend} />

          <RemeasurementPanel
            analysis={exploration.remeasurementAnalysis}
            threshold={remeasurementThreshold}
            onThresholdChange={(value) => updateActiveTab({ remeasurementThreshold: value })}
          />

          <section className="rounded-md border bg-white">
            <div className="border-b px-3 py-2">
              <h2 className="font-semibold">Catalog growth intervals</h2>
              <p className="text-sm text-muted-foreground">
                Growth rates are calculated from positive size changes between dated observations before terminal size.
              </p>
            </div>
            <div className="max-h-[70vh] overflow-auto">
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
                  {loading ? (
                    <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">Loading size histories...</td></tr>
                  ) : exploration.catalogRows.length === 0 ? (
                    <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">No repeated dated size records available.</td></tr>
                  ) : (
                    exploration.catalogRows.map((row) => (
                      <tr key={row.catalogId} className="border-t">
                        <td className="px-3 py-2">{row.catalogId}</td>
                        <td className="px-3 py-2">{row.name ?? "-"}</td>
                        <td className="px-3 py-2">{row.gender ?? "-"}</td>
                        <td className="px-3 py-2">{formatMeters(row.firstSizeM)}</td>
                        <td className="px-3 py-2">{formatMeters(row.maxSizeM)}</td>
                        <td className="px-3 py-2">{row.firstDate ?? "-"}</td>
                        <td className="px-3 py-2">{row.lastDate ?? "-"}</td>
                        <td className="px-3 py-2">{row.observations}</td>
                        <td className="px-3 py-2">{row.intervalCount}</td>
                        <td className="px-3 py-2">{formatMPerYear(row.medianGrowthCmPerYear)}</td>
                        <td className="px-3 py-2">{row.terminalCandidate ? "Yes" : "No"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </Layout>
  );
}

function buildGrowthExploration({
  catalogs,
  mantas,
  sightings,
  sizes,
  population,
  excludeTerminalMeasurements,
  remeasurementThreshold,
}: {
  catalogs: ResearchCatalogRow[];
  mantas: ResearchMantaRow[];
  sightings: ResearchSightingRow[];
  sizes: ResearchSizeRow[];
  population: PopulationFilter;
  excludeTerminalMeasurements: boolean;
  remeasurementThreshold: number;
}) {
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
    const catalog = catalogById.get(catalogId);
    const observationPopulation = populationFromIsland(sighting?.island);
    sizeValuesFromManta(manta).forEach((sizeM) => {
      observations.push({ catalogId, name: cleanText(catalog?.name ?? manta.name), gender: normalizeGender(manta.gender ?? catalog?.last_gender), date, sizeM, population: observationPopulation });
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
    const sighting = toNumber(manta?.fk_sighting_id) == null ? undefined : sightingById.get(toNumber(manta?.fk_sighting_id));
    observations.push({ catalogId, name: cleanText(catalog?.name ?? manta?.name), gender: normalizeGender(manta?.gender ?? catalog?.last_gender), date, sizeM, population: populationFromIsland(sighting?.island) });
  });

  const filteredObservations = population === "all" ? observations : observations.filter((row) => row.population === population);
  const grouped = groupBy(filteredObservations, (row) => row.catalogId);
  const catalogRows = Array.from(grouped.entries()).map(([catalogId, rawRows]) => {
    const dedupedRows = dedupeByDate(rawRows).sort((a, b) => a.date.localeCompare(b.date));
    const gender = dedupedRows.find((row) => row.gender)?.gender ?? null;
    const rows = excludeTerminalMeasurements ? removeAfterTerminalReached(dedupedRows, gender) : dedupedRows;
    const terminalSize = terminalSizeForGender(gender);
    const intervals = growthIntervals(rows, terminalSize, catalogId, gender);
    const sizeValues = rows.map((row) => row.sizeM);
    return {
      catalogId,
      name: rows[0]?.name ?? null,
      gender,
      firstDate: rows[0]?.date ?? null,
      lastDate: rows[rows.length - 1]?.date ?? null,
      firstSizeM: rows[0]?.sizeM ?? null,
      maxSizeM: max(sizeValues),
      observations: rows.length,
      intervalCount: intervals.length,
      medianGrowthCmPerYear: median(intervals.map((row) => row.growthMPerYear * 100)),
      terminalCandidate: terminalSize != null && max(sizeValues) != null ? (max(sizeValues) as number) >= terminalSize * 0.97 : false,
    };
  }).filter((row) => row.observations >= 1).sort((a, b) => String(a.gender ?? "").localeCompare(String(b.gender ?? "")) || (b.maxSizeM ?? 0) - (a.maxSizeM ?? 0));

  const allIntervals = Array.from(grouped.entries()).flatMap(([catalogId, rawRows]) => {
    const dedupedRows = dedupeByDate(rawRows).sort((a, b) => a.date.localeCompare(b.date));
    const gender = dedupedRows.find((row) => row.gender)?.gender ?? null;
    const rows = excludeTerminalMeasurements ? removeAfterTerminalReached(dedupedRows, gender) : dedupedRows;
    const terminalSize = terminalSizeForGender(gender);
    return growthIntervals(rows, terminalSize, catalogId, gender);
  });
  const growthTrend = buildGrowthTrend(allIntervals);
  const remeasurementAnalysis = buildRemeasurementAnalysis(grouped, remeasurementThreshold, excludeTerminalMeasurements);

  const summaries: GrowthSummary[] = (["male", "female"] as const).map((gender) => {
    const rows = catalogRows.filter((row) => row.gender === gender);
    const maxSizes = rows.map((row) => row.maxSizeM).filter((value): value is number => value != null);
    const growthRates = rows.map((row) => row.medianGrowthCmPerYear).filter((value): value is number => value != null && value > 0 && value < 80);
    return {
      gender,
      individuals: rows.length,
      observations: rows.reduce((sum, row) => sum + row.observations, 0),
      medianMaxSizeM: median(maxSizes),
      p90MaxSizeM: percentile(maxSizes, 0.9),
      medianGrowthCmPerYear: median(growthRates),
      suggestedTerminalM: percentile(maxSizes, 0.9),
    };
  });

  return { observations: filteredObservations, catalogRows, summaries, growthTrend, remeasurementAnalysis };
}

const defaultsInfoText = `Working priors for the biopsy age-ranking model. The exploratory Hawaii field defaults on this page use the current empirical P90 maximum sizes from the filtered Hawaii size histories: male 3.02 m DW and female 3.54 m DW. The observed Hawaii repeated-measurement growth signal is about 0.04 m/yr for the Maui Nui filter, with weak evidence for size-dependent slowing in the available field data. Literature context: Nozu et al. 2017 followed one captive male Mobula alfredi at Okinawa Churaumi Aquarium from birth for 7 years; he was 1.82 m DW at birth, exceeded 3.00 m by 2.5 years, remained around 3.45 m later in the study, showed maturation signs around 2.5-3 years, and reached full sexual maturity by about 5 years 11 months. That captive Okinawa record supports biological plausibility but may overstate wild Hawaii growth because captivity and regional size structure can differ.`;
const remeasurementInfoText = `Median signed change is the median interval-by-interval annual size change, including negative values when a later measurement is smaller than an earlier one. Median positive growth uses only intervals where size increased, so it better reflects apparent biological growth but can overstate growth if noisy negative intervals are excluded. Median within-manta IQR is the typical middle-50% spread of interval growth rates within each repeatedly measured individual; higher values mean growth estimates bounce around more. Negative intervals is the share of intervals with apparent shrinkage, which is usually measurement/calibration noise rather than true biology. Size-bin summaries assign each interval by its starting size and use sex-specific bins.`;
const growthTrendInfoText = `Intervals are independent positive size-change intervals between two dated measurements for the same manta, after same-day measurements are collapsed to one median size. Each point in the scatter plot is one interval, not one individual. The bin table groups intervals by starting size, so the Intervals column is the sample size for that size band. The regression line is exploratory; low R2 means starting size explains little of the observed variation.`;
const thresholdInfoText = `The active threshold is the minimum number of independent dated measurements a catalog manta must have to appear in the Remeasured mantas panel. Raising it keeps only strongly remeasured individuals; lowering it increases sample size but admits weaker individual histories.`;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border bg-white px-2 py-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}


function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-600" tabIndex={0} aria-label={text}>
      i
      <span className="pointer-events-none absolute left-0 top-7 z-20 hidden w-[34rem] max-w-[80vw] rounded-md border bg-white p-3 text-left text-xs font-normal leading-relaxed text-slate-700 shadow-lg group-hover:block group-focus:block">
        {text}
        <span className="mt-2 block text-slate-500">
          Citations/source notes: {BIOPSY_AGE_CITATIONS.map((citation) => citation.label).join("; ")}.
        </span>
      </span>
    </span>
  );
}

function GrowthTrendPanel({ trend }: { trend: GrowthTrend }) {
  const enoughForRegression = trend.intervals.length >= 8 && trend.slopeMPerYearPerM != null && trend.interceptMPerYear != null;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              Growth rate by starting size
              <PlainInfoTip text={growthTrendInfoText} />
            </h2>
            <p className="text-sm text-muted-foreground">
              Positive pre-terminal growth intervals plotted as m/yr. The regression is exploratory and should be interpreted after checking measurement quality.
            </p>
          </div>
          <div className="rounded border bg-white px-3 py-2 text-sm">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              Intervals
              <PlainInfoTip text="Number of positive size-change intervals used in this graph. This is interval sample size, not number of individual mantas." />
            </div>
            <div className="font-medium tabular-nums">{trend.intervals.length}</div>
          </div>
        </div>
        {trend.intervals.length >= 3 ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <GrowthScatter trend={trend} />
            <div>
              <div className="rounded-md border bg-slate-50 p-3 text-sm">
                <div className="font-medium">Regression</div>
                {enoughForRegression ? (
                  <div className="mt-1 text-slate-700">
                    growth = {formatSigned(trend.slopeMPerYearPerM)} m/yr per 1 m starting size; R2 {formatNumber(trend.r2, 2)}.
                  </div>
                ) : (
                  <div className="mt-1 text-slate-600">Not enough interval data for a useful line. Review the size-bin medians instead.</div>
                )}
              </div>
              <div className="mt-3 grid gap-3">
                {(["male", "female"] as const).map((gender) => (
                  <table key={gender} className="w-full text-sm">
                    <thead className="bg-slate-100 text-left">
                      <tr><th className="px-2 py-2 capitalize" colSpan={3}>{gender}</th></tr>
                      <tr><th className="px-2 py-2">Start size</th><th className="px-2 py-2">Intervals</th><th className="px-2 py-2">Median growth</th></tr>
                    </thead>
                    <tbody>
                      {trend.bins.filter((bin) => bin.gender === gender).map((bin) => (
                        <tr key={`${bin.gender}-${bin.label}`} className="border-t">
                          <td className="px-2 py-2">{bin.label}</td>
                          <td className="px-2 py-2">{bin.intervals}</td>
                          <td className="px-2 py-2">{formatMetersPerYear(bin.medianGrowthMPerYear)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Fewer than three positive pre-terminal intervals are available for this filter, so a growth-rate chart would not be meaningful.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RemeasurementPanel({
  analysis,
  threshold,
  onThresholdChange,
}: {
  analysis: RemeasurementAnalysis;
  threshold: number;
  onThresholdChange: (value: number) => void;
}) {
  const topRows = analysis.mantas.slice(0, 18);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              Remeasured mantas
              <PlainInfoTip text={remeasurementInfoText} />
            </h2>
            <p className="text-sm text-muted-foreground">
              Independent measurements are unique dated size estimates per catalog animal. Change the active threshold here to recalculate the minimum number of dates.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Stat label="10+ date mantas" value={analysis.threshold10Count} />
            <Stat label="5+ date mantas" value={analysis.threshold5Count} />
            <div className="rounded border bg-white px-2 py-1">
              <label className="flex items-center gap-1 text-xs text-muted-foreground" htmlFor="remeasurement-threshold-panel">
                Active threshold
                <PlainInfoTip text={thresholdInfoText} />
              </label>
              <input
                id="remeasurement-threshold-panel"
                type="number"
                min={2}
                max={30}
                className="mt-0.5 w-full bg-transparent font-medium tabular-nums outline-none"
                value={threshold}
                onChange={(event) => onThresholdChange(clampInt(event.target.value, 2, 30))}
              />
            </div>
            <div className="rounded border bg-white px-2 py-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                Intervals
                <PlainInfoTip text="Number of signed remeasurement intervals among mantas that meet the active threshold. This includes positive and negative apparent changes." />
              </div>
              <div className="font-medium tabular-nums">{analysis.intervals.length}</div>
            </div>
          </div>
        </div>
        {analysis.mantas.length ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <Stat label="Median signed change" value={formatMetersPerYear(analysis.medianSignedGrowthMPerYear)} />
              <Stat label="Median positive growth" value={formatMetersPerYear(analysis.medianPositiveGrowthMPerYear)} />
              <Stat label="Median within-manta IQR" value={formatMetersPerYear(analysis.medianWithinMantaIqrMPerYear)} />
              <Stat label="Negative intervals" value={formatPercent(analysis.negativeIntervalPercent)} />
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Signed change includes apparent shrinkage, so a high negative-interval share or wide within-manta IQR points to measurement noise. Uniform biological growth would show similar positive rates within each individual and low interval-to-interval spread.
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {(["male", "female"] as const).map((gender) => (
                <div key={gender} className="rounded-md border">
                  <div className="border-b bg-slate-50 px-3 py-2 font-medium capitalize">{gender} starting-size intervals</div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-left">
                      <tr>
                        <th className="px-2 py-2">Start size</th>
                        <th className="px-2 py-2">Intervals</th>
                        <th className="px-2 py-2">Median signed</th>
                        <th className="px-2 py-2">Median positive</th>
                        <th className="px-2 py-2">Negative</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.sizeBins.filter((bin) => bin.gender === gender).map((bin) => (
                        <tr key={`${bin.gender}-${bin.label}`} className="border-t">
                          <td className="px-2 py-2">{bin.label}</td>
                          <td className="px-2 py-2">{bin.intervals}</td>
                          <td className="px-2 py-2">{formatMetersPerYear(bin.medianSignedGrowthMPerYear)}</td>
                          <td className="px-2 py-2">{formatMetersPerYear(bin.medianPositiveGrowthMPerYear)}</td>
                          <td className="px-2 py-2">{formatPercent(bin.negativeIntervalPercent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            <div className="mt-4 overflow-auto">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="bg-slate-100 text-left">
                  <tr>
                    <th className="px-2 py-2">Catalog</th>
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2">Gender</th>
                    <th className="px-2 py-2">Dates</th>
                    <th className="px-2 py-2">Span</th>
                    <th className="px-2 py-2">Intervals</th>
                    <th className="px-2 py-2">Negative</th>
                    <th className="px-2 py-2">Median signed</th>
                    <th className="px-2 py-2">Median positive</th>
                    <th className="px-2 py-2">Within IQR</th>
                    <th className="px-2 py-2">Sequence trend</th>
                  </tr>
                </thead>
                <tbody>
                  {topRows.map((row) => (
                    <tr key={row.catalogId} className="border-t">
                      <td className="px-2 py-2">{row.catalogId}</td>
                      <td className="px-2 py-2">{row.name ?? "-"}</td>
                      <td className="px-2 py-2">{row.gender ?? "-"}</td>
                      <td className="px-2 py-2">{row.observations}</td>
                      <td className="px-2 py-2">{formatYears(row.yearsObserved)}</td>
                      <td className="px-2 py-2">{row.intervals.length}</td>
                      <td className="px-2 py-2">{row.negativeIntervals.length}</td>
                      <td className="px-2 py-2">{formatMetersPerYear(row.medianSignedGrowthMPerYear)}</td>
                      <td className="px-2 py-2">{formatMetersPerYear(row.medianPositiveGrowthMPerYear)}</td>
                      <td className="px-2 py-2">{formatMetersPerYear(row.intervalIqrMPerYear)}</td>
                      <td className="px-2 py-2">
                        {row.intervalSlopeMPerYearPerInterval == null ? "-" : `${formatSigned(row.intervalSlopeMPerYearPerInterval)} m/yr per interval; R2 ${formatNumber(row.intervalR2, 2)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No mantas meet the active independent-measurement threshold for this population filter.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GrowthScatter({ trend }: { trend: GrowthTrend }) {
  const width = 620;
  const height = 300;
  const pad = 38;
  const xs = trend.intervals.map((row) => row.startSizeM);
  const ys = trend.intervals.map((row) => row.growthMPerYear);
  const minX = Math.min(...xs, 1.5);
  const maxX = Math.max(...xs, 4.0);
  const maxY = Math.max(...ys, 0.25);
  const sx = (value: number) => pad + ((value - minX) / Math.max(0.01, maxX - minX)) * (width - pad * 1.5);
  const sy = (value: number) => height - pad - (value / Math.max(0.01, maxY)) * (height - pad * 1.5);
  const lineY1 = trend.interceptMPerYear != null && trend.slopeMPerYearPerM != null ? trend.interceptMPerYear + trend.slopeMPerYearPerM * minX : null;
  const lineY2 = trend.interceptMPerYear != null && trend.slopeMPerYearPerM != null ? trend.interceptMPerYear + trend.slopeMPerYearPerM * maxX : null;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[300px] w-full rounded-md border bg-white" role="img" aria-label="Growth rate by starting size scatter plot">
      <line x1={pad} y1={height - pad} x2={width - pad / 2} y2={height - pad} stroke="#94a3b8" />
      <line x1={pad} y1={pad / 2} x2={pad} y2={height - pad} stroke="#94a3b8" />
      <text x={width / 2} y={height - 8} textAnchor="middle" className="fill-slate-600 text-[11px]">Starting size (m)</text>
      <text x={12} y={height / 2} transform={`rotate(-90 12 ${height / 2})`} textAnchor="middle" className="fill-slate-600 text-[11px]">Growth (m/yr)</text>
      {trend.intervals.map((row, index) => (
        <circle key={`${row.catalogId}-${index}`} cx={sx(row.startSizeM)} cy={sy(row.growthMPerYear)} r={3} className={row.gender === "female" ? "fill-rose-500/70" : "fill-blue-600/70"} />
      ))}
      {lineY1 != null && lineY2 != null ? <line x1={sx(minX)} y1={sy(lineY1)} x2={sx(maxX)} y2={sy(lineY2)} stroke="#111827" strokeWidth={2} /> : null}
    </svg>
  );
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

async function loadAgeGrowthData(): Promise<AgeGrowthData> {
  if (ageGrowthDataCache) {
    ageGrowthLastCacheSource = "memory cache";
    return ageGrowthDataCache;
  }
  if (ageGrowthDataPromise) {
    ageGrowthLastCacheSource = "active load";
    return ageGrowthDataPromise;
  }
  const cached = await readCachedAgeGrowthData();
  if (cached) {
    ageGrowthDataCache = cached;
    return cached;
  }
  ageGrowthDataPromise = fetchAgeGrowthData().then((data) => {
    ageGrowthDataCache = data;
    ageGrowthLastCacheSource = "network";
    writeCachedAgeGrowthData(data);
    return data;
  }).finally(() => {
    ageGrowthDataPromise = null;
  });
  return ageGrowthDataPromise;
}

async function fetchAgeGrowthData(): Promise<AgeGrowthData> {
  const [catalogRows, mantaRows] = await Promise.all([
    selectAll<ResearchCatalogRow>("catalog", "pk_catalog_id,name,last_gender", "pk_catalog_id"),
    selectAll<ResearchMantaRow>(
      "mantas",
      "pk_manta_id,fk_catalog_id,fk_sighting_id,gender,size_m,estimated_size_m,jon_size_m,size_disc_width_m,size_dw_m,name,sighting_date",
      "pk_manta_id",
    ),
  ]);
  const sightingIds = uniq(mantaRows.map((row) => row.fk_sighting_id));
  const mantaIds = uniq(mantaRows.map((row) => row.pk_manta_id));
  const [sightingRows, sizeRows] = await Promise.all([
    selectIn<ResearchSightingRow>("sightings", "pk_sighting_id,sighting_date,island", "pk_sighting_id", sightingIds, "pk_sighting_id"),
    selectIn<ResearchSizeRow>(
      "manta_sizes",
      "pk_manta_size_id,fk_manta_id,measurement_type,size_m,measured_on,calibration_params,src_file",
      "fk_manta_id",
      mantaIds,
      "pk_manta_size_id",
    ),
  ]);
  return { catalogs: catalogRows, mantas: mantaRows, sightings: sightingRows, sizes: sizeRows };
}

async function readCachedAgeGrowthData() {
  const indexedDbCache = await readIndexedAgeGrowthData();
  if (indexedDbCache) {
    ageGrowthLastCacheSource = "IndexedDB cache";
    return indexedDbCache;
  }
  const sessionCache = readSessionAgeGrowthData();
  if (sessionCache) {
    ageGrowthLastCacheSource = "session cache";
    return sessionCache;
  }
  return null;
}

function writeCachedAgeGrowthData(data: AgeGrowthData) {
  void writeIndexedAgeGrowthData(data);
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, cachedAt: Date.now() }));
  } catch {
    // Browsers can reject large sessionStorage writes. IndexedDB and the module cache still keep this page fast.
  }
}

function readSessionAgeGrowthData() {
  try {
    const cached = window.sessionStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as AgeGrowthData & { cachedAt?: number };
    return validAgeGrowthData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function readIndexedAgeGrowthData() {
  try {
    const db = await openAgeGrowthDb();
    return await new Promise<AgeGrowthData | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const request = tx.objectStore(IDB_STORE).get(CACHE_KEY);
      request.onsuccess = () => {
        const row = request.result as { data?: AgeGrowthData } | undefined;
        resolve(row?.data && validAgeGrowthData(row.data) ? row.data : null);
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeIndexedAgeGrowthData(data: AgeGrowthData) {
  try {
    const db = await openAgeGrowthDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put({ key: CACHE_KEY, data, cachedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Cache writes are best-effort only.
  }
}

function openAgeGrowthDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function validAgeGrowthData(value: AgeGrowthData | null | undefined) {
  return Boolean(value?.catalogs && value?.mantas && value?.sightings && value?.sizes);
}

async function selectIn<T>(table: string, columns: string, column: string, values: unknown[], orderColumn?: string) {
  const cleanValues = uniq(values);
  if (cleanValues.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < cleanValues.length; i += 80) {
    const chunk = cleanValues.slice(i, i + 80);
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase.from(table).select(columns).in(column, chunk).range(from, from + PAGE_SIZE - 1);
      if (orderColumn) query = query.order(orderColumn, { ascending: true });
      const { data, error } = await query;
      if (error) throw error;
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  return out;
}

function sizeValuesFromManta(manta: ResearchMantaRow) {
  return [toNumber(manta.size_dw_m), toNumber(manta.size_disc_width_m), toNumber(manta.size_m), toNumber(manta.estimated_size_m), toNumber(manta.jon_size_m)]
    .filter((value): value is number => value != null && value > 0.5 && value < 6);
}

function growthIntervals(rows: GrowthObservation[], terminalSize: number | null, catalogId: number, gender: Gender | null) {
  const intervals: GrowthIntervalRow[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const next = rows[i];
    const years = yearsBetween(prev.date, next.date);
    const delta = next.sizeM - prev.sizeM;
    if (years == null || years < 0.25 || delta <= 0) continue;
    if (terminalSize != null && prev.sizeM >= terminalSize * 0.97) continue;
    intervals.push({ catalogId, name: prev.name, gender, startSizeM: prev.sizeM, endSizeM: next.sizeM, growthMPerYear: delta / years, years, startDate: prev.date, endDate: next.date, intervalIndex: i - 1 });
  }
  return intervals;
}

function signedGrowthIntervals(rows: GrowthObservation[], catalogId: number, gender: Gender | null) {
  const intervals: GrowthIntervalRow[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const next = rows[i];
    const years = yearsBetween(prev.date, next.date);
    if (years == null || years < 0.25) continue;
    intervals.push({
      catalogId,
      name: prev.name,
      gender,
      startSizeM: prev.sizeM,
      endSizeM: next.sizeM,
      growthMPerYear: (next.sizeM - prev.sizeM) / years,
      years,
      startDate: prev.date,
      endDate: next.date,
      intervalIndex: i - 1,
      signed: true,
    });
  }
  return intervals;
}

function buildRemeasurementAnalysis(grouped: Map<number, GrowthObservation[]>, threshold: number, excludeTerminalMeasurements: boolean): RemeasurementAnalysis {
  const rows = Array.from(grouped.entries()).map(([catalogId, rawRows]) => {
    const dedupedObservations = dedupeByDate(rawRows).sort((a, b) => a.date.localeCompare(b.date));
    const gender = dedupedObservations.find((row) => row.gender)?.gender ?? null;
    const observations = excludeTerminalMeasurements ? removeAfterTerminalReached(dedupedObservations, gender) : dedupedObservations;
    const intervals = signedGrowthIntervals(observations, catalogId, gender).filter((row) => Math.abs(row.growthMPerYear) < 0.8);
    const regression = linearRegression(intervals.map((row, index) => ({ x: index, y: row.growthMPerYear })));
    return {
      catalogId,
      name: observations[0]?.name ?? null,
      gender,
      observations: observations.length,
      firstDate: observations[0]?.date ?? null,
      lastDate: observations[observations.length - 1]?.date ?? null,
      yearsObserved: observations.length >= 2 ? yearsBetween(observations[0].date, observations[observations.length - 1].date) : null,
      intervals,
      positiveIntervals: intervals.filter((row) => row.growthMPerYear > 0),
      negativeIntervals: intervals.filter((row) => row.growthMPerYear < 0),
      medianSignedGrowthMPerYear: median(intervals.map((row) => row.growthMPerYear)),
      medianPositiveGrowthMPerYear: median(intervals.filter((row) => row.growthMPerYear > 0).map((row) => row.growthMPerYear)),
      intervalIqrMPerYear: iqr(intervals.map((row) => row.growthMPerYear)),
      intervalSlopeMPerYearPerInterval: regression.slope,
      intervalR2: regression.r2,
    };
  });
  const threshold10 = rows.filter((row) => row.observations >= 10);
  const threshold5 = rows.filter((row) => row.observations >= 5);
  const activeRows = rows.filter((row) => row.observations >= threshold)
    .sort((a, b) => b.observations - a.observations || (b.intervals.length - a.intervals.length));
  const intervals = activeRows.flatMap((row) => row.intervals);
  const positiveIntervals = intervals.filter((row) => row.growthMPerYear > 0);
  const negativeIntervals = intervals.filter((row) => row.growthMPerYear < 0);
  return {
    threshold,
    threshold10Count: threshold10.length,
    threshold5Count: threshold5.length,
    mantas: activeRows,
    intervals,
    medianSignedGrowthMPerYear: median(intervals.map((row) => row.growthMPerYear)),
    medianPositiveGrowthMPerYear: median(positiveIntervals.map((row) => row.growthMPerYear)),
    medianWithinMantaIqrMPerYear: median(activeRows.map((row) => row.intervalIqrMPerYear).filter((value): value is number => value != null)),
    negativeIntervalPercent: intervals.length ? (negativeIntervals.length / intervals.length) * 100 : null,
    sizeBins: buildRemeasurementSizeBins(intervals),
  };
}

const remeasurementBins: Array<{ gender: Gender; label: string; minM: number; maxM: number }> = [
  { gender: "male", label: "1.60-2.40 m", minM: 1.6, maxM: 2.400001 },
  { gender: "male", label: "2.41-2.60 m", minM: 2.400001, maxM: 2.600001 },
  { gender: "male", label: "2.61-2.80 m", minM: 2.600001, maxM: 2.800001 },
  { gender: "male", label: "2.81-3.10 m", minM: 2.800001, maxM: 3.100001 },
  { gender: "female", label: "1.60-2.40 m", minM: 1.6, maxM: 2.400001 },
  { gender: "female", label: "2.41-3.00 m", minM: 2.400001, maxM: 3.000001 },
  { gender: "female", label: "3.01-3.40 m", minM: 3.000001, maxM: 3.400001 },
  { gender: "female", label: "3.41-3.60 m", minM: 3.400001, maxM: 3.600001 },
];

const growthTrendBins: Array<{ gender: Gender; label: string; minM: number; maxM: number }> = [
  { gender: "male", label: "1.60-2.40 m", minM: 1.6, maxM: 2.400001 },
  { gender: "male", label: "2.41-2.70 m", minM: 2.400001, maxM: 2.700001 },
  { gender: "male", label: "2.71-3.02 m", minM: 2.700001, maxM: 3.020001 },
  { gender: "female", label: "1.60-2.40 m", minM: 1.6, maxM: 2.400001 },
  { gender: "female", label: "2.41-3.40 m", minM: 2.400001, maxM: 3.400001 },
  { gender: "female", label: "3.41-3.54 m", minM: 3.400001, maxM: 3.540001 },
];

function buildRemeasurementSizeBins(intervals: GrowthIntervalRow[]): RemeasurementSizeBin[] {
  return remeasurementBins.map((bin) => {
    const rows = intervals.filter((row) => row.gender === bin.gender && row.startSizeM >= bin.minM && row.startSizeM < bin.maxM);
    const positiveRows = rows.filter((row) => row.growthMPerYear > 0);
    const negativeRows = rows.filter((row) => row.growthMPerYear < 0);
    return {
      ...bin,
      intervals: rows.length,
      positiveIntervals: positiveRows.length,
      negativeIntervals: negativeRows.length,
      medianSignedGrowthMPerYear: median(rows.map((row) => row.growthMPerYear)),
      medianPositiveGrowthMPerYear: median(positiveRows.map((row) => row.growthMPerYear)),
      negativeIntervalPercent: rows.length ? (negativeRows.length / rows.length) * 100 : null,
    };
  });
}


function buildGrowthTrend(intervals: GrowthIntervalRow[]): GrowthTrend {
  const usable = intervals.filter((row) => row.growthMPerYear > 0 && row.growthMPerYear < 0.8);
  const bins = growthTrendBins.map((bin) => {
    const rows = usable.filter((row) => row.gender === bin.gender && row.startSizeM >= bin.minM && row.startSizeM < bin.maxM);
    return { ...bin, intervals: rows.length, medianGrowthMPerYear: median(rows.map((row) => row.growthMPerYear)) };
  });
  const regression = linearRegression(usable.map((row) => ({ x: row.startSizeM, y: row.growthMPerYear })));
  return { intervals: usable, bins, slopeMPerYearPerM: regression.slope, interceptMPerYear: regression.intercept, r2: regression.r2 };
}

function linearRegression(points: Array<{ x: number; y: number }>) {
  if (points.length < 3) return { slope: null, intercept: null, r2: null };
  const meanX = mean(points.map((point) => point.x));
  const meanY = mean(points.map((point) => point.y));
  if (meanX == null || meanY == null) return { slope: null, intercept: null, r2: null };
  const ssX = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  if (ssX === 0) return { slope: null, intercept: null, r2: null };
  const slope = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / ssX;
  const intercept = meanY - slope * meanX;
  const ssTotal = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
  const ssResidual = points.reduce((sum, point) => sum + (point.y - (intercept + slope * point.x)) ** 2, 0);
  return { slope, intercept, r2: ssTotal > 0 ? 1 - ssResidual / ssTotal : null };
}

function dedupeByDate(rows: GrowthObservation[]) {
  const grouped = groupBy(rows, (row) => row.date);
  return Array.from(grouped.entries()).map(([date, dateRows]) => {
    const middle = dateRows[Math.floor(dateRows.length / 2)];
    return { ...middle, date, sizeM: median(dateRows.map((row) => row.sizeM)) ?? middle.sizeM };
  });
}

function removeAfterTerminalReached(rows: GrowthObservation[], gender: Gender | null) {
  if (!gender) return rows;
  const terminalSize = terminalSizeForGender(gender);
  const out: GrowthObservation[] = [];
  for (const row of rows) {
    if (row.sizeM >= terminalSize) break;
    out.push(row);
  }
  return out;
}

function terminalSizeForGender(gender: Gender | null) {
  return gender ? TERMINAL_REMEASUREMENT_SIZE_M[gender] : null;
}

function groupBy<T, K>(rows: T[], getKey: (row: T) => K) {
  const out = new Map<K, T[]>();
  rows.forEach((row) => out.set(getKey(row), [...(out.get(getKey(row)) ?? []), row]));
  return out;
}

function uniq(values: unknown[]) {
  return Array.from(new Set(values.filter((value) => value != null && value !== "").map((value) => Number.isFinite(Number(value)) ? Number(value) : String(value))));
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function populationLabel(value: PopulationFilter) {
  switch (value) {
    case "big-island": return "Big Island";
    case "maui-nui": return "Maui Nui";
    case "oahu": return "Oahu";
    case "kauai": return "Kauai";
    default: return "All populations";
  }
}

function firstUnusedPopulation(used: PopulationFilter[]) {
  return (["all", "big-island", "maui-nui", "oahu", "kauai"] as const).find((value) => !used.includes(value));
}

function clampInt(value: unknown, min: number, max: number) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
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


function populationFromIsland(value: unknown): PopulationFilter | "unknown" {
  const text = String(value ?? "").toLowerCase();
  if (/hawai|big/.test(text)) return "big-island";
  if (/maui|molokai|moloka|lanai|lana/.test(text)) return "maui-nui";
  if (/oahu|o.ahu/.test(text)) return "oahu";
  if (/kauai|kaua/.test(text)) return "kauai";
  return "unknown";
}

function normalizeGender(value: unknown): Gender | null {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "m" || text === "male") return "male";
  if (text === "f" || text === "female") return "female";
  return null;
}

function yearsBetween(a: string, b: string) {
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(diff) ? diff / 86400000 / 365.25 : null;
}

function mean(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

function iqr(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (clean.length < 4) return null;
  const q1 = percentile(clean, 0.25);
  const q3 = percentile(clean, 0.75);
  return q1 == null || q3 == null ? null : q3 - q1;
}

function max(values: number[]) {
  return values.length ? Math.max(...values) : null;
}

function formatMeters(value: number | null | undefined) {
  return value == null ? "-" : `${value.toFixed(2)} m`;
}

function formatCmPerYear(value: number | null | undefined) {
  return value == null ? "-" : `${value.toFixed(1)} cm/yr`;
}

function formatMPerYear(valueCmPerYear: number | null | undefined) {
  return valueCmPerYear == null ? "-" : `${(valueCmPerYear / 100).toFixed(2)} m/yr`;
}

function formatMetersPerYear(value: number | null | undefined) {
  return value == null ? "-" : `${value.toFixed(2)} m/yr`;
}

function formatNumber(value: number | null | undefined, digits: number) {
  return value == null ? "-" : value.toFixed(digits);
}

function formatYears(value: number | null | undefined) {
  return value == null ? "-" : `${value.toFixed(1)} yr`;
}

function formatPercent(value: number | null | undefined) {
  return value == null ? "-" : `${value.toFixed(1)}%`;
}

function formatSigned(value: number | null | undefined) {
  if (value == null) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

function PlainInfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-600" tabIndex={0} aria-label={text}>
      i
      <span className="pointer-events-none absolute left-0 top-7 z-20 hidden w-[34rem] max-w-[80vw] rounded-md border bg-white p-3 text-left text-xs font-normal leading-relaxed text-slate-700 shadow-lg group-hover:block group-focus:block">
        {text}
      </span>
    </span>
  );
}
