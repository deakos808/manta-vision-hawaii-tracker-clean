import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const ACCEPTED_CATALOG_IDS = [451, 475, 518, 863, 875];
const REASON = "no_ventral_available";
const APPLY = process.argv.includes("--apply");

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing Supabase credentials.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const { data: rows, error } = await supabase
    .from("catalog")
    .select("pk_catalog_id,best_catalog_photo_exception_reason")
    .in("pk_catalog_id", ACCEPTED_CATALOG_IDS);

  if (error) throw error;

  const needsUpdate = (rows ?? []).filter((row) => row.best_catalog_photo_exception_reason !== REASON);
  console.log(`Catalog exception reason target: ${REASON}`);
  console.log(`Found ${rows?.length ?? 0} target catalog rows; ${needsUpdate.length} need updates.`);
  console.table(needsUpdate);

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to update catalog.best_catalog_photo_exception_reason.");
    return;
  }

  const { data, error: updateError } = await supabase
    .from("catalog")
    .update({ best_catalog_photo_exception_reason: REASON })
    .in("pk_catalog_id", ACCEPTED_CATALOG_IDS)
    .select("pk_catalog_id,best_catalog_photo_exception_reason");

  if (updateError) throw updateError;
  console.log(`Updated ${data?.length ?? 0} catalog rows.`);
  console.table(data);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
