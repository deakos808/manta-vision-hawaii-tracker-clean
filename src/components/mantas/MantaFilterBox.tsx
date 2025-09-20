import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

type CountRow = { value: string; count: number };

interface Row {
  population: string | null;
  island: string | null;
  location: string | null;
  photographer: string | null;
}

interface Props {
  rows: Row[];
  population: string[];
  setPopulation: (v: string[]) => void;
  island: string[];
  setIsland: (v: string[]) => void;
  location: string[];
  setLocation: (v: string[]) => void;
  photographer: string[];
  setPhotographer: (v: string[]) => void;
  onClear: () => void;
}

export default function MantaFilterBox({
  rows,
  population,
  setPopulation,
  island,
  setIsland,
  location,
  setLocation,
  photographer,
  setPhotographer,
  onClear,
}: Props) {
  const [populations, setPopulations] = useState<CountRow[]>([]);
  const [islands, setIslands] = useState<CountRow[]>([]);
  const [locations, setLocations] = useState<CountRow[]>([]);
  const [photographers, setPhotographers] = useState<CountRow[]>([]);

  useEffect(() => {
    const countValues = (key: keyof Row): CountRow[] => {
      const map = new Map<string, number>();
      rows.forEach((row) => {
        const val = row[key];
        if (val) map.set(val, (map.get(val) ?? 0) + 1);
      });
      return [...map]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value));
    };

    setPopulations(countValues("population"));
    setIslands(countValues("island"));
    setLocations(countValues("location"));
    setPhotographers(countValues("photographer"));
  }, [rows]);

  const toggle = (
    value: string,
    selected: string[],
    set: (v: string[]) => void
  ) => {
    set(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  const Pill = ({
    label,
    active,
    children,
  }: {
    label: string;
    active: boolean;
    children: React.ReactNode;
  }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`text-sm ${active ? "border-sky-600 text-sky-700" : ""}`}
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-2" align="start">
        {children}
      </PopoverContent>
    </Popover>
  );

  const CheckboxList = (
    selected: string[],
    setSelected: (v: string[]) => void,
    options: CountRow[]
  ) => (
    <div className="space-y-1">
      {options.map((opt) => (
        <label
          key={opt.value}
          className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/50 text-sm cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selected.includes(opt.value)}
              onCheckedChange={() => toggle(opt.value, selected, setSelected)}
            />
            <span>{opt.value}</span>
          </div>
          <span className="text-xs text-muted-foreground">{opt.count}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm mb-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium text-muted-foreground">
          Filter Manta Records by:
        </div>
        <Button variant="link" size="sm" className="px-0" onClick={onClear}>
          Clear All Filters
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Pill
          label={`Population${population.length ? ` (${population.length})` : ""}`}
          active={population.length > 0}
        >
          {CheckboxList(population, setPopulation, populations)}
        </Pill>

        <Pill
          label={`Island${island.length ? ` (${island.length})` : ""}`}
          active={island.length > 0}
        >
          {CheckboxList(island, setIsland, islands)}
        </Pill>

        <Pill
          label={`Location${location.length ? ` (${location.length})` : ""}`}
          active={location.length > 0}
        >
          {CheckboxList(location, setLocation, locations)}
        </Pill>

        <Pill
          label={`Photographer${photographer.length ? ` (${photographer.length})` : ""}`}
          active={photographer.length > 0}
        >
          {CheckboxList(photographer, setPhotographer, photographers)}
        </Pill>
      </div>
    </div>
  );
}
