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
    const photoId = Number(body.pk_photo_id);
    if (!Number.isSafeInteger(photoId) || photoId <= 0) {
      return jsonResponse({ error: "Missing pk_photo_id" }, 400, origin);
    }

    const { error } = await admin.from("photos").delete().eq(
      "pk_photo_id",
      photoId,
    );
    if (error) {
      return jsonResponse({ error: "Photo deletion failed." }, 500, origin);
    }
    return jsonResponse({ success: true }, 200, origin);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return jsonResponse({ error: error.message }, error.status, origin);
    }
    return jsonResponse({ error: "Unexpected error" }, 500, origin);
  }
});
