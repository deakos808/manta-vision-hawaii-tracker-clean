import { createClient } from '@supabase/supabase-js';

declare global {
  interface Window { supabase?: any; __mantas?: any[] }
}

const supabase: any =
  (typeof window !== 'undefined' && (window as any).supabase)
  ?? createClient(
       (import.meta as any).env.VITE_SUPABASE_URL as string,
       (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string
     );

const isObj = (v: any) => v && typeof v === 'object' && !Array.isArray(v);

export function deepMerge(target: any, ...sources: any[]): any {
  const out: any = isObj(target) ? { ...target } : {};
  for (const src of sources) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      if (Array.isArray(v)) out[k] = v.slice();
      else if (isObj(v)) out[k] = deepMerge(out[k] ?? {}, v);
      else if (v !== undefined) out[k] = v;
    }
  }
  return out;
}

function readValue(selectors: string[]): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (el && 'value' in el) {
      const val = (el as any).value;
      if (val != null && String(val).length) return String(val);
    }
  }
  return undefined;
}

function readNumber(selectors: string[]): number | undefined {
  const v = readValue(selectors);
  const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function getUiStateFromDom() {
  const notes = readValue(['textarea[name="notes"]', '#notes', 'textarea[data-field="notes"]']);
  const island = readValue(['[name="island"]', '#island', '[data-field="island"]']);
  const site = readValue(['[name="site"]', '[name="sitelocation"]', '#site', '#sitelocation', '[data-field="site"]', '[data-field="sitelocation"]']);
  const lat = readNumber(['[name="lat"]', '[name="latitude"]', '#lat', '#latitude', '[data-field="lat"]']);
  const lng = readNumber(['[name="lng"]', '[name="longitude"]', '#lng', '#longitude', '[data-field="lng"]']);

  let mantas: any = undefined;
  if (typeof window !== 'undefined' && Array.isArray(window.__mantas)) {
    mantas = window.__mantas;
  } else {
    const nodes = Array.from(document.querySelectorAll('[data-manta]'));
    if (nodes.length) {
      mantas = nodes.map((n: any) => {
        try { return JSON.parse(n.getAttribute('data-manta')!); } catch { return n.textContent?.trim(); }
      });
    }
  }

  const location: any = {};
  if (island !== undefined) location.island = island;
  if (site !== undefined) { location.sitelocation = site; location.site = site; }
  if (lat !== undefined) location.lat = lat;
  if (lng !== undefined) location.lng = lng;

  const out: any = {};
  if (notes !== undefined) out.notes = notes;
  if (Object.keys(location).length) out.location = location;
  if (mantas !== undefined) out.mantas = mantas;
  return out;
}

export async function saveReviewServer(reviewId: string, overrides?: any) {
  if (!reviewId) throw new Error('missing reviewId');
  const { data, error } = await supabase.from('sighting_submissions').select('payload').eq('id', reviewId).single();
  if (error) throw error;
  const existing = data?.payload ?? {};
  const ui = getUiStateFromDom();
  const merged = deepMerge({}, existing, ui, overrides ?? {});
  const { error: uerr } = await supabase.from('sighting_submissions').update({ payload: merged }).eq('id', reviewId);
  if (uerr) throw uerr;
  return merged;
}

export default saveReviewServer;
