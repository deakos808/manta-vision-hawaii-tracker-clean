import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(() => new Response(JSON.stringify({
  error: "This drifted privileged endpoint is disabled pending an authenticated replacement.",
}), {
  status: 410,
  headers: { "Content-Type": "application/json" },
}));
