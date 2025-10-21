import { supabase } from "@/lib/supabase";

const isObj = (v: any) => v && typeof v === "object" && !Array.isArray(v);

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

/**
 * Merge-safe save: reads existing payload, merges `overrides`, writes back.
 * Do not pass undefined values for fields you wish to preserve.
 */
export async function saveReviewServer(reviewId: string, overrides?: any) {
  if (!reviewId) throw new Error("saveReviewServer: missing reviewId");
  const { data, error } = await supabase
    .from("sighting_submissions")
    .select("payload")
    .eq("id", reviewId)
    .single();
  if (error) throw error;

  const existing = (data as any)?.payload ?? {};
  const merged = deepMerge({}, existing, overrides ?? {});
  const { error: uerr } = await supabase
    .from("sighting_submissions")
    .update({ payload: merged })
    .eq("id", reviewId);
  if (uerr) throw uerr;

  return merged;
}

export default saveReviewServer;
