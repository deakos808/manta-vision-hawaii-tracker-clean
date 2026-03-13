import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
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
  namePrefix: string;
  setNamePrefix: (v: string) => void;
  onOpenStats: () => void;
  isAdmin?: boolean;
}

const GENDERS = ["Male", "Female", "Unknown"] as const;
const AGES = ["Adult", "Juvenile", "Yearling", "Unknown"] as const;
const MPRF_OPTIONS = ["MPRF", "HAMER"] as const;

const populationIslandMap: Record<string, string[]> = {
  "Maui Nui": ["Maui", "Molokai", "Lanai", "Kahoolawe"],
  Kauai: ["Kauai", "Niihau"],
};

const uniq = <T,>(arr: (T | null | undefined)[]) =>
  [...new Set(arr.filter(Boolean) as T[])];

const countSingles = (rows: CatalogEntry[], field: keyof CatalogEntry) => {
  const map: Record<string, number> = {};
  rows.forEach((r) => {
    const val = (r[field] ?? "") as string;
    if (!val) return;
    map[val] = (map[val] || 0) + 1;
  });
  return map;
};

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
  namePrefix,
  setNamePrefix,
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
    () => uniq<string>(siteBase.map((c) => c.sitelocation ?? "")),
    [siteBase],
  );

  const speciesCounts = useMemo(
    () => countSingles(siteBase, "species"),
    [siteBase],
  );

  const speciesOptions = useMemo(
    () => uniq<string>(siteBase.map((c) => c.species ?? "")),
    [siteBase],
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
              {opt}
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
        {renderMenu("Gender", "gender", [...GENDERS], genderCounts)}
        {renderMenu("Age Class", "age_class", [...AGES], ageCounts)}
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

        <div>
          <div className="text-xs text-gray-600 mb-1">Name (starts with)</div>
          <input
            value={namePrefix}
            onChange={(e) => setNamePrefix(e.target.value)}
            placeholder="e.g., Ak..."
            className="w-full rounded border px-3 py-2 text-sm bg-white"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="text-sm text-gray-700">Sort by:</div>

        <select
          value={sortField}
          onChange={(e) =>
            setSortField(
              e.target.value as "catalog_id" | "first_sighting" | "last_sighting" | "last_size"
            )
          }
          className="rounded border px-3 py-2 text-sm bg-white"
        >
          <option value="catalog_id">Catalog ID</option>
          <option value="first_sighting">First Sighting</option>
          <option value="last_sighting">Last Sighting</option>
          <option value="last_size">Last Size</option>
        </select>

        <div className="flex items-center text-sm text-gray-700 gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title={sortDirectionLabels.asc}
            aria-label={sortDirectionLabels.asc}
            className={sortAsc ? "text-blue-600" : ""}
            onClick={() => setSortAsc(true)}
          >
            ▲
          </Button>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            title={sortDirectionLabels.desc}
            aria-label={sortDirectionLabels.desc}
            className={!sortAsc ? "text-blue-600" : ""}
            onClick={() => setSortAsc(false)}
          >
            ▼
          </Button>
        </div>
      </div>
    </div>
  );
}
