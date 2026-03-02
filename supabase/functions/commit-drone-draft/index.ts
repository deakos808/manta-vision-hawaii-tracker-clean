import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function mustEnv(...names: string[]) {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  throw new Error(`Missing required secret: one of ${names.join(", ")}`);
}

function composeTimestamp(d?: string | null, t?: string | null) {
  if (!d) return null;
  if (!t) return d; // already ISO-ish date
  return `${d}T${t}:00Z`;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const { draft_id } = await req.json().catch(() => ({}));
    if (!draft_id || typeof draft_id !== "string") return json({ error: "draft_id required" }, 400);

    const url = mustEnv("PROJECT_URL", "SUPABASE_URL");
    const key = mustEnv("SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(url, key, { auth: { persistSession: false } });

    // 1) Load draft + photos
    const { data: draft, error: e1 } = await sb
      .from("temp_drone_sightings")
      .select("*")
      .eq("id", draft_id)
      .single();
    if (e1 || !draft) return json({ error: e1?.message || "Draft not found" }, 404);

    const { data: photos, error: e2 } = await sb
      .from("temp_drone_photos")
      .select("id,path,url,taken_date,taken_time,lat,lon,total_mantas")
      .eq("draft_id", draft_id)
      .order("created_at", { ascending: true });
    if (e2) return json({ error: e2.message }, 400);

    const pk_drone_survey = crypto.randomUUID();

    // 2) Copy files to permanent bucket and build live photo rows
    const results: Array<{ src: string; dest?: string; ok: boolean; msg?: string }> = [];
    const livePhotos: Array<{
      pk_drone_photo: string;
      fk_drone_survey: string;
      drone_photo_lat: number | null;
      drone_photo_lon: number | null;
      drone_photo_timestamp: string | null;
      total_mantas: number | null;
      author: string | null;
      drone_pilot: string | null;
      island: string | null;
    }> = [];

    for (const p of photos ?? []) {
      const srcPath = String(p.path || "");
      if (!srcPath) { results.push({ src: "", ok: false, msg: "missing path" }); continue; }

      const fileName = srcPath.split("/").pop() || `${crypto.randomUUID()}.jpg`;
      const destPath = `surveys/${pk_drone_survey}/${fileName}`;

      // download from temp-images
      const dl = await sb.storage.from("temp-images").download(srcPath);
      if ((dl as any).error || !dl.data) {
        results.push({ src: srcPath, ok: false, msg: (dl as any).error?.message || "download failed" });
        continue;
      }

      // upload to drone-photo
      const contentType = dl.data.type || "application/octet-stream";
      const up = await sb.storage.from("drone-photo").upload(destPath, dl.data, { contentType, upsert: true });
      if (up.error) {
        results.push({ src: srcPath, ok: false, msg: up.error.message });
        continue;
      }

      // remove temp (best-effort)
      await sb.storage.from("temp-images").remove([srcPath]).catch(() => {});

      results.push({ src: srcPath, dest: destPath, ok: true });

      livePhotos.push({
        pk_drone_photo: destPath,
        fk_drone_survey: pk_drone_survey,
        drone_photo_lat: typeof p.lat === "number" ? p.lat : null,
        drone_photo_lon: typeof p.lon === "number" ? p.lon : null,
        drone_photo_timestamp: composeTimestamp(p.taken_date, p.taken_time),
        total_mantas: Number.isFinite(p.total_mantas) ? p.total_mantas : null,
        author: draft?.email ?? null,
        drone_pilot: draft?.pilot ?? null,
        island: draft?.island ?? null,
      });
    }

    // choose survey-level seed from the first photo with GPS
    const seed = livePhotos.find(ph => ph.drone_photo_lat != null && ph.drone_photo_lon != null) || null;

    // 3) Insert survey
    const surveyRow: any = {
      pk_drone_survey,
      survey_date: draft?.date ?? new Date().toISOString().slice(0,10),
      drone_pilot: draft?.pilot ?? null,
      island: draft?.island ?? null,
      location: draft?.location ?? null,
      notes: draft?.notes ?? null,
      drone_photo_lat: seed?.drone_photo_lat ?? null,
      drone_photo_lon: seed?.drone_photo_lon ?? null,
      drone_photo_timestamp: seed?.drone_photo_timestamp ?? null,
      created_at: new Date().toISOString(),
      created_by: draft?.email ?? null,
    };

    const insSurvey = await sb.from("drone_surveys").insert(surveyRow).select("pk_drone_survey").single();
    if (insSurvey.error) return json({ error: insSurvey.error.message, where: "drone_surveys" }, 400);

    // 4) Insert photos
    if (livePhotos.length) {
      const insPhotos = await sb.from("drone_photos").insert(livePhotos).select("fk_drone_survey");
      if (insPhotos.error) return json({ error: insPhotos.error.message, where: "drone_photos" }, 400);
    }

    // 5) Delete draft rows
    await sb.from("temp_drone_photos").delete().eq("draft_id", draft_id);
    await sb.from("temp_drone_sightings").delete().eq("id", draft_id);

    return json({ ok: true, pk_drone_survey, results }, 200);
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
});
