import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.4";
import { requireActiveAdmin } from "./user-management-policy.ts";

export class AuthorizationError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function requiredEnv(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  throw new Error(
    `Missing required server configuration: ${names.join(" or ")}`,
  );
}

export function responseHeaders(origin: string | null): HeadersInit {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    ...(origin && allowed.includes(origin)
      ? { "Access-Control-Allow-Origin": origin }
      : {}),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

export function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  origin: string | null = null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });
}

export async function authorizeCaller(
  request: Request,
  requirement: "active-user" | "active-admin",
) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!token) throw new AuthorizationError(401, "Authentication required.");

  const url = requiredEnv("PROJECT_URL", "SUPABASE_URL");
  const publishableKey = requiredEnv(
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  );
  const caller = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser(token);
  if (authError || !authData.user) {
    throw new AuthorizationError(401, "Authentication failed.");
  }

  const secretKey = requiredEnv(
    "SUPABASE_SECRET_KEY",
    "SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,role,is_active")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) {
    throw new AuthorizationError(500, "Unable to verify application access.");
  }
  if (
    !profile || profile.is_active !== true ||
    (profile.role !== "admin" && profile.role !== "user")
  ) {
    throw new AuthorizationError(403, "Active application access is required.");
  }
  if (requirement === "active-admin") {
    try {
      requireActiveAdmin(profile);
    } catch {
      throw new AuthorizationError(
        403,
        "Active administrator access is required.",
      );
    }
  }

  return { admin, actor: profile, user: authData.user, url };
}
