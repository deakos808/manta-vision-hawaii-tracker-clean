// File: src/components/catalog/CatalogFilterBox.tsx
import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

/* ── types ─────────────────────────────────────────── */
export interface FiltersState {
  population: string[];
  species: string[];
  island: string[];
  sitelocation: string[];
  gender: string[];
  age_class: string[];
}

interface CatalogEntry {
  /* NEW — arrays coming from the view */
  species?: string | null;
  populations?: string[] | null;
  islands?: string[] | null;

  /* Legacy single-value cols (still used by UI) */
  sitelocation?: string | null;
  gender?: string | null;
  age_class?: string | null;
}

interface Props {
  catalog: CatalogEntry[];
  filters: FiltersState;
  setFilters: (f: FiltersState) => void;
  sortAsc: boolean;
  setSortAsc: (v: boolean) => void;
  onClearAll: () => void;
}

/* ── constants ─────────────────────────────────────── */
const GENDERS = ["Male", "Female", "Unknown"] as const;
const AGES = ["Adult", "Juvenile", "Yearling", "Unknown"] as const;

/* Optional helper map if you still want “Maui Nui → Maui / Molokai …” */
const populationIslandMap: Record<string, string[]> = {
  "Maui Nui": ["Maui", "Molokai", "Lanai", "Kahoolawe"],
  Kauai: ["Kauai", "Niihau"],
};

/* ── helpers ───────────────────────────────────────── */
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
  sortAsc,
  setSortAsc,
  onClearAll,
}: Props) {
  /* ── toggle / clear helpers ───────────────────────── */
  const toggle = (key: keyof FiltersState, value: string) => {
    const next = filters[key].includes(value)
      ? filters[key].filter((v) => v !== value)
      : [...filters[key], value];
    setFilters({ ...filters, [key]: next });
  };

  const clearKey = (key: keyof FiltersState) =>
    setFilters({ ...filters, [key]: [] });

  /* ── population options / counts ─────────────────── */
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

  /* ── island base (depends on population filter) ──── */
  const islandBase = useMemo(() => {
    if (filters.population.length === 1) {
      const pop = filters.population[0];
      /* If you rely on the helper map, use it; otherwise skip this block */
      if (populationIslandMap[pop]) {
        return catalog.filter((c) =>
          c.islands?.some((is) => populationIslandMap[pop].includes(is)),
        );
      }
    }
    /* generic filter: keep rows that share any selected population */
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

  /* ── sitelocation base (depends on island filter) ── */
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

  /* ── gender / age counts share siteBase ──────────── */
  const speciesCounts = useMemo(
    () => countSingles(siteBase, "species"),
    [siteBase],
  );
  const speciesOptions = useMemo(
    () => uniq<string>(siteBase.map((c) => c.species ?? "")),
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
    () => countSingles(siteBase, "species"),
    [siteBase],
  );
    () => uniq<string>(siteBase.map((c) => c.species ?? "")),
    [siteBase],
  );
  const ageCounts = useMemo(() => countSingles(siteBase, "age_class"), [siteBase]);

  /* ── menu generator ─────────────────────────────── */
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

  /* ── JSX  ────────────────────────────────────────── */
  return (
    <div className="bg-white shadow p-4 rounded border mb-4">
      {/* title row */}
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-medium">Filter Catalog Records by:</div>
        <Button variant="link" size="sm" onClick={onClearAll}>
          Clear All Filters
        </Button>
      </div>

      {/* dropdown row */}
      <div className="flex flex-wrap gap-2">
        {renderMenu("Population", "population", populationOptions, populationCounts)}
        {renderMenu("Island", "island", islandOptions, islandCounts)}
        {renderMenu("Species", "species", speciesOptions, speciesCounts)}
        {renderMenu("Location", "sitelocation", siteOptions, siteCounts)}
        {renderMenu("Gender", "gender", [...GENDERS], genderCounts)}
        {renderMenu("Age Class", "age_class", [...AGES], ageCounts)}
      </div>

      {/* sort row */}
      <div className="flex items-center text-sm text-gray-700 mt-3 gap-2">
        <span>Sort by Catalog&nbsp;ID</span>
        <Button
          size="icon"
          variant="ghost"
          className={sortAsc ? "text-blue-600" : ""}
          onClick={() => setSortAsc(true)}
        >
          ▲
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={!sortAsc ? "text-blue-600" : ""}
          onClick={() => setSortAsc(false)}
        >
          ▼
        </Button>
      </div>
    </div>
  );
}
