// Deno Deploy (Supabase Edge Function)
// Endpoint: /functions/v1/merge-catalogs
//
// The reachable production contract is intentionally narrow:
// - merge delegates the transaction to merge_catalogs_tx
// - health performs the existing lightweight database probe
// - set_best_catalog_ventral remains explicitly unimplemented

import {
  AuthorizationError,
  authorizeCaller,
  jsonResponse,
  responseHeaders,
} from "../_shared/authorization.ts";

type Json = Record<string, unknown>;

function json(status: number, body: Json, origin: string | null) {
  return jsonResponse(body, status, origin);
}

function badRequest(message: string, origin: string | null) {
  return json(400, { ok: false, error: message }, origin);
}

function parseIntId(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === "undefined" || normalized === "null") {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: responseHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" }, origin);
  }

  let authorized;
  try {
    authorized = await authorizeCaller(req, "active-admin");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return json(error.status, { ok: false, error: error.message }, origin);
    }
    return json(500, { ok: false, error: "Server authorization failed" }, origin);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return badRequest("Invalid JSON body", origin);
  }

  const action = String(payload.action ?? "");

  if (action === "merge") {
    const first = parseIntId(payload.primary_pk_catalog_id);
    const second = parseIntId(payload.secondary_pk_catalog_id);
    const deleteSecondary = !!payload.delete_secondary_if_detached;

    if (!first || !second || first === second) {
      return badRequest("Invalid catalog IDs", origin);
    }

    const primary = Math.min(first, second);
    const secondary = Math.max(first, second);

    try {
      const { data, error } = await authorized.admin.rpc("merge_catalogs_tx", {
        p_primary: primary,
        p_secondary: secondary,
        p_delete_secondary_if_detached: deleteSecondary,
      });
      if (error) {
        return json(400, { ok: false, error: error.message || String(error) }, origin);
      }
      return json(200, { ok: true, ...(data ?? {}) }, origin);
    } catch (error) {
      return json(400, { ok: false, error: String(error) }, origin);
    }
  }

  if (action === "health") {
    try {
      const { data, error } = await authorized.admin
        .from("catalog")
        .select("pk_catalog_id")
        .limit(1);

      return json(200, {
        ok: true,
        launched: true,
        hasUrl: true,
        hasKey: true,
        canQuery: !error,
        dbError: error?.message || null,
        sample: (data && data[0]) || null,
      }, origin);
    } catch (error) {
      return json(200, {
        ok: false,
        launched: true,
        hasUrl: true,
        hasKey: true,
        canQuery: false,
        dbError: String(error),
      }, origin);
    }
  }

  if (action === "set_best_catalog_ventral") {
    return json(501, {
      ok: false,
      error: "set_best_catalog_ventral not implemented in Edge (will move to RPC)",
    }, origin);
  }

  return badRequest(`Unknown action: ${action}`, origin);
});
