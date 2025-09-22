import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useUserRole() {
  const [role, setRole] = useState<"admin"|"user"|"unknown">("unknown");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) { active && setRole("unknown"); return; }
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
      active && setRole((prof?.role as any) === "admin" ? "admin" : "user");
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user) setRole("unknown");
      else supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle()
        .then(({ data }) => setRole((data?.role as any) === "admin" ? "admin" : "user"));
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);
  return role;
}
