// supabase/functions/facet-sightings/index.ts
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Facet = { value: string; count: number };
type Filters = {
  population?: string;
  island?: string;        // "all" treated as undefined
  location?: string;
  photographer?: string;
  minMantas?: number | string;
  date?: string;
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json',
};

// same mapping you confirmed
const POP_ISLANDS: Record<string, string[]> = {
  "Maui Nui": ["Maui", "Molokai", "Lanai", "Kahoolawe"],
  "Oahu": ["Oahu"],
  "Kauai": ["Kauai", "Niihau"],
  "Big Island": ["Big Island", "Hawaii", "Hawaiʻi"],
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });

  try {
    const f: Filters = await req.json().catch(() => ({} as Filters)) || {};
    const pop = (f.population ?? '').trim();
    const isl = (f.island ?? '').trim();
    const loc = (f.location ?? '').trim();
    const pho = (f.photographer ?? '').trim();
    const minM = (f.minMantas ?? '').toString().trim();
    const dt   = (f.date ?? '').trim();

    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb  = createClient(url, key);

    // helper to apply the CURRENT filters to a query
    const applyFilters = (q: any) => {
      if (pop) q = q.ilike('population', `%${pop}%`);
      if (isl && isl.toLowerCase() !== 'all') q = q.ilike('island', `%${isl}%`);
      if (loc) q = q.eq('sitelocation', loc);
      if (pho) q = q.ilike('photographer', `%${pho}%`);
      if (minM !== '') q = q.gte('total_mantas', Number(minM));
      if (dt)  q = q.eq('sighting_date', dt);
      return q;
    };

    // 1) get distinct values under current filters to build menus
    const baseQuery = applyFilters(
      sb.from('sightings')
        .select('population,island,sitelocation', { head: false })
    )
    .not('island', 'is', null);

    const { data: distinct, error: dErr } = await baseQuery;
    if (dErr) return new Response(JSON.stringify({ error: dErr.message }), { status: 500, headers: cors });

    const popSet = new Set<string>();
    const islSet = new Set<string>();
    const locSet = new Set<string>();
    for (const r of distinct ?? []) {
      if (r.population) popSet.add(String(r.population));
      if (r.island) islSet.add(String(r.island));
      if (r.sitelocation) locSet.add(String(r.sitelocation));
    }

    // cascade islands by selected population if any
    if (pop) {
      const allowed = POP_ISLANDS[pop] ?? [];
      for (const v of [...islSet]) if (!allowed.includes(v)) islSet.delete(v);
    }

    // 2) option-specific counts (what-if counts)
    async function optionCount(extra: (q:any)=>any): Promise<number> {
      let q = sb.from('sightings').select('*', { head: true, count: 'exact' });
      q = applyFilters(q);
      q = extra(q);
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return count ?? 0;
    }

    // populations
    const popVals = [...popSet].sort((a,b)=>a.localeCompare(b));
    const populations: Facet[] = [];
    for (const v of popVals) {
      const cnt = await optionCount((q:any)=> q.ilike('population', `%${v}%`));
      populations.push({ value: v, count: cnt });
    }

    // islands
    const islVals = [...islSet].sort((a,b)=>a.localeCompare(b));
    const islands: Facet[] = [];
    for (const v of islVals) {
      const cnt = await optionCount((q:any)=> q.ilike('island', `%${v}%`));
      islands.push({ value: v, count: cnt });
    }

    // locations
    const locVals = [...locSet].sort((a,b)=>a.localeCompare(b));
    const locations: Facet[] = [];
    for (const v of locVals) {
      const cnt = await optionCount((q:any)=> q.eq('sitelocation', v));
      locations.push({ value: v, count: cnt });
    }

    return new Response(JSON.stringify({ populations, islands, locations }), { status: 200, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || 'Unexpected error' }), { status: 500, headers: cors });
  }
});
