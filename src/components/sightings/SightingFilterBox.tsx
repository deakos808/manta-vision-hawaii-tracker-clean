// File: src/components/sightings/SightingFilterBox.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

type CountRow = { value: string; count: number };

const POP_ISLANDS: Record<string, string[]> = {
  "Maui Nui": ["Maui", "Molokai", "Lanai", "Kahoolawe"],
  "Oahu": ["Oahu"],
  "Kauai": ["Kauai", "Niihau"],
  "Big Island": ["Big Island", "Hawaii", "Hawaiʻi"],
};

interface Props {
  island: string; setIsland: (v: string) => void;
  photographer: string; setPhotographer: (v: string) => void;
  location: string; setLocation: (v: string) => void;
  population: string; setPopulation: (v: string) => void;
  minMantas: number | ""; setMinMantas: (v: number | "") => void;
  date: string; setDate: (v: string) => void;
  onClear: () => void;
  isAdmin?: boolean;

  // NEW: species selection
  species: string; setSpecies: (v: string) => void;
}

type Filters = Pick<Props, "population" | "island" | "location" | "photographer" | "minMantas" | "date" | "species">;

function rowMatch(r: any, f: Filters, speciesBySighting: Map<number, Set<string>>): boolean {
  const pop = (r.population ?? "").toString();
  const isl = (r.island ?? "").toString();
  const loc = (r.sitelocation ?? "").toString();
  const pho = (r.photographer ?? "").toString();
  const tm  = Number(r.total_mantas ?? 0);
  const dt  = (r.sighting_date ?? "").toString();
  if (f.population && !pop.toLowerCase().includes(f.population.toLowerCase())) return false;
  if (f.island && f.island !== "all" && !isl.toLowerCase().includes(f.island.toLowerCase())) return false;
  if (f.location && loc !== f.location) return false;
  if (f.photographer && !pho.toLowerCase().includes(f.photographer.toLowerCase())) return false;
  if (f.minMantas !== "" && !(tm >= Number(f.minMantas))) return false;
  if (f.date && dt !== f.date) return false;
  if (f.species) {
    const set = speciesBySighting.get(Number(r.pk_sighting_id)) ?? new Set();
    // includes if ANY manta in the sighting matches species filter
    const has = Array.from(set).some(s => s.toLowerCase().includes(f.species!.toLowerCase()));
    if (!has) return false;
  }
  return true;
}

export default function SightingFilterBox(props: Props) {
  const {
    island, setIsland,
    photographer, setPhotographer,
    location, setLocation,
    population, setPopulation,
    minMantas, setMinMantas,
    date, setDate,
    onClear,
    isAdmin = false,
    species, setSpecies,
  } = props;

  const filters: Filters = { population, island, location, photographer, minMantas, date, species };

  // 1) fetch current found set rows under filters (include pk_sighting_id for species join)
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      let q = supabase
        .from("sightings")
        .select("pk_sighting_id,population,island,sitelocation,photographer,total_mantas,sighting_date");

      if (population) q = q.ilike("population", `%${population}%`);
      if (island && island !== "all") q = q.ilike("island", `%${island}%`);
      if (location) q = q.eq("sitelocation", location);
      if (photographer) q = q.ilike("photographer", `%${photographer}%`);
      if (minMantas !== "") q = q.gte("total_mantas", minMantas as any);
      if (date) q = q.eq("sighting_date", date);

      // Note: DO NOT apply species here; we need the found set to compute options.
      // Paging to fetch all
      const pageSz = 1000;
      const acc: any[] = [];
      for (let from = 0; from < 50000; from += pageSz) {
        const { data, error } = await q.order("pk_sighting_id", { ascending: true }).range(from, from + pageSz - 1);
        if (!alive) return;
        if (error) { console.error("[filters] fetch err", error); break; }
        const chunk = data ?? [];
        acc.push(...chunk);
        if (chunk.length < pageSz) break;
      }
      if (alive) setRows(acc);
    })();
    return () => { alive = false; };
  }, [population, island, location, photographer, minMantas, date]);

  // 2) load species per sighting via mantas → catalog(species)
  const [speciesMap, setSpeciesMap] = useState<Map<number, Set<string>>>(new Map());
  useEffect(() => {
    let alive = true;
    (async () => {
      const ids = rows.map(r => Number(r.pk_sighting_id)).filter(Boolean);
      const pageSz = 1000;
      const map = new Map<number, Set<string>>();
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const { data, error } = await supabase
          .from("mantas")
          .select("fk_sighting_id,catalog:fk_catalog_id(species)")
          .in("fk_sighting_id", chunk);
        if (!alive) return;
        if (error) { console.error("[species join] err", error); continue; }
        for (const r of data ?? []) {
          const s = (r?.catalog?.species ?? "").toString().trim();
          const sid = Number(r?.fk_sighting_id ?? 0);
          if (!s || !sid) continue;
          if (!map.has(sid)) map.set(sid, new Set());
          map.get(sid)!.add(s);
        }
      }
      if (alive) setSpeciesMap(map);
    })();
    return () => { alive = false; };
  }, [rows]);

  // 3) distinct values in current found set
  const values = useMemo(() => {
    const P = new Set<string>(), I = new Set<string>(), L = new Set<string>(), H = new Set<string>(), S = new Set<string>();
    for (const r of rows) {
      const p = (r.population ?? "").toString().trim();
      const i = (r.island ?? "").toString().trim();
      const l = (r.sitelocation ?? "").toString().trim();
      const h = (r.photographer ?? "").toString().trim();
      if (p) P.add(p); if (i) I.add(i); if (l) L.add(l); if (h) H.add(h);
      const ss = speciesMap.get(Number(r.pk_sighting_id));
      if (ss) ss.forEach(v => { if (v) S.add(v); });
    }
    return {
      populations: [...P].sort((a,b)=>a.localeCompare(b)),
      islands:     [...I].sort((a,b)=>a.localeCompare(b)),
      locations:   [...L].sort((a,b)=>a.localeCompare(b)),
      photographers: [...H].sort((a,b)=>a.localeCompare(b)),
      species:     [...S].sort((a,b)=>a.localeCompare(b)),
    };
  }, [rows, speciesMap]);

  // 4) cascade
  const cascadedIslands = useMemo(() => {
    if (!population) return values.islands;
    const allowed = POP_ISLANDS[population] ?? [];
    return values.islands.filter(v => allowed.includes(v));
  }, [values.islands, population]);
  const cascadedLocations = useMemo(() => {
    if (!island || island === "all") return values.locations;
    return values.locations.filter(v =>
      rows.some(r => (r.island ?? "").toString().toLowerCase().includes(island.toLowerCase()) && (r.sitelocation ?? "").toString() === v)
    );
  }, [values.locations, island, rows]);

  // 5) option-specific what-if counts
  const countIf = (next: Partial<Filters>) =>
    rows.reduce((acc, r) => acc + (rowMatch(r, { ...filters, ...next }, speciesMap) ? 1 : 0), 0);

  const speciesRows: CountRow[] = useMemo(
    () => values.species.map(v => ({ value: v, count: countIf({ species: v }) })),
    [values.species, rows, population, island, location, photographer, minMantas, date, speciesMap, species]
  );
  const popRows: CountRow[] = useMemo(
    () => values.populations.map(v => ({ value: v, count: countIf({ population: v }) })),
    [values.populations, rows, population, island, location, photographer, minMantas, date, speciesMap, species]
  );
  const islRows: CountRow[] = useMemo(
    () => cascadedIslands.map(v => ({ value: v, count: countIf({ island: v }) })),
    [cascadedIslands, rows, population, island, location, photographer, minMantas, date, speciesMap, species]
  );
  const locRows: CountRow[] = useMemo(
    () => cascadedLocations.map(v => ({ value: v, count: countIf({ location: v }) })),
    [cascadedLocations, rows, population, island, location, photographer, minMantas, date, speciesMap, species]
  );
  const phoRows: CountRow[] = useMemo(
    () => values.photographers.map(v => ({ value: v, count: countIf({ photographer: v }) })),
    [values.photographers, rows, population, island, location, photographer, minMantas, date, speciesMap, species]
  );

  // 6) UI
  const Pill = ({ label, active, children }:{
    label: string; active: boolean; children: React.ReactNode;
  }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`text-sm ${active ? "border-blue-600 text-blue-600" : ""}`}>
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-2" align="start">
        {children}
      </PopoverContent>
    </Popover>
  );
    return (
    <div className="bg-white shadow p-4 rounded border">
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-medium">Filter Sighting Records by:</div>
        <Button variant="link" size="sm" onClick={onClear}>Clear All Filters</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Date */}
        <Pill label={`Date${date ? `: ${date}` : ""}`} active={!!date}>
          <Input type="date" value={date} onChange={(e)=>setDate(e.target.value)} />
          {date && <Button size="sm" className="mt-2" onClick={()=>setDate("")}>Clear</Button>}
        </Pill>

        
        {/* Species (NEW) */}
        <Pill label={`Species${species ? `: ${species}` : ""}`} active={!!species}>
          {speciesRows.map(r => (
            <label key={r.value} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/50 text-sm cursor-pointer">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={species === r.value}
                  onCheckedChange={() => setSpecies(species === r.value ? "" : r.value)}
                />
                {r.value}
              </div>
              <span className="text-xs text-muted-foreground">{r.count}</span>
            </label>
          ))}
        </Pill>
  

        
        {/* Population */}
        <Pill label={`Population${population ? `: ${population}` : ""}`} active={!!population}>
          {popRows.map(r => (
            <label key={r.value} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/50 text-sm cursor-pointer">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={population === r.value}
                  onCheckedChange={() => setPopulation(population === r.value ? "" : r.value)}
                />
                {r.value}
              </div>
              <span className="text-xs text-muted-foreground">{r.count}</span>
            </label>
          ))}
        </Pill>
  

        
        {/* Island */}
        <Pill label={`Island${island && island !== "all" ? `: ${island}` : ""}`} active={!!island && island !== "all"}>
          {islRows.map(r => (
            <label key={r.value} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/50 text-sm cursor-pointer">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={island === r.value}
                  onCheckedChange={() => setIsland(island === r.value ? "" : r.value)}
                />
                {r.value}
              </div>
              <span className="text-xs text-muted-foreground">{r.count}</span>
            </label>
          ))}
        </Pill>
  

        
        {/* Location */}
        <Pill label={`Location${location ? `: ${location}` : ""}`} active={!!location}>
          {locRows.map(r => (
            <label key={r.value} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/50 text-sm cursor-pointer">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={location === r.value}
                  onCheckedChange={() => setLocation(location === r.value ? "" : r.value)}
                />
                {r.value}
              </div>
              <span className="text-xs text-muted-foreground">{r.count}</span>
            </label>
          ))}
        </Pill>
  

        
        {/* Photographer — admin only */}
        {props.isAdmin && (
          <Pill label={`Photographer${photographer ? `: ${photographer}` : ""}`} active={!!photographer}>
            {phoRows.map(r => (
              <label key={r.value} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/50 text-sm cursor-pointer">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={photographer === r.value}
                    onCheckedChange={() => setPhotographer(photographer === r.value ? "" : r.value)}
                  />
                  {r.value}
                </div>
                <span className="text-xs text-muted-foreground">{r.count}</span>
              </label>
            ))}
          </Pill>
        )}
  

        {/* ≥ Mantas */}
        <Pill label={minMantas === "" ? "≥ Mantas" : `≥ ${minMantas}`} active={minMantas !== ""}>
          <Input
            type="number"
            min={0}
            value={minMantas}
            onChange={(e)=> setMinMantas(e.target.value === "" ? "" : Number(e.target.value))}
          />
          {minMantas !== "" && <Button size="sm" className="mt-2" onClick={()=>setMinMantas("")}>Clear</Button>}
        </Pill>
      </div>
    </div>
  );
}
