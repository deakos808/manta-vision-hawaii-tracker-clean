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
    const { admin } = await authorizeCaller(request, "active-user");
    const body = await request.json().catch(() => ({}));
    const photoId = typeof body.photo_id === "string"
      ? body.photo_id.trim()
      : "";
    if (!photoId) {
      return jsonResponse({ error: "Missing photo_id" }, 400, origin);
    }

    const { data: metadata, error: fetchError } = await admin
      .from("temp_photos")
      .select("photo_url")
      .eq("id", photoId)
      .maybeSingle();
    if (fetchError || !metadata?.photo_url) {
      return jsonResponse({ error: "Photo URL not found" }, 404, origin);
    }

    const imageResponse = await fetch(metadata.photo_url);
    if (!imageResponse.ok) {
      return jsonResponse({ error: "Failed to fetch image" }, 502, origin);
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = btoa(
      String.fromCharCode(...new Uint8Array(imageBuffer)),
    );

    const embedUrl = Deno.env.get("EMBED_URL")?.trim() ||
      Deno.env.get("LOCAL_EMBEDDING_SERVER_URL")?.trim();
    if (!embedUrl) {
      return jsonResponse(
        { error: "Embedding service is not configured" },
        500,
        origin,
      );
    }
    const embedApiToken = Deno.env.get("EMBED_API_TOKEN")?.trim();
    if (!embedApiToken) {
      return jsonResponse(
        { error: "Embedding service authentication is not configured" },
        500,
        origin,
      );
    }
    const embeddingResponse = await fetch(embedUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${embedApiToken}`,
      },
      body: JSON.stringify({ image_base64: imageBase64 }),
    });
    if (!embeddingResponse.ok) {
      return jsonResponse({ error: "Embedding server error" }, 500, origin);
    }

    const embeddingPayload = await embeddingResponse.json();
    const embedding = embeddingPayload.embedding;
    if (!Array.isArray(embedding)) {
      return jsonResponse({ error: "Invalid embedding received" }, 422, origin);
    }

    const { error: updateError } = await admin
      .from("temp_photos")
      .update({ embedding })
      .eq("id", photoId);
    if (updateError) {
      return jsonResponse(
        { error: "Failed to update temp_photos" },
        500,
        origin,
      );
    }

    return jsonResponse({ status: "ok", photo_id: photoId }, 200, origin);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return jsonResponse({ error: error.message }, error.status, origin);
    }
    return jsonResponse({ error: "Unexpected error" }, 500, origin);
  }
});
