import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp } from "lucide-react";

interface FiltersState {
  population: string[];
  island: string[];
  location: string[];
  view: string[];
  flag: string[];
}
interface PillOption { value: string; count: number }
interface Props {
  rows?: any[];
  filters: FiltersState;
  setFilters: (f: FiltersState) => void;
  sortAsc: boolean;
  setSortAsc: (v: boolean) => void;
  onClearAll: () => void;
  search: string;
  setSearch: (v: string) => void;
  populationCounts: PillOption[];
  islandCounts: PillOption[];
  locationCounts: PillOption[];
  viewCounts: PillOption[];
}

const FLAGS = [
  { key: "best_catalog", label: "Best Catalog Ventral" },
  { key: "best_manta", label: "Best Manta Ventral" },
];

export default function PhotoFilterBox({
  rows,
  filters,
  setFilters,
  sortAsc,
  setSortAsc,
  onClearAll,
  search,
  setSearch,
  populationCounts,
  islandCounts,
  locationCounts,
  viewCounts,
}: Props) {
  // Always work with a fully defined array of objects:
  const validRows = useMemo(
    () => (rows ?? []).filter(r => r && typeof r === "object"),
    [rows]
  );

  // --- toggle logic ---
  const toggle = (key: keyof FiltersState, value: string) => {
    const next = filters[key].includes(value)
      ? filters[key].filter((v) => v !== value)
      : [...filters[key], value];
    setFilters({ ...filters, [key]: next });
  };

  const clearKey = (key: keyof FiltersState) =>
    setFilters({ ...filters, [key]: [] });

  // --- Menu generators from static props ---
  const renderMenu = (
    label: string,
    key: keyof FiltersState,
    options: PillOption[]
  ) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="text-sm">
          {label}
          {filters[key].length > 0 && (
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
            key={opt.value}
            className="flex items-center justify-between gap-2 p-1 rounded hover:bg-muted/50 text-sm"
          >
            <div className="flex items-center gap-2">
              <Checkbox
                checked={filters[key].includes(opt.value)}
                onCheckedChange={() => toggle(key, opt.value)}
              />
              {opt.value}
            </div>
            <span className="text-xs text-muted-foreground">{opt.count}</span>
          </label>
        ))}
        {options.length === 0 && (
          <div className="text-xs text-muted-foreground">— none —</div>
        )}
      </PopoverContent>
    </Popover>
  );

  // --- JSX ---
  return (
    <div className="bg-white shadow p-4 rounded border mb-4">
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-medium">Filter Photos</div>
        <Button variant="link" size="sm" onClick={onClearAll}>
          Clear All Filters
        </Button>
      </div>
      <Input
        className="mb-3 text-sm"
        placeholder="Search by photo ID, catalog ID, name, or photographer…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {renderMenu("Population", "population", populationCounts)}
        {renderMenu("Island", "island", islandCounts)}
        {renderMenu("Location", "location", locationCounts)}
        {renderMenu("View Type", "view", viewCounts)}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="text-sm">
              Flags
              {filters.flag.length > 0 && (
                <span className="ml-1">({filters.flag.length})</span>
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
                  checked={filters.flag.includes(f.key)}
                  onCheckedChange={() => toggle("flag", f.key)}
                />
                {f.label}
              </label>
            ))}
            {FLAGS.length === 0 && (
              <div className="text-xs text-muted-foreground">— none —</div>
            )}
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm">Sort by Photo ID:</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSortAsc(true)}
            aria-label="Sort Asc"
          >
            <ChevronUp size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSortAsc(false)}
            aria-label="Sort Desc"
          >
            <ChevronDown size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
