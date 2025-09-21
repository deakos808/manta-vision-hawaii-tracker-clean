import { supabase } from "./supabase";

export async function debugSignIn(email: string, password: string) {
  // Log the first 12 chars of env to verify bundle values (safe)
  const url = (import.meta as any).env?.VITE_SUPABASE_URL || "undefined";
  const key = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "undefined";
  console.log("VITE_SUPABASE_URL[0..11] =", String(url).slice(0, 12));
  console.log("VITE_SUPABASE_ANON_KEY[0..11] =", String(key).slice(0, 12));

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("signInWithPassword error:", error.message);
    return { ok: false, error: error.message };
  }
  console.log("signInWithPassword OK, user:", data.user?.email);
  return { ok: true, user: data.user };
}
