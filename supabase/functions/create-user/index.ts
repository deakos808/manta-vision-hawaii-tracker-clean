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
    const { admin, actor } = await authorizeCaller(request, "active-admin");
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";
    const requestedPassword = typeof body.password === "string"
      ? body.password
      : "";
    const role = body.role === "admin" || body.role === "user"
      ? body.role
      : null;
    const adminId = typeof body.admin_id === "string"
      ? body.admin_id.trim()
      : "";
    if (
      !/^\S+@\S+\.\S+$/.test(email) || !requestedPassword || !role || !adminId
    ) {
      return jsonResponse({ error: "Missing required fields" }, 400, origin);
    }
    if (adminId !== actor.id) {
      return jsonResponse(
        { error: "Authenticated administrator does not match admin_id" },
        403,
        origin,
      );
    }

    let userId: string | null = null;
    const created = await admin.auth.admin.createUser({
      email,
      password: requestedPassword,
      email_confirm: true,
    });
    if (created.data.user?.id) {
      userId = created.data.user.id;
    } else {
      const conflict = (created.error?.message ?? "").toLowerCase().includes(
        "already been registered",
      );
      if (!conflict) {
        return jsonResponse(
          { error: "Auth user creation failed" },
          500,
          origin,
        );
      }
      for (let page = 1; !userId; page += 1) {
        const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (listed.error) {
          return jsonResponse(
            { error: "Auth user lookup failed" },
            500,
            origin,
          );
        }
        userId = listed.data.users.find((user) =>
          user.email?.toLowerCase() === email
        )?.id ?? null;
        if (listed.data.users.length < 200) break;
      }
      if (!userId) {
        return jsonResponse(
          { error: "Auth user could not be located" },
          500,
          origin,
        );
      }
      const updated = await admin.auth.admin.updateUserById(userId, {
        password: requestedPassword,
        email_confirm: true,
      });
      if (updated.error) {
        return jsonResponse({ error: "Auth user update failed" }, 500, origin);
      }
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId,
      email,
      role,
      is_active: true,
      created_by: actor.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (profileError) {
      return jsonResponse(
        { error: "Application profile update failed" },
        500,
        origin,
      );
    }

    return jsonResponse(
      { success: true, user_id: userId, emailed: false },
      200,
      origin,
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return jsonResponse({ error: error.message }, error.status, origin);
    }
    return jsonResponse({ error: "Unexpected error" }, 500, origin);
  }
});
