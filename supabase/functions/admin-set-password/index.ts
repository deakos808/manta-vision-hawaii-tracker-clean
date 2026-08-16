import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

serve(() => new Response(JSON.stringify({ error: "Administrator password assignment is not supported. Use the recovery flow." }), {
  status: 410,
  headers: { "Content-Type": "application/json" },
}));
