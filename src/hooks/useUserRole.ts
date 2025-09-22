import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useUserRole(): "admin" | "user" | "unknown" {
  const [role, setRole] = useState<"admin" | "user" | "unknown">("unknown");

  useEffect(() => {
    let active = true;

    const fetchRole = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;

      console.log("[UserRole] session =", session);

      const uid = session?.user?.id;
      if (!uid) {
        active && setRole("unknown");
        return;
      }

      const { data: prof, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();

      if (error) console.error("[UserRole] fetch error:", error);

      const nextRole =
        prof?.role === "admin" ? "admin" : prof?.role === "user" ? "user" : "unknown";

      console.log("[UserRole] loaded role:", nextRole);
      active && setRole(nextRole);
    };

    fetchRole();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user?.id) {
        setRole("unknown");
        return;
      }

      supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle()
        .then(({ data: prof }) => {
          const nextRole =
            prof?.role === "admin" ? "admin" : prof?.role === "user" ? "user" : "unknown";
          console.log("[UserRole] live role updated:", nextRole);
          setRole(nextRole);
        });
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  return role;
}
