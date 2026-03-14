import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

export interface FiltersState {
  population: string[];
  island: string[];
  location: string[];
  view: string[];
  flag: string[];
  mprf: string[];
  species?: string[];
}

interface PhotoRow {
  population?: string | null;
  island?: string | null;
  location?: string | null;
  photo_view?: "ventral" | "dorsal" | "other" | string | null;
  species?: string | null;
  mprf?: string | null;
}

interface Props {
  showHamrFilter?: boolean;
  hamrLabel?: string;
  rows?: PhotoRow[];
  filters: FiltersState;
  setFilters: (f: FiltersState) => void;
  sortAsc: boolean;
  setSortAsc: (v: boolean) => void;
  onClearAll: () => void;
  search: string;
  setSearch: (v: string) => void;
  photoIdPrefix: string;
  setPhotoIdPrefix: (v: string) => void;
  hideSearch?: boolean;
  catalogPrefix: string;
  setCatalogPrefix: (v: string) => void;
  namePrefix: string;
  setNamePrefix: (v: string) => void;
  islandOptionsAll?: string[];
  locationsByIsland?: Record<string, string[]>;
  speciesOptionsAll?: string[];
}

const VIEW_TYPES = ["ventral", "dorsal", "other"] as const;
const POPULATIONS = ["Big Island", "Maui Nui", "Oahu", "Kauai"] as const;
const HAMER_OPTIONS = ["HAMER", "Non-HAMER"] as const;
const FLAGS = [
  { key: "best_catalog", label: "Best Catalog Ventral" },
  { key: "best_manta", label: "Best Manta Ventral" },
];

const norm = (v?: string | null) => (v ?? "").toString().trim();
const uniq = (arr: (string | null | undefined)[]) =>
  Array.from(new Set(arr.map(norm).filter(Boolean))) as string[];

function tallyBase<T extends PhotoRow>(
  rows: T[],
  pick: (r: T) => string,
  options?: string[],
): { value: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = pick(r);
    if (!k) continue;
    map.set(k, (map.get(k) || 0) + 1);
  }
  if (options && options.length) {
    return options.map((v) => ({ value: v, count: map.get(v) || 0 }));
  }
  return Array.from(map, ([value, count]) => ({ value, count })).sort((a, b) =>
    a.value.localeCompare(b.value),
  );
}

export default function PhotoFilterBox({
  showHamrFilter = true,
  hamrLabel = "HAMER",
  rows,
  filters,
  setFilters,
  sortAsc,
  setSortAsc,
  onClearAll,
  search,
  setSearch,
  photoIdPrefix,
  setPhotoIdPrefix,
  hideSearch = false,
  catalogPrefix,
  setCatalogPrefix,
  namePrefix,
  setNamePrefix,
  islandOptionsAll,
  locationsByIsland,
  speciesOptionsAll,
}: Props) {
  const all = useMemo<PhotoRow[]>(
    () => (rows ?? []).filter((r) => r && typeof r === "object"),
    [rows],
  );

  const populationOptions = [...POPULATIONS];
  const populationCounts = useMemo(
    () => tallyBase(all, (r) => norm(r.population), populationOptions),
    [all],
  );

  const islandBase = useMemo(() => {
    if (!filters.population?.length) return all;
    const want = new Set(filters.population.map(norm));
    return all.filter((r) => want.has(norm(r.population)));
  }, [all, filters.population]);

  const islandOptions = useMemo(
    () =>
      islandOptionsAll?.length
        ? islandOptionsAll
        : uniq(islandBase.map((r) => r.island)),
    [islandOptionsAll, islandBase],
  );

  const islandCounts = useMemo(
    () => tallyBase(islandBase, (r) => norm(r.island), islandOptions),
    [islandBase, islandOptions],
  );

  const locationBase = useMemo(() => {
    if (!filters.island?.length) return islandBase;
    const want = new Set(filters.island.map(norm));
    return islandBase.filter((r) => want.has(norm(r.island)));
  }, [islandBase, filters.island]);

  const locationOptions = useMemo(() => {
    if (locationsByIsland && Object.keys(locationsByIsland).length) {
      if (filters.island?.length) {
        const set = new Set<string>();
        for (const isl of filters.island) {
          (locationsByIsland[isl] ?? []).forEach((loc) => set.add(loc));
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b));
      }
      const set = new Set<string>();
      Object.values(locationsByIsland).forEach((arr) =>
        arr?.forEach((v) => v && set.add(v)),
      );
      return Array.from(set).sort((a, b) => a.localeCompare(b));
    }
    return uniq(locationBase.map((r) => r.location));
  }, [locationsByIsland, filters.island, locationBase]);

  const locationCounts = useMemo(
    () => tallyBase(locationBase, (r) => norm(r.location), locationOptions),
    [locationBase, locationOptions],
  );

  const speciesOptions = useMemo(() => speciesOptionsAll ?? [], [speciesOptionsAll]);
  const speciesBase = useMemo(() => islandBase, [islandBase]);
  const speciesCounts = useMemo(
    () =>
      tallyBase(
        speciesBase,
        (r) => norm((r as any).species),
        speciesOptions.length ? speciesOptions : undefined,
      ),
    [speciesBase, speciesOptions],
  );

  const viewCounts = useMemo(
    () => tallyBase(all, (r) => norm(r.photo_view), [...VIEW_TYPES]),
    [all],
  );

  const mprfCounts = useMemo(
    () => tallyBase(all, (r) => norm(r.mprf), [...HAMER_OPTIONS]),
    [all],
  );

  const toggle = (key: keyof FiltersState, value: string) => {
    const cur = filters[key] ?? [];
    const next = cur.includes(value)
      ? cur.filter((v) => v !== value)
      : [...cur, value];
    setFilters({ ...filters, [key]: next });
  };

  const clearKey = (key: keyof FiltersState) => {
    setFilters({ ...filters, [key]: [] });
  };

  const renderMenu = (
    label: string,
    key: keyof FiltersState,
    options: string[],
    counts: { value: string; count: number }[],
  ) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="text-sm">
          {label}
          {(filters[key] ?? []).length > 0 && (
            <span className="ml-1">({(filters[key] ?? []).length})</span>
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
        {options.map((opt) => {
          const cnt = counts.find((c) => c.value === opt)?.count ?? 0;
          return (
            <label
              key={opt}
              className="flex items-center justify-between gap-2 p-1 rounded hover:bg-muted/50 text-sm"
            >
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={(filters[key] ?? []).includes(opt)}
                  onCheckedChange={() => toggle(key, opt)}
                />
                {opt}
              </div>
              <span className="text-xs text-muted-foreground">{cnt}</span>
            </label>
          );
        })}
        {options.length === 0 && (
          <div className="text-xs text-muted-foreground">— none —</div>
        )}
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="bg-white shadow p-4 rounded border mb-4">
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-medium">Filter Photos</div>
        <Button variant="link" size="sm" onClick={onClearAll}>
          Clear All Filters
        </Button>
      </div>

      {!hideSearch && (
        <Input
          className="mb-3 text-sm bg-white max-w-md"
          placeholder="Search by photo ID, catalog ID, name, or photographer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {speciesOptions.length > 0 &&
          renderMenu("Species", "species" as keyof FiltersState, speciesOptions, speciesCounts)}
        {renderMenu("Population", "population", populationOptions, populationCounts)}
        {renderMenu("Island", "island", islandOptions, islandCounts)}
        {renderMenu("Location", "location", locationOptions, locationCounts)}
        {renderMenu("View Type", "view", [...VIEW_TYPES], viewCounts)}
        {showHamrFilter ? renderMenu(hamrLabel, "mprf", [...HAMER_OPTIONS], mprfCounts) : null}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="text-sm">
              Flags
              {(filters.flag ?? []).length > 0 && (
                <span className="ml-1">({(filters.flag ?? []).length})</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-2 space-y-2">
            {FLAGS.map((f) => (
              <label
                key={f.key}
                className="flex items-center gap-2 p-1 rounded hover:bg-muted/50 text-sm"
              >
                <Checkbox
                  checked={(filters.flag ?? []).includes(f.key)}
                  onCheckedChange={() => toggle("flag", f.key)}
                />
                {f.label}
              </label>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
        <div>
          <div className="text-xs text-gray-600 mb-1">Photo ID (starts with)</div>
          <Input
            value={photoIdPrefix}
            onChange={(e) => setPhotoIdPrefix(e.target.value)}
            placeholder="e.g., 73..."
            className="bg-white text-sm"
          />
        </div>
        <div>
          <div className="text-xs text-gray-600 mb-1">Catalog ID (starts with)</div>
          <Input
            value={catalogPrefix}
            onChange={(e) => setCatalogPrefix(e.target.value)}
            placeholder="e.g., 12..."
            className="bg-white text-sm"
          />
        </div>
        <div>
          <div className="text-xs text-gray-600 mb-1">Name (starts with)</div>
          <Input
            value={namePrefix}
            onChange={(e) => setNamePrefix(e.target.value)}
            placeholder="e.g., Ta..."
            className="bg-white text-sm"
          />
        </div>
      </div>

      <div className="flex items-center text-sm text-gray-700 mt-3 gap-2">
        <span>Sort by Photo&nbsp;ID</span>
        <Button
          variant="ghost"
          size="icon"
          className={sortAsc ? "" : "text-blue-600"}
          onClick={() => setSortAsc(false)}
        >
          ▲
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={sortAsc ? "text-blue-600" : ""}
          onClick={() => setSortAsc(true)}
        >
          ▼
        </Button>
      </div>
    </div>
  );
}
