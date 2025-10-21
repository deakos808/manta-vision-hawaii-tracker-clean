import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type AppRole = "admin" | "user" | "unknown";

export function useUserRole(): { role: AppRole } {
  const [role, setRole] = useState<AppRole>("unknown");

  useEffect(() => {
    let cancelled = false;

    const set = (r: AppRole) => { if (!cancelled) setRole(r); };

    async function loadInitial() {
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user?.id;
      if (!id) return set("unknown");
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", id)
        .maybeSingle();
      set(prof?.role === "admin" ? "admin" : "user");
    }

    loadInitial();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const id = session?.user?.id;
      if (!id) return set("unknown");
      supabase
        .from("profiles")
        .select("role")
        .eq("id", id)
        .maybeSingle()
        .then(({ data: prof }) => set(prof?.role === "admin" ? "admin" : "user"));
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  return { role };
}
