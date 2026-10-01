import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(() => new Response(JSON.stringify({
  error: "Permanent photo deletion is disabled pending a transactional, audited replacement.",
}), {
  status: 410,
  headers: { "Content-Type": "application/json" },
}));
