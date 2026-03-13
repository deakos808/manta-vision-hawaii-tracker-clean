import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

type CountRow = { value: string; count: number };

interface Row {
  population: string | null;
  island: string | null;
  location: string | null;
  photographer: string | null;
  gender: string | null;
  age_class: string | null;
  mprf: string | null;
}

interface Props {
  rows: Row[];
  namePrefix: string;
  setNamePrefix: (v: string) => void;
  catalogPrefix: string;
  setCatalogPrefix: (v: string) => void;
  population: string[];
  setPopulation: (v: string[]) => void;
  island: string[];
  setIsland: (v: string[]) => void;
  location: string[];
  setLocation: (v: string[]) => void;
  photographer: string[];
  setPhotographer: (v: string[]) => void;
  gender: string[];
  setGender: (v: string[]) => void;
  ageClass: string[];
  setAgeClass: (v: string[]) => void;
  mprf: string[];
  setMprf: (v: string[]) => void;
  onClear: () => void;
  onOpenStats: () => void;
}

const uniq = <T,>(arr: (T | null | undefined)[]) =>
  [...new Set(arr.filter(Boolean) as T[])];

const countSingles = (rows: Row[], field: keyof Row) => {
  const map: Record<string, number> = {};
  rows.forEach((r) => {
    const val = (r[field] ?? "") as string;
    if (!val) return;
    map[val] = (map[val] || 0) + 1;
  });
  return map;
};

export default function MantaFilterBox({
  rows,
  mantaIdPrefix,
  setMantaIdPrefix,
  namePrefix,
  setNamePrefix,
  catalogPrefix,
  setCatalogPrefix,
  population,
  setPopulation,
  island,
  setIsland,
  location,
  setLocation,
  photographer,
  setPhotographer,
  gender,
  setGender,
  ageClass,
  setAgeClass,
  mprf,
  setMprf,
  onClear,
  onOpenStats,
}: Props) {
  const toggle = (selected: string[], setSelected: (v: string[]) => void, value: string) => {
    setSelected(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  const clearOne = (selected: string[], setSelected: (v: string[]) => void) => {
    if (selected.length) setSelected([]);
  };

  const populationCounts = useMemo(() => countSingles(rows, "population"), [rows]);
  const populationOptions = useMemo(() => uniq(rows.map((r) => r.population)), [rows]);

  const islandBase = useMemo(() => {
    return population.length
      ? rows.filter((r) => r.population && population.includes(r.population))
      : rows;
  }, [rows, population]);

  const islandCounts = useMemo(() => countSingles(islandBase, "island"), [islandBase]);
  const islandOptions = useMemo(() => uniq(islandBase.map((r) => r.island)), [islandBase]);

  const siteBase = useMemo(() => {
    return island.length
      ? islandBase.filter((r) => r.island && island.includes(r.island))
      : islandBase;
  }, [islandBase, island]);

  const locationCounts = useMemo(() => countSingles(siteBase, "location"), [siteBase]);
  const locationOptions = useMemo(() => uniq(siteBase.map((r) => r.location)), [siteBase]);

  const photographerCounts = useMemo(() => countSingles(siteBase, "photographer"), [siteBase]);
  const photographerOptions = useMemo(() => uniq(siteBase.map((r) => r.photographer)), [siteBase]);

  const genderCounts = useMemo(() => countSingles(siteBase, "gender"), [siteBase]);
  const genderOptions = useMemo(() => uniq(siteBase.map((r) => r.gender)), [siteBase]);

  const ageCounts = useMemo(() => countSingles(siteBase, "age_class"), [siteBase]);
  const ageOptions = useMemo(() => uniq(siteBase.map((r) => r.age_class)), [siteBase]);

  const mprfCounts = useMemo(() => countSingles(siteBase, "mprf"), [siteBase]);
  const mprfOptions = useMemo(() => uniq(siteBase.map((r) => r.mprf)), [siteBase]);

  const renderMenu = (
    label: string,
    selected: string[],
    setSelected: (v: string[]) => void,
    options: string[],
    counts: Record<string, number>
  ) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="text-sm">
          {label}
          {selected.length > 0 && <span className="ml-1">({selected.length})</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2 space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="font-medium text-sm">{label}</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => clearOne(selected, setSelected)}
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
                checked={selected.includes(opt)}
                onCheckedChange={() => toggle(selected, setSelected, opt)}
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
    <div className="rounded-xl border bg-white p-4 shadow-sm mb-4">
      <div className="mb-3 grid grid-cols-3 items-center">
        <div className="text-sm font-medium text-blue-700">
          Filter Manta Records by:
        </div>

        <div />

        <div className="flex justify-end items-center gap-3">
          <button
            className="text-xs text-blue-700 underline"
            onClick={onClear}
          >
            Clear All Filters
          </button>
          <button
            className="px-3 py-1 rounded border bg-white shadow-sm text-xs text-blue-700 hover:bg-blue-50"
            onClick={onOpenStats}
          >
            Mantas Stats
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {renderMenu("Population", population, setPopulation, populationOptions, populationCounts)}
        {renderMenu("Island", island, setIsland, islandOptions, islandCounts)}
        {renderMenu("Location", location, setLocation, locationOptions, locationCounts)}
        {renderMenu("Photographer", photographer, setPhotographer, photographerOptions, photographerCounts)}
        {renderMenu("Gender", gender, setGender, genderOptions, genderCounts)}
        {renderMenu("Age Class", ageClass, setAgeClass, ageOptions, ageCounts)}
        {renderMenu("MPRF", mprf, setMprf, mprfOptions, mprfCounts)}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 w-full">
        <div className="w-[220px]">
          <div className="text-xs text-gray-600 mb-1">Manta ID (starts with)</div>
          <input
            value={mantaIdPrefix}
            onChange={(e) => setMantaIdPrefix(e.target.value)}
            placeholder="e.g., 73..."
            className="border rounded-lg px-3 py-2 w-full bg-white text-sm"
          />
        </div>
        <div className="w-[220px]">
          <div className="text-xs text-gray-600 mb-1">Catalog ID (starts with)</div>
          <input
            value={catalogPrefix}
            onChange={(e) => setCatalogPrefix(e.target.value)}
            placeholder="e.g., 12..."
            className="border rounded-lg px-3 py-2 w-full bg-white text-sm"
          />
        </div>

        <div className="w-[220px]">
          <div className="text-xs text-gray-600 mb-1">Name (starts with)</div>
          <input
            value={namePrefix}
            onChange={(e) => setNamePrefix(e.target.value)}
            placeholder="e.g., Ta..."
            className="border rounded-lg px-3 py-2 w-full bg-white text-sm"
          />
        </div>
      </div>
    </div>
  );
}
