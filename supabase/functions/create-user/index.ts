import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(() => new Response(JSON.stringify({
  error: "This unauthenticated legacy endpoint is retired. Use admin-user-management.",
}), {
  status: 410,
  headers: { "Content-Type": "application/json" },
}));
