import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const { sub_id } = await req.json();

    if (!sub_id) {
      return json({ error: "sub_id required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data: sub, error: subErr } = await supabase
      .from("sighting_submissions")
      .select("*")
      .eq("id", sub_id)
      .single();

    if (subErr || !sub) {
      return json({ error: "Submission not found" }, 404);
    }

    const { error: commitErr } = await supabase.rpc("commit_sighting_submission", {
      sub_id,
    });

    if (commitErr) {
      return json({
        error: commitErr.message,
        details: commitErr.details,
        hint: commitErr.hint,
        code: commitErr.code,
        where: "commit_sighting_submission",
      }, 400);
    }

    const { data: committedSub, error: committedSubErr } = await supabase
      .from("sighting_submissions")
      .select("id,status,committed_at,committed_pk_sighting_id,manta_count,photo_count")
      .eq("id", sub_id)
      .single();

    if (committedSubErr || !committedSub) {
      return json({
        error: committedSubErr?.message || "Commit completed but submission could not be reloaded",
        where: "submission_reload",
      }, 500);
    }

    return json({
      ok: true,
      pk_sighting_id: committedSub.committed_pk_sighting_id,
      status: committedSub.status,
      committed_at: committedSub.committed_at,
      manta_count: committedSub.manta_count,
      photo_count: committedSub.photo_count,
    });

  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
