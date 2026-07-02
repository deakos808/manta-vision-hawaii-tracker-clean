import fs from "fs";
import path from "path";
import { ensureOutputDir, getSupabaseClient, writeCsv } from "./qc_common";

type MantaRow = {
  pk_manta_id: number;
  name: string | null;
  fk_catalog_id: number | null;
  fk_sighting_id: number | null;
  is_mprf: boolean | null;
  no_photos_expected: boolean | null;
};

type PhotoRow = {
  pk_photo_id: number;
  fk_manta_id: number | null;
};

type LedgerRow = {
  changed_at: string;
  pk_manta_id: number;
  manta_name: string;
  fk_sighting_id: number | string;
  old_no_photos_expected: boolean | string;
  new_no_photos_expected: boolean;
  fk_catalog_id: number | string;
  is_mprf: boolean;
  linked_photo_count: number;
  reason: string;
  status: string;
  message: string;
};

const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/manta_no_photos_expected_apply");

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    apply: args.includes("--apply"),
  };
}

async function loadAll<T extends Record<string, unknown>>(table: string, columns: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function main() {
  ensureOutputDir(OUT_DIR);
  const { apply } = parseArgs();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  let mantas: MantaRow[];
  try {
    mantas = await loadAll<MantaRow>(
      "mantas",
      "pk_manta_id,name,fk_catalog_id,fk_sighting_id,is_mprf,no_photos_expected",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("no_photos_expected")) {
      throw new Error(
        "mantas.no_photos_expected is not available yet. Run supabase/migrations/20260512_174118_mantas_no_photos_expected.sql in Supabase SQL Editor, then rerun this script.",
      );
    }
    throw error;
  }

  const photos = await loadAll<PhotoRow>("photos", "pk_photo_id,fk_manta_id");
  const photoCountsByManta = new Map<number, number>();
  for (const photo of photos) {
    if (photo.fk_manta_id == null) continue;
    photoCountsByManta.set(photo.fk_manta_id, (photoCountsByManta.get(photo.fk_manta_id) ?? 0) + 1);
  }

  const changedAt = new Date().toISOString();
  const candidates = mantas.filter((manta) =>
    manta.is_mprf === true &&
    manta.fk_catalog_id == null &&
    manta.no_photos_expected !== true &&
    (photoCountsByManta.get(manta.pk_manta_id) ?? 0) === 0,
  );

  const ledger: LedgerRow[] = [];
  for (const manta of candidates) {
    const base = {
      changed_at: changedAt,
      pk_manta_id: manta.pk_manta_id,
      manta_name: manta.name ?? "",
      fk_sighting_id: manta.fk_sighting_id ?? "",
      old_no_photos_expected: manta.no_photos_expected ?? "",
      new_no_photos_expected: true,
      fk_catalog_id: manta.fk_catalog_id ?? "",
      is_mprf: manta.is_mprf === true,
      linked_photo_count: photoCountsByManta.get(manta.pk_manta_id) ?? 0,
      reason: "MPRF import row has zero linked photos; no photo links expected.",
    };

    if (!apply) {
      ledger.push({
        ...base,
        status: "dry_run_ready",
        message: "Ready to set mantas.no_photos_expected = true.",
      });
      continue;
    }

    const { error } = await supabase
      .from("mantas")
      .update({ no_photos_expected: true })
      .eq("pk_manta_id", manta.pk_manta_id)
      .eq("is_mprf", true)
      .is("fk_catalog_id", null)
      .eq("no_photos_expected", false);

    ledger.push({
      ...base,
      status: error ? "blocked" : "updated",
      message: error?.message ?? "Updated mantas.no_photos_expected.",
    });
  }

  const summary = {
    checked_at: new Date().toISOString(),
    apply,
    candidate_rows: candidates.length,
    ready_or_updated: ledger.filter((row) => row.status === "dry_run_ready" || row.status === "updated").length,
    blocked: ledger.filter((row) => row.status === "blocked").length,
  };

  fs.writeFileSync(path.join(OUT_DIR, "apply_manta_no_photos_expected_summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "apply_manta_no_photos_expected_change_ledger.json"), JSON.stringify(ledger, null, 2));
  writeCsv(path.join(OUT_DIR, "apply_manta_no_photos_expected_change_ledger.csv"), ledger);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
