// File: src/components/sightings/SightingFilterBox.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

/*──────── helpers ────────*/
type CountRow = { value: string; count: number };
const fetchCounts = async (column: string): Promise<CountRow[]> => {
  const { data } = await supabase
    .from("sightings")
    .select(column)
    .neq(column, null);
  const map = new Map<string, number>();
  (data ?? []).forEach((row: any) => {
    const val = row[column] as string;
    map.set(val, (map.get(val) ?? 0) + 1);
  });
  return [...map]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
};

/*──────── props ────────*/
interface Props {
  island: string;
  setIsland: (v: string) => void;
  photographer: string;
  setPhotographer: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  population: string;
  setPopulation: (v: string) => void;
  minMantas: number | "";
  setMinMantas: (v: number | "") => void;
  date: string;
  setDate: (v: string) => void;
  onClear: () => void;
}

/*──────── component ─────*/
export default function SightingFilterBox({
  island,
  setIsland,
  photographer,
  setPhotographer,
  location,
  setLocation,
  population,
  setPopulation,
  minMantas,
  setMinMantas,
  date,
  setDate,
  onClear,
}: Props) {
  /* distinct lists */
  const [islands, setIslands] = useState<CountRow[]>([]);
  const [locations, setLocations] = useState<CountRow[]>([]);
  const [populations, setPopulations] = useState<CountRow[]>([]);
  const [photographers, setPhotographers] = useState<CountRow[]>([]);

  useEffect(() => {
    fetchCounts("island").then(setIslands);
    fetchCounts("sitelocation").then(setLocations);
    fetchCounts("population").then(setPopulations);
    fetchCounts("photographer").then(setPhotographers);
  }, []);

  /* pill component */
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
          className={`text-sm ${active ? "border-blue-600 text-blue-600" : ""}`}
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-2" align="start">
        {children}
      </PopoverContent>
    </Popover>
  );

  const RadioList = (
    current: string,
    setCurrent: (v: string) => void,
    rows: CountRow[],
  ) =>
    rows.map((r) => (
      <label
        key={r.value}
        className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/50 text-sm cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Checkbox
            checked={current === r.value}
            onCheckedChange={() =>
              setCurrent(r.value === current ? "" : r.value)
            }
          />
          {r.value}
        </div>
        <span className="text-xs text-muted-foreground">{r.count}</span>
      </label>
    ));

  /*──────── JSX ────────*/
  return (
    <div className="bg-white shadow p-4 rounded border">
      {/* title row */}
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-medium">Filter Sighting Records by:</div>
        <Button variant="link" size="sm" onClick={onClear}>
          Clear All Filters
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Date */}
        <Pill label={`Date${date ? `: ${date}` : ""}`} active={!!date}>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {date && (
            <Button size="sm" className="mt-2" onClick={() => setDate("")}>
              Clear
            </Button>
          )}
        </Pill>

        {/* Population */}
        <Pill
          label={`Population${population ? `: ${population}` : ""}`}
          active={!!population}
        >
          {RadioList(population, setPopulation, populations)}
        </Pill>

        {/* Island */}
        <Pill
          label={`Island${island && island !== "all" ? `: ${island}` : ""}`}
          active={!!island && island !== "all"}
        >
          {RadioList(island, setIsland, islands)}
        </Pill>

        {/* Location */}
        <Pill
          label={`Location${location ? `: ${location}` : ""}`}
          active={!!location}
        >
          {RadioList(location, setLocation, locations)}
        </Pill>

        {/* Photographer */}
        <Pill
          label={`Photographer${photographer ? `: ${photographer}` : ""}`}
          active={!!photographer}
        >
          {RadioList(photographer, setPhotographer, photographers)}
        </Pill>

        {/* ≥ Mantas */}
        <Pill
          label={minMantas === "" ? "≥ Mantas" : `≥ ${minMantas}`}
          active={minMantas !== ""}
        >
          <Input
            type="number"
            min={0}
            value={minMantas}
            onChange={(e) =>
              setMinMantas(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
          {minMantas !== "" && (
            <Button
              size="sm"
              className="mt-2"
              onClick={() => setMinMantas("")}
            >
              Clear
            </Button>
          )}
        </Pill>
      </div>
    </div>
  );
}
