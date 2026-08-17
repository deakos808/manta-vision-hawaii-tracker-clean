import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

serve(() => new Response(JSON.stringify({ error: "This legacy endpoint is retired. Use admin-user-management." }), {
  status: 410,
  headers: { "Content-Type": "application/json" },
}));
