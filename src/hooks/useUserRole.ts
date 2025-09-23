import { useEffect, useState } from "react";
import { useSession } from "@supabase/auth-helpers-react";
import { supabase } from "@/lib/supabase";

type Role = "admin" | "user" | "unknown";

export function useUserRole() {
  const session = useSession();
  const [role, setRole] = useState<Role>("unknown");

  useEffect(() => {
    let alive = true;

    async function fetchRole() {
      const uid = session?.user?.id;
      if (!uid) {
        if (alive) setRole("unknown");
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();

      if (error) {
        console.warn("[useUserRole] profiles lookup error:", error.message);
      }
      const r = (data?.role as string) || "user";
      if (alive) {
        setRole(r === "admin" ? "admin" : "user");
        console.log("[useUserRole] live role updated:", r);
      }
    }

    fetchRole();
    const { data: sub } = supabase.auth.onAuthStateChange(() => fetchRole());
    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
    };
  }, [session?.user?.id]);

  return { role };
}
