import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  AuthorizationError,
  authorizeCaller,
  jsonResponse,
  responseHeaders,
} from "../_shared/authorization.ts";

serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: responseHeaders(origin),
    });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  try {
    const { admin } = await authorizeCaller(request, "active-admin");
    const body = await request.json().catch(() => ({}));
    const mantaId = Number(body.pk_manta_id);
    if (!Number.isSafeInteger(mantaId) || mantaId <= 0) {
      return jsonResponse({ error: "Missing pk_manta_id" }, 400, origin);
    }

    const { error: photosError } = await admin.from("photos").delete().eq(
      "fk_manta_id",
      mantaId,
    );
    if (photosError) {
      return jsonResponse(
        { error: "Associated photo deletion failed." },
        500,
        origin,
      );
    }
    const { error: mantaError } = await admin.from("mantas").delete().eq(
      "pk_manta_id",
      mantaId,
    );
    if (mantaError) {
      return jsonResponse({ error: "Manta deletion failed." }, 500, origin);
    }
    return jsonResponse({ success: true }, 200, origin);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return jsonResponse({ error: error.message }, error.status, origin);
    }
    return jsonResponse({ error: "Unexpected error" }, 500, origin);
  }
});
