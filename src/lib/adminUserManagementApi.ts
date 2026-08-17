import { supabase } from "@/lib/supabase";

export type ManagedRole = "admin" | "user";
export type AuthAccountStatus = "confirmed" | "pending" | "banned";

export interface ManagedUser {
  id: string;
  email: string;
  display_name: string | null;
  auth_status: AuthAccountStatus;
  application_role: ManagedRole | null;
  application_active: boolean | null;
  needs_reconciliation: boolean;
  created_at: string | null;
}

function edgeBase(): string {
  const edge = import.meta.env.VITE_SUPABASE_EDGE_URL?.replace(/\/$/, "");
  if (edge) return edge;
  const url = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  if (!url) throw new Error("Supabase Edge Function URL is not configured.");
  return `${url}/functions/v1`;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("An authenticated administrator session is required.");
  const response = await fetch(`${edgeBase()}/admin-user-management`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `User-management request failed (${response.status}).`);
  return payload as T;
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const result = await invoke<{ users: ManagedUser[] }>({ action: "list" });
  return result.users;
}

export function inviteManagedUser(input: { email: string; displayName?: string; reason: string }) {
  return invoke<{ ok: true }>({ action: "invite", email: input.email, display_name: input.displayName ?? "", reason: input.reason });
}

export function updateManagedUserAccess(input: { targetId: string; role: ManagedRole; isActive: boolean; reason: string }) {
  return invoke<{ ok: true }>({ action: "update_access", target_id: input.targetId, role: input.role, is_active: input.isActive, reason: input.reason });
}

export function sendManagedUserRecovery(input: { targetId: string; reason: string }) {
  return invoke<{ ok: true }>({ action: "send_recovery", target_id: input.targetId, reason: input.reason });
}
