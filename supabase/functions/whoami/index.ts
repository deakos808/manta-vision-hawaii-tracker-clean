// supabase/functions/whoami/index.ts
// Minimal env echo (cloud-first).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const env = (k: string) => (Deno.env.get(k)?.trim() || "");
serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    }});
  const apiPrefCloud = env("VITE_SUPABASE_URL") || env("SUPABASE_URL");
  const snapshot = {
    VITE_SUPABASE_URL: env("VITE_SUPABASE_URL"),
    SUPABASE_URL: env("SUPABASE_URL"),
    SERVICE_ROLE_KEY_present: !!env("SERVICE_ROLE_KEY") || !!env("SUPABASE_SERVICE_ROLE_KEY"),
  };
  return new Response(JSON.stringify({ api_url_used: apiPrefCloud, snapshot }, null, 2), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
});
