import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type AppRole = "admin" | "user" | "unknown";

export function useUserRole(): { role: AppRole; loading: boolean } {
  const [role, setRole] = useState<AppRole>("unknown");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const setSafeRole = (r: AppRole) => {
      if (!cancelled) setRole(r);
    };

    const setSafeLoading = (v: boolean) => {
      if (!cancelled) setLoading(v);
    };

    async function loadRoleForUser(userId: string | null | undefined) {
      if (!userId) {
        setSafeRole("unknown");
        setSafeLoading(false);
        return;
      }

      setSafeLoading(true);

      try {
        const { data: prof, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle();

        if (error) {
          console.error("[useUserRole] profile lookup error:", error);
          setSafeRole("user");
          setSafeLoading(false);
          return;
        }

        setSafeRole(prof?.role === "admin" ? "admin" : "user");
      } catch (err) {
        console.error("[useUserRole] unexpected profile lookup error:", err);
        setSafeRole("user");
      } finally {
        setSafeLoading(false);
      }
    }

    async function loadInitial() {
      try {
        setSafeLoading(true);
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error("[useUserRole] getSession error:", error);
          setSafeRole("unknown");
          setSafeLoading(false);
          return;
        }

        const userId = data.session?.user?.id;
        await loadRoleForUser(userId);
      } catch (err) {
        console.error("[useUserRole] loadInitial error:", err);
        setSafeRole("unknown");
        setSafeLoading(false);
      }
    }

    loadInitial();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id ?? null;

      if (!userId) {
        setSafeRole("unknown");
        setSafeLoading(false);
        return;
      }

      setSafeLoading(true);

      window.setTimeout(() => {
        loadRoleForUser(userId);
      }, 0);
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  return { role, loading };
}
