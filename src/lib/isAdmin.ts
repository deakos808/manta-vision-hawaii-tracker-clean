import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** Returns true if current user has profiles.role in ['admin','database_manager'] */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const uid = userRes?.user?.id;
        if (!alive || !uid) { setIsAdmin(false); return; }
        const { data } = await supabase.from("profiles").select("role").eq("id", uid).single();
        const role = (data?.role ?? "").toString().trim().toLowerCase();
        setIsAdmin(role === "admin" || role === "database_manager");
      } catch {
        if (alive) setIsAdmin(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return isAdmin;
}
