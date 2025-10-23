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
  species?: string[];
}

interface PhotoRow {
  population?: string | null;
  island?: string | null;
  location?: string | null;
  photo_view?: "ventral" | "dorsal" | "other" | string | null;
  species?: string | null;
}

interface Props {
  rows?: PhotoRow[];                      // FULL photo dataset for accurate bases + counts
  filters: FiltersState;
  setFilters: (f: FiltersState) => void;

  sortAsc: boolean;                       // true = oldest first (asc), false = newest first (desc)
  setSortAsc: (v: boolean) => void;

  onClearAll: () => void;

  search: string;
  setSearch: (v: string) => void;
  hideSearch?: boolean;

  // Sightings-derived menus (options only)
  islandOptionsAll?: string[];
  locationsByIsland?: Record<string, string[]>;

  // Catalog species options (optional)
  speciesOptionsAll?: string[];
}

const VIEW_TYPES = ["ventral", "dorsal", "other"] as const;
const POPULATIONS = ["Big Island", "Maui Nui", "Oahu", "Kauai"] as const;
const FLAGS = [
  { key: "best_catalog", label: "Best Catalog Ventral" },
  { key: "best_manta",   label: "Best Manta Ventral"   },
];

const norm = (v?: string | null) => (v ?? "").toString().trim();
const uniq = (arr: (string | null | undefined)[]) =>
  Array.from(new Set(arr.map(norm).filter(Boolean))) as string[];

/** Catalog-style tally that returns an array aligned to `options` if provided. */
function tallyBase<T extends PhotoRow>(
  rows: T[],
  pick: (r: T) => string,
  options?: string[]
): { value: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = pick(r);
    if (!k) continue;
    map.set(k, (map.get(k) || 0) + 1);
  }
  if (options && options.length) {
    return options.map(v => ({ value: v, count: map.get(v) || 0 }));
  }
  return Array.from(map, ([value, count]) => ({ value, count })).sort((a,b)=>a.value.localeCompare(b.value));
}

export default function PhotoFilterBox({
  rows,
  filters,
  setFilters,
  sortAsc,
  setSortAsc,
  onClearAll,
  search,
  setSearch,
  hideSearch = false,
  islandOptionsAll,
  locationsByIsland,
  speciesOptionsAll,
}: Props) {
  // FULL photo dataset (unfiltered) for computing bases + counts
  const all = useMemo<PhotoRow[]>(
    () => (rows ?? []).filter(r => r && typeof r === "object"),
    [rows]
  );

  // -------- Population (global base) --------
  const populationOptions = [...POPULATIONS];
  const populationCounts  = useMemo(
    () => tallyBase(all, r => norm(r.population), populationOptions),
    [all]
  );

  // -------- Island base (depends on selected Population) --------
  const islandBase = useMemo(() => {
    if (!filters.population?.length) return all;
    const want = new Set(filters.population.map(norm));
    return all.filter(r => want.has(norm(r.population)));
  }, [all, filters.population]);

  const islandOptions = useMemo(
    () => (islandOptionsAll?.length ? islandOptionsAll : uniq(islandBase.map(r => r.island))),
    [islandOptionsAll, islandBase]
  );
  const islandCounts  = useMemo(
    () => tallyBase(islandBase, r => norm(r.island), islandOptions),
    [islandBase, islandOptions]
  );

  // -------- Location base (depends on selected Island) --------
  const locationBase = useMemo(() => {
    if (!filters.island?.length) return islandBase;
    const want = new Set(filters.island.map(norm));
    return islandBase.filter(r => want.has(norm(r.island)));
  }, [islandBase, filters.island]);

  const locationOptions = useMemo(() => {
    if (locationsByIsland && Object.keys(locationsByIsland).length) {
      if (filters.island?.length) {
        const set = new Set<string>();
        for (const isl of filters.island) (locationsByIsland[isl] ?? []).forEach(loc => set.add(loc));
        return Array.from(set).sort((a,b)=>a.localeCompare(b));
      }
      const set = new Set<string>();
      Object.values(locationsByIsland).forEach(arr => arr?.forEach(v => v && set.add(v)));
      return Array.from(set).sort((a,b)=>a.localeCompare(b));
    }
    return uniq(locationBase.map(r => r.location));
  }, [locationsByIsland, filters.island, locationBase]);

  const locationCounts = useMemo(
    () => tallyBase(locationBase, r => norm(r.location), locationOptions),
    [locationBase, locationOptions]
  );

  // -------- Species (optional) --------
  const speciesOptions = useMemo(() => (speciesOptionsAll ?? []), [speciesOptionsAll]);
  const speciesBase    = useMemo(() => {
    // Scope species base like islandBase -> locationBase if desired; for now use islandBase
    return islandBase;
  }, [islandBase]);
  const speciesCounts  = useMemo(
    () => tallyBase(speciesBase, r => norm((r as any).species), speciesOptions.length ? speciesOptions : undefined),
    [speciesBase, speciesOptions]
  );

  // -------- View (global base) --------
  const viewCounts = useMemo(
    () => tallyBase(all, r => norm(r.photo_view), [...VIEW_TYPES]),
    [all]
  );

  // -------- helpers --------
  const toggle = (key: keyof FiltersState, value: string) => {
    const cur = filters[key] ?? [];
    const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
    setFilters({ ...filters, [key]: next });
  };
  const clearKey = (key: keyof FiltersState) =>
    setFilters({ ...filters, [key]: [] });

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
          {(filters[key] ?? []).length > 0 && <span className="ml-1">({(filters[key] ?? []).length})</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2 space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="font-medium text-sm">{label}</span>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => clearKey(key)}>
            All
          </Button>
        </div>
        {options.map(opt => {
          const cnt = counts.find(c => c.value === opt)?.count ?? 0;
          return (
            <label key={opt} className="flex items-center justify-between gap-2 p-1 rounded hover:bg-muted/50 text-sm">
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
        {options.length === 0 && <div className="text-xs text-muted-foreground">— none —</div>}
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="bg-white shadow p-4 rounded border mb-4">
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-medium">Filter Photos</div>
        <Button variant="link" size="sm" onClick={onClearAll}>Clear All Filters</Button>
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
        {speciesOptions.length > 0 && renderMenu("Species", "species" as keyof FiltersState, speciesOptions, speciesCounts)}
        {renderMenu("Population", "population", populationOptions, populationCounts)}
        {renderMenu("Island", "island", islandOptions, islandCounts)}
        {renderMenu("Location", "location", locationOptions, locationCounts)}
        {renderMenu("View Type", "view", [...VIEW_TYPES], viewCounts)}

        {/* Flags */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="text-sm">
              Flags{(filters.flag ?? []).length > 0 && <span className="ml-1">({(filters.flag ?? []).length})</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-2 space-y-2">
            {FLAGS.map((f) => (
              <label key={f.key} className="flex items-center gap-2 p-1 rounded hover:bg-muted/50 text-sm">
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

      {/* Sort row (inside filter box, below pills — catalog style) */}
      <div className="flex items-center text-sm text-gray-700 mt-3 gap-2">
        <span>Sort by Photo&nbsp;ID</span>
        <Button variant="ghost" size="icon" className={sortAsc ? "" : "text-blue-600"} onClick={() => setSortAsc(false)}>▲</Button>
        <Button variant="ghost" size="icon" className={sortAsc ? "text-blue-600" : ""} onClick={() => setSortAsc(true)}>▼</Button>
      </div>
    </div>
  );
}
