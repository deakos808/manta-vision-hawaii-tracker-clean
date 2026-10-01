import { supabase } from "./supabase";

export async function debugSignIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("signInWithPassword error:", error.message);
    return { ok: false, error: error.message };
  }
  console.log("signInWithPassword OK, user:", data.user?.email);
  return { ok: true, user: data.user };
}
