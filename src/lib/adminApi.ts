import { supabase } from "@/lib/supabase";

export function edgeBase() {
  const edge = import.meta.env.VITE_SUPABASE_EDGE_URL?.replace(/\/$/, "");
  if (edge) return edge;
  const url = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  return url ? `${url}/functions/v1` : "https://apweteosdbgsolmvcmhn.supabase.co/functions/v1";
}

export async function adminSetPassword(userId: string, newPassword: string) {
  const base = edgeBase();
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;

  const r = await fetch(`${base}/admin-set-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ user_id: userId, new_password: newPassword }),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `admin-set-password failed (${r.status})`);
  return j;
}

export function generatePassword(len = 20) {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_!@#$%^&*";
  const out: string[] = [];
  const rnd = new Uint32Array(len);
  (window.crypto || self.crypto).getRandomValues(rnd);
  for (let i = 0; i < len; i++) out.push(abc[rnd[i] % abc.length]);
  return out.join("");
}

export async function deleteManta(pk_manta_id: number) {
  const base = edgeBase();
  const r = await fetch(`${base}/delete-manta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pk_manta_id })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `delete-manta failed (${r.status})`);
  return j;
}

export async function deletePhoto(pk_photo_id: number) {
  const base = edgeBase();
  const r = await fetch(`${base}/delete-photo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pk_photo_id })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `delete-photo failed (${r.status})`);
  return j;
}
