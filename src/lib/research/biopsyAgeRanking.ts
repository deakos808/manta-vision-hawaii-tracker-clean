import { dwM, sizeMeasurementIncludedInMean, sizeMeasurementUsable } from "@/utils/sizeMeasurements";

export const AGE_RANK_AS_OF_DATE = "2024-01-01";

export type BiopsyAgeParameters = {
  maleMaturitySizeM: number;
  femaleMaturitySizeM: number;
  maleMaturityAgeYears: number;
  femaleMaturityAgeYears: number;
  maleTerminalSizeM: number;
  femaleTerminalSizeM: number;
  birthSizeM: number;
  juvenileGrowthRateMPerYear: number;
  includeLifeHistoryEvidence: boolean;
  includePupEvidence: boolean;
  includeAgeClassEvidence: boolean;
  includeSizeEvidence: boolean;
  includeMprfAgeClassEvidence: boolean;
  includeFifteenYearHistory: boolean;
  treatPupAsBirthAnchor: boolean;
  includeAssumptionAgeBounds: boolean;
  applySizeMaturityAssumptions: boolean;
  applyAgeClassMaturityAssumptions: boolean;
  applyMprfAgeClassMaturityAssumptions: boolean;
};

export const DEFAULT_BIOPSY_AGE_PARAMETERS: BiopsyAgeParameters = {
  maleMaturitySizeM: 2.8,
  femaleMaturitySizeM: 3.37,
  maleMaturityAgeYears: 6.5,
  femaleMaturityAgeYears: 11.5,
  maleTerminalSizeM: 3.03,
  femaleTerminalSizeM: 3.64,
  birthSizeM: 1.6,
  juvenileGrowthRateMPerYear: 0.3,
  includeLifeHistoryEvidence: true,
  includePupEvidence: false,
  includeAgeClassEvidence: false,
  includeSizeEvidence: false,
  includeMprfAgeClassEvidence: false,
  includeFifteenYearHistory: true,
  treatPupAsBirthAnchor: false,
  includeAssumptionAgeBounds: false,
  applySizeMaturityAssumptions: false,
  applyAgeClassMaturityAssumptions: false,
  applyMprfAgeClassMaturityAssumptions: false,
};

export const MODEL_1_BASELINE_BIOPSY_AGE_PARAMETERS: BiopsyAgeParameters = {
  ...DEFAULT_BIOPSY_AGE_PARAMETERS,
  includeLifeHistoryEvidence: true,
  includePupEvidence: false,
  includeAgeClassEvidence: false,
  includeSizeEvidence: false,
  includeMprfAgeClassEvidence: false,
  treatPupAsBirthAnchor: false,
  applySizeMaturityAssumptions: false,
  applyAgeClassMaturityAssumptions: false,
  applyMprfAgeClassMaturityAssumptions: false,
};

export const BIOPSY_AGE_CITATIONS = [
  {
    label: "Hawaii M. alfredi maturity review",
    detail:
      "SciSpace Age Ranking Mantas Lit Review, July 3 2026: supports Hawaiian adult thresholds around male >=2.8 m DW and female >=3.37 m DW; reports literature-supported maturity-age ranges of approximately male 5-8 years and female 8-15 years for this exploratory framework, neonates around 1.5-1.82 m DW, and inferred wild growth around 0.09-0.38 m/year.",
  },
  {
    label: "Deakos Hawaii life-history sources",
    detail:
      "Deakos 2010, Deakos 2011, and Deakos Manta Repro 2012 provide the Hawaii-specific size, maturity, reproductive, and near-term fetal context used to justify the maturity-size thresholds, terminal-size benchmarks, and conservative birth-size assumptions.",
  },
  {
    label: "Birth-size and growth caution",
    detail:
      "The 1.6 m birth-size default is a conservative lower-bound sensitivity input informed by Okinawa captive M. alfredi birth observations, Deakos reproductive/near-term fetus context, and small juvenile/nursery-area measurements. Growth rate is exploratory only and is not used in the primary age-ranking decision tree.",
  },
  {
    label: "Evidence-bounds interval framework",
    detail:
      "Manta Age Interval Framework, July 2026: recommends default ranking by fixed-date minimum plausible age, using observed sightings as hard bounds and keeping maturity-age or growth extrapolation as explicit assumption/sensitivity mode.",
  },
  {
    label: "CKMR plausibility synthesis",
    detail:
      "SciSpace Elasmo Age Ranking Lit Review, July 2026: recommends sex-specific maturity priors and birth-year uncertainty when validating parent-offspring and sibling hypotheses.",
  },
  {
    label: "Existing project model",
    detail:
      "scripts/analysis/kona_age_rank_models.mjs used male >=2.8 m, male <2.7 m immature, female >=3.37 m, and 15-year sighting-history maturity evidence.",
  },
];

export const BIOPSY_FIELD_MAPPING = [
  ["pk_biopsy_id", "biopsies.pk_biopsy_id plus age view", "observed"],
  ["MPRF biopsy id", "kona_biopsy_age_rank_view_v3.mprf_biopsy_id; fallback biopsies.lab_id/raw_sample_id", "display"],
  ["Jonathan sequence id", "kona_biopsy_age_rank_view_v3.jonathan_sample_id; fallback biopsies.raw_sample_id", "display"],
  ["Name", "catalog.name or age view HAMER/MPRF names", "observed"],
  ["Island", "biopsy sighting island, fallback biopsies.island", "observed"],
  ["gender", "biopsy-linked mantas.gender; fallback catalog.last_gender or age view gender", "observed"],
  ["age class when biopsied", "biopsy-linked mantas.age_class", "observed"],
  ["age class on first sighting", "earliest dated manta age_class; fallback catalog.MPRF_age_class_at_first_sighting", "observed"],
  ["Total Sightings", "catalog.total_sightings or unique related manta sighting count", "observed"],
  ["Total Sightings prior to the biopsy", "unique related manta sightings dated before biopsy date", "derived count"],
  ["Total years observed", "catalog.count_unique_years_sighted or unique related sighting years; MPRF pre-2010 histories are flagged as minimums when dated sightings are incomplete", "observed/derived"],
  ["Total years observed prior to the biopsy", "years from earliest known sighting to biopsy; MPRF pre-2010 histories are flagged as minimums when dated sightings are incomplete", "derived count/minimum"],
  ["First sighting as pup", "earliest dated manta age_class is pup or catalog.mprf_pupinitially", "derived flag"],
  ["Age class changed since first sighting", "first age class differs from biopsy/current age class", "derived flag"],
  ["Size at biopsy", "biopsy-linked manta size or size measurement on biopsy date", "observed"],
  ["Nearest size before/after biopsy", "dated manta or manta_sizes size observations nearest to biopsy date", "derived from observations"],
  ["Probable age/birth year based on size", "adjustable sex-specific maturity parameters and size evidence", "model-derived"],
] as const;

export type AgeIntervalCheckpoint = {
  key: "life_history" | "pup_first_sighting" | "age_class" | "size";
  label: string;
  date: string | null;
  minimumAgeYears: number | null;
  maximumAgeYears: number | null;
  reliability: "high" | "medium" | "model";
  detail: string;
  rejectedMaximumAgeYears?: number | null;
  rejectedMaximumReason?: string | null;
};

export type ResearchBiopsyRow = Record<string, unknown> & {
  pk_biopsy_id: number | string;
  fk_catalog_id?: number | string | null;
  fk_manta_id?: number | string | null;
  fk_sighting_id?: number | string | null;
  sample_date?: string | null;
  island?: string | null;
  lab_id?: string | null;
  raw_sample_id?: string | null;
  source?: string | null;
};

export type ResearchCatalogRow = Record<string, unknown> & {
  pk_catalog_id: number | string;
  name?: string | null;
  date_first_sighted?: string | null;
  date_last_sighted?: string | null;
  count_unique_years_sighted?: number | string | null;
  total_sightings?: number | string | null;
  total_sighting_days?: number | string | null;
  years_between_first_last?: number | string | null;
  last_age_class?: string | null;
  last_gender?: string | null;
  last_size_m?: number | string | null;
  MPRF_first_sighted_date?: string | null;
  MPRF_total_years_seen?: number | string | null;
  MPRF_age_class_at_first_sighting?: string | null;
  mprf_date_first_sighted?: string | null;
  is_mprf?: boolean | null;
  mprf_pupinitially?: boolean | string | null;
  mprf_current_maturity?: string | null;
  mprf_size_estimate?: number | string | null;
};

export type ResearchMantaRow = Record<string, unknown> & {
  pk_manta_id: number | string;
  fk_catalog_id?: number | string | null;
  fk_sighting_id?: number | string | null;
  gender?: string | null;
  age_class?: string | null;
  size_m?: number | string | null;
  estimated_size_m?: number | string | null;
  jon_size_m?: number | string | null;
  size_disc_width_m?: number | string | null;
  size_dw_m?: number | string | null;
  is_mprf?: boolean | null;
  name?: string | null;
  pk_mprf_catalog_id?: number | string | null;
  mprf_date?: string | null;
  sighting_date?: string | null;
};

export type ResearchSightingRow = Record<string, unknown> & {
  pk_sighting_id: number | string;
  sighting_date?: string | null;
  island?: string | null;
  is_mprf?: boolean | null;
};

export type ResearchSizeRow = Record<string, unknown> & {
  pk_manta_size_id: number | string;
  fk_manta_id?: number | string | null;
  measured_on?: string | null;
  measurement_type?: string | null;
  size_m?: number | string | null;
  calibration_params?: unknown;
};

export type ResearchRankRow = Record<string, unknown> & {
  pk_biopsy_id?: number | string | null;
  pk_catalog_id?: number | string | null;
  pk_mprf_catalog_id?: number | string | null;
  age_rank_v3?: number | string | null;
  mprf_biopsy_id?: string | null;
  jonathan_sample_id?: string | null;
  hamer_name?: string | null;
  mprf_name?: string | null;
  gender?: string | null;
  effective_first_sighting?: string | null;
  mprf_first_sighting_date?: string | null;
  mprf_total_years_seen?: number | string | null;
  mprf_last_age_class?: string | null;
  total_years_sighted?: number | string | null;
  ever_seen_as_pup?: boolean | string | null;
  age_years_at_biopsy_v3?: number | string | null;
  age_rank_justification_v3?: string | null;
};

export type BiopsyExplorationRow = {
  pkBiopsyId: string;
  mprfBiopsyId: string | null;
  mprfLegacyBiopsyId: string | null;
  jonathanSequenceId: string | null;
  catalogId: number | null;
  mprfCatalogId: number | null;
  mantaId: number | null;
  name: string | null;
  island: string | null;
  gender: string | null;
  ageClassWhenBiopsied: string | null;
  ageClassOnFirstSighting: string | null;
  totalSightings: number | null;
  totalSightingsPriorToBiopsy: number | null;
  totalYearsObserved: number | null;
  totalYearsObservedIsMinimum: boolean;
  totalYearsObservedPriorToBiopsy: number | null;
  totalYearsObservedPriorToBiopsyIsMinimum: boolean;
  observationHistoryNote: string | null;
  firstSightingAsPup: boolean;
  firstSightingDate: string | null;
  ageClassChangedSinceFirstSighting: boolean;
  sizeAtBiopsyM: number | null;
  nearestSizeBeforeBiopsyM: number | null;
  daysBeforeBiopsySize: number | null;
  nearestSizeAfterBiopsyM: number | null;
  daysAfterBiopsySize: number | null;
  totalSizes: number;
  probableAgeBasedOnSize: string | null;
  probableBirthYearBasedOnSize: string | null;
  minimumAgeAsOfYears: number | null;
  maximumAgeAsOfYears: number | null;
  ageIntervalAsOfDate: string;
  ageIntervalWidthYears: number | null;
  ageIntervalCheckpoints: AgeIntervalCheckpoint[];
  ageIntervalSummary: string | null;
  rejectedMaximumAgeNotes: string[];
  ageClassObservationSummary: string[];
  sizeObservationSummary: string[];
  currentRank: number | null;
  exploratoryRank: number | null;
  rankDelta: number | null;
  exploratoryScore: number;
  evidence: string[];
  flags: string[];
  evidenceSources: string[];
};

export function buildBiopsyExplorationRows(input: {
  biopsies: ResearchBiopsyRow[];
  catalogs: ResearchCatalogRow[];
  mantas: ResearchMantaRow[];
  sightings: ResearchSightingRow[];
  sizes: ResearchSizeRow[];
  ranks: ResearchRankRow[];
  parameters: BiopsyAgeParameters;
}) {
  const catalogById = new Map(input.catalogs.map((row) => [num(row.pk_catalog_id), row]));
  const sightingById = new Map(input.sightings.map((row) => [num(row.pk_sighting_id), row]));
  const rankByBiopsyId = new Map(input.ranks.map((row) => [String(row.pk_biopsy_id ?? ""), row]));
  const mantasByCatalog = groupBy(input.mantas, (row) => num(row.fk_catalog_id));
  const sizesByManta = groupBy(input.sizes, (row) => num(row.fk_manta_id));

  const rows = input.biopsies.map((biopsy): BiopsyExplorationRow => {
    const isCatalogAnchor = String(biopsy.pk_biopsy_id).startsWith("catalog-");
    const rank = rankByBiopsyId.get(String(biopsy.pk_biopsy_id)) ?? {};
    const catalogId = num(biopsy.fk_catalog_id ?? rank.pk_catalog_id);
    const mantaId = num(biopsy.fk_manta_id);
    const catalog = catalogId == null ? undefined : catalogById.get(catalogId);
    const relatedMantas = catalogId == null ? [] : mantasByCatalog.get(catalogId) ?? [];
    const mprfCatalogId = num(rank.pk_mprf_catalog_id) ?? firstNumber(relatedMantas.map((row) => num(row.pk_mprf_catalog_id)));
    const biopsyManta = relatedMantas.find((row) => num(row.pk_manta_id) === mantaId);
    const biopsySighting = num(biopsy.fk_sighting_id) == null ? undefined : sightingById.get(num(biopsy.fk_sighting_id));
    const biopsyDate = dateOnly(biopsy.sample_date ?? biopsySighting?.sighting_date ?? null);
    const eventRows = relatedMantas
      .map((manta) => {
        const sighting = num(manta.fk_sighting_id) == null ? undefined : sightingById.get(num(manta.fk_sighting_id));
        return {
          manta,
          sighting,
          date: dateOnly(manta.sighting_date ?? sighting?.sighting_date ?? manta.mprf_date ?? null),
        };
      })
      .filter((event) => event.date);

    const eventsSorted = [...eventRows].sort((a, b) => compareDate(a.date, b.date));
    const firstEvent = eventsSorted[0] ?? null;
    const catalogFirstSightingDate = earliestDate(
      dateOnly(catalog?.date_first_sighted),
      dateOnly(catalog?.MPRF_first_sighted_date),
      dateOnly(catalog?.mprf_date_first_sighted),
      dateOnly(rank.effective_first_sighting),
      dateOnly(rank.mprf_first_sighting_date),
    );
    const firstKnownSightingDate = earliestDate(firstEvent?.date, catalogFirstSightingDate);
    const mprfFirstSightingDate = earliestDate(dateOnly(catalog?.MPRF_first_sighted_date), dateOnly(catalog?.mprf_date_first_sighted));
    const firstDatedAgeClassEvent = eventsSorted.find((event) => cleanText(event.manta.age_class));
    const firstKnownDatedAgeClass =
      firstDatedAgeClassEvent?.date && firstKnownSightingDate && firstDatedAgeClassEvent.date === firstKnownSightingDate
        ? cleanText(firstDatedAgeClassEvent.manta.age_class)
        : null;
    const mprfFirstAgeClass = cleanText(catalog?.MPRF_age_class_at_first_sighting);
    const firstAgeClass = firstKnownDatedAgeClass ?? mprfFirstAgeClass;
    const firstAgeClassDate = firstKnownDatedAgeClass
      ? firstKnownSightingDate
      : mprfFirstAgeClass
        ? mprfFirstSightingDate ?? firstKnownSightingDate
        : null;
    const firstAgeClassSource = firstKnownDatedAgeClass
      ? "HAMER dated sighting age class"
      : mprfFirstAgeClass
        ? "MPRF first-sighting age class"
        : null;
    const firstAgeClassIsMprf = !firstKnownDatedAgeClass && Boolean(mprfFirstAgeClass);
    const catalogAnchorAgeClassEvent = biopsyDate
      ? [...eventsSorted]
          .filter((event) => event.date === biopsyDate && cleanText(event.manta.age_class))
          .sort((a, b) => compareDate(b.date, a.date))[0]
      : null;
    const biopsyMantaAgeClass = cleanText(biopsyManta?.age_class);
    const catalogAnchorAgeClass = cleanText(catalogAnchorAgeClassEvent?.manta.age_class);
    const ageClassWhenBiopsied = biopsyMantaAgeClass ?? catalogAnchorAgeClass;
    const biopsyAgeClassIsMprf = biopsyMantaAgeClass
      ? biopsyManta?.is_mprf === true
      : catalogAnchorAgeClass
        ? catalogAnchorAgeClassEvent?.manta.is_mprf === true
        : false;
    const gender = cleanText(biopsyManta?.gender) ?? cleanText(catalog?.last_gender) ?? cleanText(rank.gender);
    const sightingsBeforeBiopsy = biopsyDate
      ? unique(eventsSorted.filter((event) => compareDate(event.date, biopsyDate) < 0).map((event) => num(event.manta.fk_sighting_id))).length
      : null;
    const yearsBeforeBiopsy = biopsyDate
      ? unique(eventsSorted.filter((event) => compareDate(event.date, biopsyDate) < 0).map((event) => yearOf(event.date))).length
      : null;
    const latestImmatureBeforeBiopsy = biopsyDate
      ? [...eventsSorted]
          .filter((event) => compareDate(event.date, biopsyDate) < 0 && ["juvenile", "pup"].includes(ageNorm(event.manta.age_class) ?? ""))
          .sort((a, b) => compareDate(b.date, a.date))[0]?.date ?? null
      : null;
    const observedYears = unique(eventsSorted.map((event) => yearOf(event.date))).length;
    const totalYearsObservedPriorToBiopsy =
      biopsyDate && firstKnownSightingDate ? yearsBetween(firstKnownSightingDate, biopsyDate) : yearsBeforeBiopsy;
    const sourceIsMprf = biopsy.source === "MPRF-import" || biopsyManta?.is_mprf === true || biopsySighting?.is_mprf === true || catalog?.is_mprf === true;
    const hasDatedPre2010Event = eventsSorted.some((event) => compareDate(event.date, "2010-01-01") < 0);
    const observationHistoryIncomplete =
      sourceIsMprf &&
      Boolean(firstKnownSightingDate) &&
      compareDate(firstKnownSightingDate, "2010-01-01") < 0 &&
      !hasDatedPre2010Event;
    const observationHistoryNote = observationHistoryIncomplete
      ? "MPRF first sighting predates the imported dated sighting history; reported years are minimums, not complete observed-year totals."
      : null;
    const firstSightingAsPup =
      ageNorm(firstAgeClass) === "pup" ||
      truthy(catalog?.mprf_pupinitially) ||
      truthy(rank.ever_seen_as_pup);
    const datedAgeClassSummaries = eventsSorted
      .map((event) => {
          const ageClass = cleanText(event.manta.age_class);
          return event.date && ageClass ? `${event.date}: ${ageClass}` : null;
        })
      .filter((value): value is string => Boolean(value));
    const ageClassObservationSummary = unique([
      ...datedAgeClassSummaries,
      mprfFirstAgeClass && (mprfFirstSightingDate ?? firstKnownSightingDate)
        ? `${mprfFirstSightingDate ?? firstKnownSightingDate}: ${mprfFirstAgeClass} (MPRF first-sighting age class)`
        : null,
    ].filter((value): value is string => Boolean(value)));

    const mantaSizeObservations = relatedMantas.flatMap((manta) => {
      const sighting = num(manta.fk_sighting_id) == null ? undefined : sightingById.get(num(manta.fk_sighting_id));
      const date = dateOnly(manta.sighting_date ?? sighting?.sighting_date ?? manta.mprf_date ?? null);
      return sizeValuesFromManta(manta).map((value) => ({
        value,
        date,
        source: `manta ${manta.pk_manta_id}`,
      }));
    });

    const sizeRows = unique(relatedMantas.map((manta) => num(manta.pk_manta_id))).flatMap((id) => (id == null ? [] : sizesByManta.get(id) ?? []));
    const mantaById = new Map(relatedMantas.map((manta) => [num(manta.pk_manta_id), manta]));
    const independentSizes = sizeRows
      .filter((row) => sizeMeasurementUsable(row) && (sizeMeasurementIncludedInMean(row) || row.size_m != null))
      .map((row) => {
        const manta = mantaById.get(num(row.fk_manta_id));
        const sighting = num(manta?.fk_sighting_id) == null ? undefined : sightingById.get(num(manta?.fk_sighting_id));
        return {
          value: dwM(row) ?? num(row.size_m),
          date: dateOnly(row.measured_on ?? manta?.sighting_date ?? sighting?.sighting_date ?? manta?.mprf_date ?? null),
          source: `size ${row.pk_manta_size_id}`,
        };
      })
      .filter((row) => row.value != null);

    const sizeObservations = [...mantaSizeObservations, ...independentSizes].filter((row) => row.value != null);
    const sizeObservationSummary = summarizeSizeObservationsByDate(dedupeSizeObservations(sizeObservations));
    const exactDateSizes = biopsyDate ? sizeObservations.filter((row) => row.date === biopsyDate) : [];
    const biopsyEncounterSize = biopsyManta ? firstNumber(sizeValuesFromManta(biopsyManta)) : null;
    const sizeAtBiopsyM = biopsyEncounterSize ?? firstNumber(exactDateSizes.map((row) => row.value));
    const nearestBefore = nearestSize(sizeObservations, biopsyDate, "before");
    const nearestAfter = nearestSize(sizeObservations, biopsyDate, "after");
    const selectedSizeDate = sizeAtBiopsyM != null
      ? biopsyDate
      : nearestBefore?.date ?? nearestAfter?.date ?? null;
    const currentRank = num(rank.age_rank_v3);
    const inferred = inferFromSizeAndHistory({
      gender,
      biopsyDate,
      ageClassWhenBiopsied,
      firstAgeClass,
      firstAgeClassDate,
      firstAgeClassSource,
      firstAgeClassIsMprf,
      biopsyAgeClassIsMprf,
      sourceIsMprf,
      sizeAtBiopsyM,
      nearestBeforeSize: nearestBefore?.value ?? null,
      nearestAfterSize: nearestAfter?.value ?? null,
      selectedSizeDate,
      firstSightingAsPup,
      firstSightingDate: firstKnownSightingDate,
      totalYearsObservedPriorToBiopsy,
      observationHistoryIncomplete,
      latestImmatureBeforeBiopsy,
      rankAgeAtBiopsy: num(rank.age_years_at_biopsy_v3),
      parameters: input.parameters,
    });

    const evidence = [
      isCatalogAnchor ? "Non-biopsied catalog row ranked as of last known sighting" : null,
      ...inferred.evidence,
      rank.age_rank_justification_v3 ? `Current view: ${String(rank.age_rank_justification_v3)}` : null,
    ].filter(Boolean) as string[];

    const flags = [
      !biopsyDate ? (isCatalogAnchor ? "missing ranking anchor date" : "missing biopsy date") : null,
      !ageClassWhenBiopsied ? (isCatalogAnchor ? "missing latest age class" : "missing biopsy encounter age class") : null,
      !sizeAtBiopsyM && !nearestBefore && !nearestAfter ? "no dated size evidence" : null,
      catalogId == null ? "missing catalog link" : null,
      observationHistoryIncomplete ? "MPRF pre-2010 sighting history incomplete; years observed are minimums" : null,
    ].filter(Boolean) as string[];

    return {
      pkBiopsyId: String(biopsy.pk_biopsy_id),
      mprfBiopsyId: cleanText(rank.mprf_biopsy_id) ?? cleanText(biopsy.lab_id) ?? cleanText(biopsy.raw_sample_id),
      mprfLegacyBiopsyId: findMprfLegacyBiopsyId(rank.mprf_biopsy_id, biopsy.lab_id, biopsy.raw_sample_id, rank.jonathan_sample_id),
      jonathanSequenceId: cleanText(rank.jonathan_sample_id) ?? cleanText(biopsy.raw_sample_id),
      catalogId,
      mprfCatalogId,
      mantaId,
      name: cleanText(catalog?.name) ?? cleanText(rank.hamer_name) ?? cleanText(rank.mprf_name),
      island: cleanText(biopsySighting?.island) ?? cleanText(biopsy.island),
      gender,
      ageClassWhenBiopsied,
      ageClassOnFirstSighting: firstAgeClass,
      totalSightings: num(catalog?.total_sightings) ?? unique(eventsSorted.map((event) => num(event.manta.fk_sighting_id))).length,
      totalSightingsPriorToBiopsy: sightingsBeforeBiopsy,
      totalYearsObserved: num(catalog?.count_unique_years_sighted) ?? num(rank.total_years_sighted) ?? num(rank.mprf_total_years_seen) ?? (observedYears || null),
      totalYearsObservedIsMinimum: observationHistoryIncomplete,
      totalYearsObservedPriorToBiopsy,
      totalYearsObservedPriorToBiopsyIsMinimum: observationHistoryIncomplete,
      observationHistoryNote,
      firstSightingAsPup,
      firstSightingDate: firstKnownSightingDate,
      ageClassChangedSinceFirstSighting: ageClassChanged(firstAgeClass, ageClassWhenBiopsied),
      sizeAtBiopsyM,
      nearestSizeBeforeBiopsyM: nearestBefore?.value ?? null,
      daysBeforeBiopsySize: nearestBefore?.days ?? null,
      nearestSizeAfterBiopsyM: nearestAfter?.value ?? null,
      daysAfterBiopsySize: nearestAfter?.days ?? null,
      totalSizes: sizeObservations.length,
      probableAgeBasedOnSize: inferred.probableAge,
      probableBirthYearBasedOnSize: inferred.probableBirthYear,
      minimumAgeAsOfYears: inferred.minimumAgeAsOfYears,
      maximumAgeAsOfYears: inferred.maximumAgeAsOfYears,
      ageIntervalAsOfDate: AGE_RANK_AS_OF_DATE,
      ageIntervalWidthYears:
        inferred.minimumAgeAsOfYears == null || inferred.maximumAgeAsOfYears == null
          ? null
          : Math.max(0, inferred.maximumAgeAsOfYears - inferred.minimumAgeAsOfYears),
      ageIntervalCheckpoints: inferred.ageIntervalCheckpoints,
      ageIntervalSummary: inferred.ageIntervalSummary,
      rejectedMaximumAgeNotes: inferred.rejectedMaximumAgeNotes,
      ageClassObservationSummary,
      sizeObservationSummary,
      currentRank,
      exploratoryRank: null,
      rankDelta: null,
      exploratoryScore: inferred.minimumAgeAsOfYears ?? 0,
      evidence,
      flags,
      evidenceSources: inferred.evidenceSources,
    };
  });

  const sortedScores = [...rows].sort((a, b) => b.exploratoryScore - a.exploratoryScore || rankSort(a.currentRank, b.currentRank) || a.pkBiopsyId.localeCompare(b.pkBiopsyId));
  let previousScore: number | null = null;
  let previousRank = 0;
  sortedScores.forEach((row, index) => {
    const rank = previousScore != null && row.exploratoryScore === previousScore ? previousRank : index + 1;
    row.exploratoryRank = rank;
    row.rankDelta = row.currentRank == null ? null : rank - row.currentRank;
    previousScore = row.exploratoryScore;
    previousRank = rank;
  });

  return rows;
}

function inferFromSizeAndHistory(args: {
  gender: string | null;
  biopsyDate: string | null;
  ageClassWhenBiopsied: string | null;
  firstAgeClass: string | null;
  firstAgeClassDate: string | null;
  firstAgeClassSource: string | null;
  firstAgeClassIsMprf: boolean;
  biopsyAgeClassIsMprf: boolean;
  sourceIsMprf: boolean;
  sizeAtBiopsyM: number | null;
  nearestBeforeSize: number | null;
  nearestAfterSize: number | null;
  selectedSizeDate: string | null;
  firstSightingAsPup: boolean;
  firstSightingDate: string | null;
  totalYearsObservedPriorToBiopsy: number | null;
  observationHistoryIncomplete: boolean;
  latestImmatureBeforeBiopsy: string | null;
  rankAgeAtBiopsy: number | null;
  parameters: BiopsyAgeParameters;
}) {
  const evidence: string[] = [];
  const evidenceSources: string[] = [];
  const ageIntervalCheckpoints: AgeIntervalCheckpoint[] = [];
  let probableAge: string | null = null;
  let probableBirthYear: string | null = null;
  const sex = genderNorm(args.gender);
  const size = args.sizeAtBiopsyM ?? args.nearestBeforeSize ?? args.nearestAfterSize;
  const maturityAge = sex === "female" ? args.parameters.femaleMaturityAgeYears : sex === "male" ? args.parameters.maleMaturityAgeYears : null;
  const maturitySize = sex === "female" ? args.parameters.femaleMaturitySizeM : args.parameters.maleMaturitySizeM;
  const terminalSize = sex === "female" ? args.parameters.femaleTerminalSizeM : args.parameters.maleTerminalSizeM;
  const ageClass = ageNorm(args.ageClassWhenBiopsied);
  const firstSightingAgeClass = ageNorm(args.firstAgeClass);
  const useSizeMaturityAssumptions = args.parameters.includeSizeEvidence;
  const useAgeClassMaturityAssumptions = args.parameters.includeAgeClassEvidence;
  const useMprfAgeClassMaturityAssumptions = args.parameters.includeMprfAgeClassEvidence;
  const useBiopsyAgeClassEvidence = args.biopsyAgeClassIsMprf
    ? args.parameters.includeMprfAgeClassEvidence
    : args.parameters.includeAgeClassEvidence;
  const useFirstAgeClassEvidence = args.firstAgeClassIsMprf
    ? args.parameters.includeMprfAgeClassEvidence
    : args.parameters.includeAgeClassEvidence;
  const useBiopsyAgeClassMaturityAssumptions = args.biopsyAgeClassIsMprf
    ? useMprfAgeClassMaturityAssumptions
    : useAgeClassMaturityAssumptions;
  const useFirstAgeClassMaturityAssumptions = args.firstAgeClassIsMprf
    ? useMprfAgeClassMaturityAssumptions
    : useAgeClassMaturityAssumptions;

  if (args.parameters.includeLifeHistoryEvidence && args.firstSightingDate) {
    const minimumAgeAsOf = yearsBetween(args.firstSightingDate, AGE_RANK_AS_OF_DATE);
    if (minimumAgeAsOf != null && minimumAgeAsOf >= 0) {
      ageIntervalCheckpoints.push({
        key: "life_history",
        label: "First sighting date",
        date: args.firstSightingDate,
        minimumAgeYears: minimumAgeAsOf,
        maximumAgeYears: null,
        reliability: "high",
        detail: `Not younger than ${round(minimumAgeAsOf, 1)} yrs as of ${AGE_RANK_AS_OF_DATE} because it was already seen on ${args.firstSightingDate}.`,
      });
    }
  }

  if (useBiopsyAgeClassEvidence && ageClass === "adult") {
    addAgeClassCheckpoint(ageIntervalCheckpoints, {
      ageClass,
      date: args.biopsyDate,
      maturityAge,
      reliability: args.biopsyAgeClassIsMprf ? "medium" : "high",
      labelPrefix: args.biopsyAgeClassIsMprf ? "MPRF biopsy encounter age class" : "HAMER biopsy encounter age class",
      useMaturityAgeAssumption: useBiopsyAgeClassMaturityAssumptions,
    });
    probableAge = probableAge ?? (useBiopsyAgeClassMaturityAssumptions && maturityAge != null ? `>=${maturityAge} yrs by biopsy age class` : "adult by biopsy age class");
    evidence.push(`${args.biopsyAgeClassIsMprf ? "MPRF" : "HAMER"} biopsy encounter age class is mature/adult`);
    evidenceSources.push("age_class");
    if (useBiopsyAgeClassMaturityAssumptions && maturityAge != null && args.biopsyDate) probableBirthYear = probableBirthYear ?? `<=${yearOf(args.biopsyDate) - maturityAge}`;
    if (args.latestImmatureBeforeBiopsy && args.biopsyDate) {
      const yearsSinceImmature = yearsBetween(args.latestImmatureBeforeBiopsy, args.biopsyDate);
      if (yearsSinceImmature != null) {
        evidence.push(`Recent immature sighting tightens adult age estimate window: immature on ${args.latestImmatureBeforeBiopsy}, adult at biopsy`);
        evidenceSources.push("age_class_transition");
      }
    }
  } else if (useBiopsyAgeClassEvidence && (ageClass === "juvenile" || ageClass === "pup")) {
    addAgeClassCheckpoint(ageIntervalCheckpoints, {
      ageClass,
      date: args.biopsyDate,
      maturityAge,
      reliability: args.biopsyAgeClassIsMprf ? "medium" : "high",
      labelPrefix: args.biopsyAgeClassIsMprf ? "MPRF biopsy encounter age class" : "HAMER biopsy encounter age class",
      useMaturityAgeAssumption: useBiopsyAgeClassMaturityAssumptions,
    });
    probableAge = probableAge ?? (useBiopsyAgeClassMaturityAssumptions && maturityAge != null ? `<${maturityAge} yrs by biopsy age class` : `${ageClass} by biopsy age class`);
    evidence.push(`${args.biopsyAgeClassIsMprf ? "MPRF" : "HAMER"} biopsy encounter age class is ${ageClass}`);
    evidenceSources.push("age_class");
  } else if (args.biopsyAgeClassIsMprf && ageClass) {
    evidence.push("MPRF biopsy age-class evidence disabled by parameter");
  }

  if (
    useFirstAgeClassEvidence &&
    firstSightingAgeClass &&
    args.firstAgeClassDate &&
    (args.firstAgeClassDate !== args.biopsyDate || firstSightingAgeClass !== ageClass)
  ) {
    addAgeClassCheckpoint(ageIntervalCheckpoints, {
      ageClass: firstSightingAgeClass,
      date: args.firstAgeClassDate,
      maturityAge,
      reliability: args.firstAgeClassIsMprf ? "medium" : "high",
      labelPrefix: args.firstAgeClassSource ?? "First-sighting age class",
      useMaturityAgeAssumption: useFirstAgeClassMaturityAssumptions,
    });
  }

  if (args.parameters.includePupEvidence && args.parameters.treatPupAsBirthAnchor && args.firstSightingAsPup && args.firstSightingDate && args.biopsyDate) {
    const age = yearsBetween(args.firstSightingDate, args.biopsyDate);
    if (age != null) {
      probableAge = `${round(age, 1)} yrs from pup first sighting`;
      probableBirthYear = String(yearOf(args.firstSightingDate));
      evidence.push(`Pup anchor: first sighting ${args.firstSightingDate}`);
      evidenceSources.push("pup_anchor");
    }
  }

  if (args.parameters.includePupEvidence && args.parameters.treatPupAsBirthAnchor && args.firstSightingAsPup && args.firstSightingDate) {
    const yearsSincePup = yearsBetween(args.firstSightingDate, AGE_RANK_AS_OF_DATE);
    if (yearsSincePup != null && yearsSincePup >= 0) {
      ageIntervalCheckpoints.push({
        key: "pup_first_sighting",
        label: "Observed as pup on first sighting",
        date: args.firstSightingDate,
        minimumAgeYears: yearsSincePup,
        maximumAgeYears: yearsSincePup + 1,
        reliability: "medium",
        detail: `Treated as roughly 0-1 yr old on ${args.firstSightingDate}, so age is ${round(yearsSincePup, 1)}-${round(yearsSincePup + 1, 1)} yrs as of ${AGE_RANK_AS_OF_DATE}.`,
      });
    }
  }

  if (args.parameters.includeLifeHistoryEvidence && args.totalYearsObservedPriorToBiopsy != null && args.totalYearsObservedPriorToBiopsy > 0) {
    evidence.push(
      args.observationHistoryIncomplete
        ? `MPRF history before biopsy supports at least ${round(args.totalYearsObservedPriorToBiopsy, 1)} years old; pre-2010 dated sightings are incomplete`
        : `Sighting history before biopsy supports at least ${round(args.totalYearsObservedPriorToBiopsy, 1)} years old`,
    );
    evidenceSources.push("life_history");
  }

  if (args.parameters.includeSizeEvidence && size != null && sex) {
    const yearsFromSizeToReference = args.selectedSizeDate ? yearsBetween(args.selectedSizeDate, AGE_RANK_AS_OF_DATE) : null;
    const sizeClass =
      size >= terminalSize * 0.97
        ? "near/at selected terminal size"
        : size >= maturitySize
          ? "meets selected maturity size"
          : "below selected maturity size";
    const sizeAgeFloorAtMeasurement =
      useSizeMaturityAssumptions && maturityAge != null
        ? size >= maturitySize
          ? maturityAge
          : 0
        : 0;
    const minimumAgeAsOf =
      yearsFromSizeToReference == null
        ? null
        : Math.max(0, sizeAgeFloorAtMeasurement + yearsFromSizeToReference);
    const maximumAgeAsOf =
      useSizeMaturityAssumptions && maturityAge != null && yearsFromSizeToReference != null && size < maturitySize
        ? Math.max(0, maturityAge + yearsFromSizeToReference)
        : null;
    if (args.selectedSizeDate) {
      ageIntervalCheckpoints.push({
        key: "size",
        label: useSizeMaturityAssumptions ? "Size maturity measurement" : "Size measurement",
        date: args.selectedSizeDate,
        minimumAgeYears: minimumAgeAsOf,
        maximumAgeYears: maximumAgeAsOf,
        reliability: useSizeMaturityAssumptions ? "model" : "high",
        detail: useSizeMaturityAssumptions
          ? size >= maturitySize
            ? `${round(size, 2)} m ${sizeClass}; not younger than selected maturity age plus years since measurement.`
            : `${round(size, 2)} m is below selected maturity size; selected maturity age caps the maximum plausible age.`
          : `${round(size, 2)} m ${sizeClass}. Evidence-bounds mode uses this as a dated observation and life-stage classification only; it does not add growth- or maturity-age years.`,
      });
    }
    if (size >= maturitySize) {
      probableAge = useSizeMaturityAssumptions && maturityAge != null ? `>=${maturityAge} yrs by ${sex} maturity size` : `${sex} mature-sized`;
      evidence.push(`${round(size, 2)} m DW meets ${sex} maturity threshold ${maturitySize} m`);
      evidenceSources.push("size");
      if (useSizeMaturityAssumptions && maturityAge != null && args.biopsyDate) probableBirthYear = `<=${yearOf(args.biopsyDate) - maturityAge}`;
    } else {
      probableAge = probableAge ?? (useSizeMaturityAssumptions && maturityAge != null ? `<${maturityAge} yrs by ${sex} maturity size` : `${sex} below maturity size`);
      evidence.push(`${round(size, 2)} m DW below ${sex} maturity threshold ${maturitySize} m`);
      evidenceSources.push("size");
    }
  }

  if (args.rankAgeAtBiopsy != null) {
    evidence.push(`Current view age estimate ${round(args.rankAgeAtBiopsy, 1)} yrs, shown for comparison only`);
  }

  const minimumAges = ageIntervalCheckpoints
    .map((checkpoint) => checkpoint.minimumAgeYears)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const maximumAges = ageIntervalCheckpoints
    .map((checkpoint) => checkpoint.maximumAgeYears)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const minimumAgeAsOfYears = minimumAges.length ? Math.max(...minimumAges) : null;
  const rawMaximumAgeAsOfYears = maximumAges.length ? Math.min(...maximumAges) : null;
  const rejectedMaximumAgeNotes: string[] = [];
  if (minimumAgeAsOfYears != null && rawMaximumAgeAsOfYears != null && minimumAgeAsOfYears > rawMaximumAgeAsOfYears) {
    ageIntervalCheckpoints.forEach((checkpoint) => {
      if (checkpoint.maximumAgeYears == null || checkpoint.maximumAgeYears >= minimumAgeAsOfYears) return;
      checkpoint.rejectedMaximumAgeYears = checkpoint.maximumAgeYears;
      checkpoint.rejectedMaximumReason = `Rejected because stronger evidence requires minimum age ${round(minimumAgeAsOfYears, 1)} yrs.`;
      rejectedMaximumAgeNotes.push(`${checkpoint.label} max ${round(checkpoint.maximumAgeYears, 1)} yrs rejected by stronger minimum-age evidence`);
    });
  }
  const maximumAgeAsOfYears =
    minimumAgeAsOfYears != null && rawMaximumAgeAsOfYears != null && minimumAgeAsOfYears > rawMaximumAgeAsOfYears
      ? null
      : rawMaximumAgeAsOfYears;
  const ageIntervalSummary =
    minimumAgeAsOfYears == null && maximumAgeAsOfYears == null
      ? null
      : maximumAgeAsOfYears == null
        ? `>=${round(minimumAgeAsOfYears ?? 0, 1)} yrs as of ${AGE_RANK_AS_OF_DATE}`
        : `${round(minimumAgeAsOfYears ?? 0, 1)}-${round(maximumAgeAsOfYears, 1)} yrs as of ${AGE_RANK_AS_OF_DATE}`;
  if (ageIntervalSummary) {
    evidence.unshift(`Age interval ${ageIntervalSummary}`);
  }
  return {
    probableAge,
    probableBirthYear,
    minimumAgeAsOfYears,
    maximumAgeAsOfYears,
    ageIntervalCheckpoints,
    ageIntervalSummary,
    rejectedMaximumAgeNotes,
    evidence,
    evidenceSources: Array.from(new Set(evidenceSources)),
  };
}

function addAgeClassCheckpoint(
  checkpoints: AgeIntervalCheckpoint[],
  args: {
    ageClass: string;
    date: string | null;
    maturityAge: number | null;
    reliability: "high" | "medium";
    labelPrefix?: string;
    useMaturityAgeAssumption: boolean;
  },
) {
  if (!args.date) return;
  const yearsToReference = yearsBetween(args.date, AGE_RANK_AS_OF_DATE);
  if (yearsToReference == null || yearsToReference < 0) return;
  if (args.ageClass === "adult") {
    checkpoints.push({
      key: "age_class",
      label: args.labelPrefix ?? "Observed age class",
      date: args.date,
      minimumAgeYears: args.useMaturityAgeAssumption && args.maturityAge != null ? args.maturityAge + yearsToReference : yearsToReference,
      maximumAgeYears: null,
      reliability: args.reliability,
      detail: args.useMaturityAgeAssumption && args.maturityAge != null
        ? `Adult/mature on ${args.date}; not younger than selected maturity age plus years to ${AGE_RANK_AS_OF_DATE}.`
        : `Adult/mature on ${args.date}; evidence-bounds mode treats this as a dated observation and does not add maturity-age years.`,
    });
    return;
  }
  if (args.ageClass === "juvenile") {
    checkpoints.push({
      key: "age_class",
      label: args.labelPrefix ?? "Observed age class",
      date: args.date,
      minimumAgeYears: yearsToReference,
      maximumAgeYears: args.useMaturityAgeAssumption && args.maturityAge != null ? args.maturityAge + yearsToReference : null,
      reliability: args.reliability,
      detail: args.useMaturityAgeAssumption && args.maturityAge != null
        ? `Juvenile on ${args.date}; caps the years that can be added before that date using the selected maturity age.`
        : `Juvenile on ${args.date}; evidence-bounds mode treats this as a dated observation and does not impose a maturity-age cap.`,
    });
    return;
  }
  if (args.ageClass === "pup") {
    checkpoints.push({
      key: "age_class",
      label: args.labelPrefix ?? "Observed age class",
      date: args.date,
      minimumAgeYears: yearsToReference,
      maximumAgeYears: yearsToReference + 1,
      reliability: args.reliability,
      detail: `Pup on ${args.date}; treated as roughly 0-1 yr old at that observation.`,
    });
  }
}

function groupBy<T>(rows: T[], getKey: (row: T) => number | null | undefined) {
  const out = new Map<number, T[]>();
  rows.forEach((row) => {
    const key = getKey(row);
    if (key == null) return;
    out.set(key, [...(out.get(key) ?? []), row]);
  });
  return out;
}

function unique<T>(items: (T | null | undefined)[]) {
  return Array.from(new Set(items.filter((item): item is T => item != null)));
}

function cleanText(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function findMprfLegacyBiopsyId(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value);
    if (!text) continue;
    const match = text.match(/\bK[B]?\s*0*\d{1,5}\b/i);
    if (match) return match[0].replace(/\s+/g, "").toUpperCase();
  }
  return null;
}

function num(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstNumber(values: Array<number | null | undefined>) {
  return values.find((value): value is number => value != null && Number.isFinite(value)) ?? null;
}

function dateOnly(value: unknown) {
  if (!value) return null;
  const text = String(value);
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function compareDate(a: string | null | undefined, b: string | null | undefined) {
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function earliestDate(...dates: Array<string | null | undefined>) {
  return dates
    .filter((date): date is string => Boolean(date))
    .sort(compareDate)[0] ?? null;
}

function daysBetween(a: string, b: string) {
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(diff / 86400000);
}

function yearsBetween(a: string, b: string) {
  const days = daysBetween(a, b);
  return Number.isFinite(days) ? days / 365.25 : null;
}

function yearOf(value: string | null | undefined) {
  return value ? Number(value.slice(0, 4)) : null;
}

function truthy(value: unknown) {
  if (typeof value === "boolean") return value;
  return ["true", "yes", "1", "y"].includes(String(value ?? "").trim().toLowerCase());
}

function ageNorm(value: string | null | undefined) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (text.includes("pup") || text.includes("neonate")) return "pup";
  if (text.includes("juven") || text.includes("immature")) return "juvenile";
  if (text.includes("adult") || text.includes("mature")) return "adult";
  return text;
}

function genderNorm(value: string | null | undefined) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["f", "female"].includes(text)) return "female";
  if (["m", "male"].includes(text)) return "male";
  return null;
}

function ageClassChanged(first: string | null | undefined, later: string | null | undefined) {
  const a = ageNorm(first);
  const b = ageNorm(later);
  return Boolean(a && b && a !== b);
}

function sizeValuesFromManta(manta: ResearchMantaRow) {
  return [
    num(manta.size_dw_m),
    num(manta.size_disc_width_m),
    num(manta.size_m),
    num(manta.estimated_size_m),
    num(manta.jon_size_m),
  ].filter((value): value is number => value != null);
}

function nearestSize(
  observations: Array<{ value: number | null; date: string | null; source: string }>,
  biopsyDate: string | null,
  direction: "before" | "after",
) {
  if (!biopsyDate) return null;
  return observations
    .filter((row) => row.value != null && row.date != null)
    .map((row) => ({
      value: row.value as number,
      days: daysBetween(row.date as string, biopsyDate),
      date: row.date as string,
      source: row.source,
    }))
    .filter((row) => (direction === "before" ? row.days > 0 : row.days < 0))
    .map((row) => ({ ...row, days: Math.abs(row.days) }))
    .sort((a, b) => a.days - b.days)[0] ?? null;
}

function dedupeSizeObservations(observations: Array<{ value: number | null; date: string | null; source: string }>) {
  const map = new Map<string, { value: number; date: string | null; source: string }>();
  observations.forEach((row) => {
    if (row.value == null) return;
    const key = `${row.date ?? "undated"}-${round(row.value, 3)}`;
    map.set(key, { value: row.value, date: row.date, source: row.source });
  });
  return Array.from(map.values());
}

function summarizeSizeObservationsByDate(observations: Array<{ value: number; date: string | null; source: string }>) {
  const byDate = new Map<string, number[]>();
  observations.forEach((row) => {
    const key = row.date ?? "undated";
    byDate.set(key, [...(byDate.get(key) ?? []), row.value]);
  });
  return Array.from(byDate.entries())
    .sort(([a], [b]) => compareDate(a === "undated" ? null : a, b === "undated" ? null : b))
    .map(([date, values]) => {
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      return `${date}: mean DW ${round(mean, 2)} m (n=${values.length})`;
    });
}

function rankSort(a: number | null, b: number | null) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
