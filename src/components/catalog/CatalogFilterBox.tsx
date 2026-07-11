import { useMemo } from "react";
import { ChevronDown, Triangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

export interface FiltersState {
  population: string[];
  species: string[];
  island: string[];
  sitelocation: string[];
  gender: string[];
  age_class: string[];
  mprf: string[];
}

interface CatalogEntry {
  species?: string | null;
  populations?: string[] | null;
  islands?: string[] | null;
  sitelocation?: string | null;
  gender?: string | null;
  age_class?: string | null;
  mprf?: string | null;
  best_catalog_ventral_thumb_url?: string | null;
  best_catalog_dorsal_thumb_url?: string | null;
  total_sizes?: number | null;
  total_biopsies?: number | null;
  total_tags?: number | null;
}

interface Props {
  catalog: CatalogEntry[];
  filters: FiltersState;
  setFilters: (f: FiltersState) => void;
  sortField: "catalog_id" | "first_sighting" | "last_sighting" | "last_size";
  setSortField: (v: "catalog_id" | "first_sighting" | "last_sighting" | "last_size") => void;
  sortAsc: boolean;
  setSortAsc: (v: boolean) => void;
  onClearAll: () => void;
  viewMode: "ventral" | "dorsal";
  setViewMode: (v: "ventral" | "dorsal") => void;
  catalogIdPrefix: string;
  setCatalogIdPrefix: (v: string) => void;
  onlySized: boolean;
  setOnlySized: (v: boolean) => void;
  onlyBiopsied: boolean;
  setOnlyBiopsied: (v: boolean) => void;
  onlyTagged: boolean;
  setOnlyTagged: (v: boolean) => void;
  onOpenStats: () => void;
  isAdmin?: boolean;
}

const GENDERS = ["Male", "Female", "Unknown"] as const;
const AGES = ["Adult", "Juvenile", "Yearling", "Unknown"] as const;
const MPRF_OPTIONS = ["MPRF", "HAMER"] as const;
const MISSING_FILTER_VALUE = "__missing__";

const populationIslandMap: Record<string, string[]> = {
  "Maui Nui": ["Maui", "Molokai", "Lanai", "Kahoolawe"],
  Kauai: ["Kauai", "Niihau"],
};

const uniq = <T,>(arr: (T | null | undefined)[]) =>
  [...new Set(arr.filter(Boolean) as T[])];

const countSingles = (rows: CatalogEntry[], field: keyof CatalogEntry) => {
  const map: Record<string, number> = {};
  rows.forEach((r) => {
    const val = String(r[field] ?? "").trim();
    if (!val) {
      map[MISSING_FILTER_VALUE] = (map[MISSING_FILTER_VALUE] || 0) + 1;
      return;
    }
    map[val] = (map[val] || 0) + 1;
  });
  return map;
};

const withMissingOption = (options: string[], counts: Record<string, number>) =>
  counts[MISSING_FILTER_VALUE] ? [...options, MISSING_FILTER_VALUE] : options;

const optionLabel = (value: string) =>
  value === MISSING_FILTER_VALUE ? "(missing)" : value;

const countFromArrays = (
  rows: CatalogEntry[],
  field: "populations" | "islands",
) => {
  const map: Record<string, number> = {};
  rows.forEach((r) => {
    r[field]?.forEach((val) => {
      if (!val) return;
      map[val] = (map[val] || 0) + 1;
    });
  });
  return map;
};

export default function CatalogFilterBox({
  catalog,
  filters,
  setFilters,
  sortField,
  setSortField,
  sortAsc,
  setSortAsc,
  onClearAll,
  viewMode,
  setViewMode,
  catalogIdPrefix,
  setCatalogIdPrefix,
  onlySized,
  setOnlySized,
  onlyBiopsied,
  setOnlyBiopsied,
  onlyTagged,
  setOnlyTagged,
  onOpenStats,
  isAdmin = false,
}: Props) {
  const toggle = (key: keyof FiltersState, value: string) => {
    const next = filters[key].includes(value)
      ? filters[key].filter((v) => v !== value)
      : [...filters[key], value];
    setFilters({ ...filters, [key]: next });
  };

  const clearKey = (key: keyof FiltersState) =>
    setFilters({ ...filters, [key]: [] });

  const populationCounts = useMemo(
    () => countFromArrays(catalog, "populations"),
    [catalog],
  );

  const populationOptions = useMemo(() => {
    const all: string[] = [];
    catalog.forEach((c) => {
      if (c.populations) all.push(...c.populations);
    });
    return uniq<string>(all);
  }, [catalog]);

  const islandBase = useMemo(() => {
    if (filters.population.length === 1) {
      const pop = filters.population[0];
      if (populationIslandMap[pop]) {
        return catalog.filter((c) =>
          c.islands?.some((is) => populationIslandMap[pop].includes(is)),
        );
      }
    }

    return filters.population.length
      ? catalog.filter((c) =>
          c.populations?.some((p) => filters.population.includes(p)),
        )
      : catalog;
  }, [catalog, filters.population]);

  const islandCounts = useMemo(
    () => countFromArrays(islandBase, "islands"),
    [islandBase],
  );

  const islandOptions = useMemo(() => {
    const all: string[] = [];
    islandBase.forEach((c) => {
      if (c.islands) all.push(...c.islands);
    });
    return uniq<string>(all);
  }, [islandBase]);

  const siteBase = useMemo(() => {
    return filters.island.length
      ? islandBase.filter((c) =>
          c.islands?.some((is) => filters.island.includes(is)),
        )
      : islandBase;
  }, [islandBase, filters.island]);

  const siteCounts = useMemo(
    () => countSingles(siteBase, "sitelocation"),
    [siteBase],
  );

  const siteOptions = useMemo(
    () => withMissingOption(uniq<string>(siteBase.map((c) => c.sitelocation ?? "")), siteCounts),
    [siteBase, siteCounts],
  );

  const speciesCounts = useMemo(
    () => countSingles(siteBase, "species"),
    [siteBase],
  );

  const speciesOptions = useMemo(
    () => withMissingOption(uniq<string>(siteBase.map((c) => c.species ?? "")), speciesCounts),
    [siteBase, speciesCounts],
  );

  const genderCounts = useMemo(
    () => countSingles(siteBase, "gender"),
    [siteBase],
  );

  const ageCounts = useMemo(
    () => countSingles(siteBase, "age_class"),
    [siteBase],
  );

  const mprfCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of siteBase) {
      const key = (row.mprf ?? "").toString().trim();
      if (!key) continue;
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [siteBase]);

  const viewCounts = useMemo(() => {
    let ventral = 0;
    let dorsal = 0;

    for (const row of catalog) {
      if (row.best_catalog_ventral_thumb_url) ventral += 1;
      if (row.best_catalog_dorsal_thumb_url) dorsal += 1;
    }

    return { ventral, dorsal };
  }, [catalog]);

  const evidenceCounts = useMemo(() => {
    let sized = 0;
    let biopsied = 0;
    let tagged = 0;

    for (const row of catalog) {
      if (Number(row.total_sizes ?? 0) > 0) sized += 1;
      if (Number(row.total_biopsies ?? 0) > 0) biopsied += 1;
      if (Number(row.total_tags ?? 0) > 0) tagged += 1;
    }

    return { sized, biopsied, tagged };
  }, [catalog]);

  const sortDirectionLabels =
    sortField === "catalog_id" || sortField === "last_size"
      ? { asc: "Small → Large", desc: "Large → Small" }
      : { asc: "Earlier → Later", desc: "Later → Earlier" };

  const renderMenu = (
    label: string,
    key: keyof FiltersState,
    options: string[],
    counts: Record<string, number>,
  ) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="text-sm">
          {label}
          {Array.isArray(filters[key]) && filters[key].length > 0 && (
            <span className="ml-1">({filters[key].length})</span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-60 p-2 space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="font-medium text-sm">{label}</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => clearKey(key)}
          >
            All
          </Button>
        </div>

        {options.map((opt) => (
          <label
            key={opt}
            className="flex items-center justify-between gap-2 p-1 rounded hover:bg-muted/50 text-sm"
          >
            <div className="flex items-center gap-2">
              <Checkbox
                checked={Array.isArray(filters[key]) && filters[key].includes(opt)}
                onCheckedChange={() => toggle(key, opt)}
              />
              {optionLabel(opt)}
            </div>
            <span className="text-xs text-muted-foreground">
              {counts[opt] ?? 0}
            </span>
          </label>
        ))}

        {options.length === 0 && (
          <div className="text-xs text-muted-foreground">— none —</div>
        )}
      </PopoverContent>
    </Popover>
  );

  const renderDataToggle = (
    label: string,
    checked: boolean,
    onCheckedChange: (checked: boolean) => void,
    count: number,
  ) => (
    <label className="flex min-h-10 items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      <span className="font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </label>
  );

  return (
    <div className="bg-white shadow p-4 rounded border mb-4">
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-medium">Filter Catalog Records by:</div>
        <div className="flex items-center gap-3">
          <Button variant="link" size="sm" onClick={onClearAll}>
            Clear All Filters
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenStats}>
            Catalog Stats
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {renderMenu("Species", "species", speciesOptions, speciesCounts)}
        {renderMenu("Population", "population", populationOptions, populationCounts)}
        {renderMenu("Island", "island", islandOptions, islandCounts)}
        {renderMenu("Location", "sitelocation", siteOptions, siteCounts)}
        {renderMenu("Gender", "gender", withMissingOption([...GENDERS], genderCounts), genderCounts)}
        {renderMenu("Age Class", "age_class", withMissingOption([...AGES], ageCounts), ageCounts)}
        {isAdmin && renderMenu("HAMER", "mprf", [...MPRF_OPTIONS], mprfCounts)}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="text-sm">
              Photo View <span className="ml-2">({viewMode})</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 space-y-2">
            <div className="font-medium text-sm px-1">Photo View</div>

            <label className="flex items-center justify-between gap-2 p-1 rounded hover:bg-muted/50 text-sm">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={viewMode === "ventral"}
                  onCheckedChange={() => setViewMode("ventral")}
                />
                ventral
              </div>
              <span className="text-xs text-muted-foreground">{viewCounts.ventral}</span>
            </label>

            <label className="flex items-center justify-between gap-2 p-1 rounded hover:bg-muted/50 text-sm">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={viewMode === "dorsal"}
                  onCheckedChange={() => setViewMode("dorsal")}
                />
                dorsal
              </div>
              <span className="text-xs text-muted-foreground">{viewCounts.dorsal}</span>
            </label>
          </PopoverContent>
        </Popover>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {renderDataToggle("Sized", onlySized, setOnlySized, evidenceCounts.sized)}
        {renderDataToggle("Biopsied", onlyBiopsied, setOnlyBiopsied, evidenceCounts.biopsied)}
        {renderDataToggle("Tagged", onlyTagged, setOnlyTagged, evidenceCounts.tagged)}
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
        <div>
          <div className="text-xs text-gray-600 mb-1">Catalog ID (starts with)</div>
          <input
            value={catalogIdPrefix}
            onChange={(e) => setCatalogIdPrefix(e.target.value)}
            placeholder="e.g., 71..."
            className="w-full rounded border px-3 py-2 text-sm bg-white"
          />
        </div>

      </div>

      <div className="mt-3 rounded-lg border bg-white p-3">
        <div className="mb-2 text-sm font-medium text-gray-700">Sort Catalog Cards</div>

        <div className="flex flex-wrap items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="rounded-full px-4 py-2 text-sm"
              >
                {sortField === "catalog_id" && "Sorted by Catalog ID"}
                {sortField === "first_sighting" && "Sorted by First Sighting"}
                {sortField === "last_sighting" && "Sorted by Last Sighting"}
                {sortField === "last_size" && "Sorted by Last Size"}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </PopoverTrigger>

            <PopoverContent className="w-56 p-2 space-y-1">
              <div className="px-1 pb-1 text-sm font-medium text-gray-700">Sort By</div>

              <Button
                type="button"
                variant={sortField === "catalog_id" ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => setSortField("catalog_id")}
              >
                Catalog ID
              </Button>

              <Button
                type="button"
                variant={sortField === "first_sighting" ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => setSortField("first_sighting")}
              >
                First Sighting
              </Button>

              <Button
                type="button"
                variant={sortField === "last_sighting" ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => setSortField("last_sighting")}
              >
                Last Sighting
              </Button>

              <Button
                type="button"
                variant={sortField === "last_size" ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => setSortField("last_size")}
              >
                Last Size
              </Button>
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-3">
            <button
              type="button"
              title={sortDirectionLabels.asc}
              aria-label={sortDirectionLabels.asc}
              onClick={() => setSortAsc(true)}
              className="p-1"
            >
              <Triangle
                className={`h-3 w-3 ${
                  sortAsc ? "text-blue-600 fill-blue-600" : "text-gray-400"
                }`}
              />
            </button>

            <button
              type="button"
              title={sortDirectionLabels.desc}
              aria-label={sortDirectionLabels.desc}
              onClick={() => setSortAsc(false)}
              className="p-1"
            >
              <Triangle
                className={`h-3 w-3 rotate-180 ${
                  !sortAsc ? "text-blue-600 fill-blue-600" : "text-gray-400"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
