// src/lib/sift.ts
export type SiftScore = { ok: boolean; inliers: number; inlier_ratio: number };

const SIFT_URL = import.meta.env.VITE_SIFT_URL ?? "http://127.0.0.1:5051";

export async function siftScore(aUrl: string, bUrl: string): Promise<SiftScore> {
  const r = await fetch(`${SIFT_URL}/match/sift`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image_url_a: aUrl, image_url_b: bUrl }),
  });
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  return { ok: true, inliers: j.inliers ?? 0, inlier_ratio: j.inlier_ratio ?? 0 };
}
