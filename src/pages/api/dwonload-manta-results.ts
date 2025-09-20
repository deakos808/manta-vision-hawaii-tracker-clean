import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { data, error } = await supabase
    .from("manta_match_results")
    .select("manta_id, fk_catalog_id, true_match_rank, match_score");

  if (error || !data) {
    return res.status(500).json({ error: error?.message || "Failed to fetch match results." });
  }

  const csv = [
    "manta_uuid,catalog_uuid,true_match_rank,match_score",
    ...data.map((row) =>
      [
        row.manta_id,
        row.fk_catalog_id,
        row.true_match_rank ?? "",
        row.match_score ?? "",
      ].join(",")
    ),
  ].join("\n");

  res.setHeader("Content-Disposition", "attachment; filename=manta_match_results.csv");
  res.setHeader("Content-Type", "text/csv");
  res.status(200).send(csv);
}
