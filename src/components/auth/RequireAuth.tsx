import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

async function fetchRole(): Promise<"admin"|"user"|"unknown"> {
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user?.id;
  if (!uid) return "unknown";
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", uid)
    .maybeSingle();
  if (error || !data?.role) return "user";
  return (data.role as "admin"|"user") ?? "user";
}

export default function RequireAuth({
  children,
  adminOnly = false,
}: {
  children: ReactNode;
  adminOnly?: boolean;
}) {
  const navigate = useNavigate();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setOk(false);
        navigate("/signin", { replace: true });
        return;
      }
      if (!adminOnly) {
        setOk(true);
        return;
      }
      const role = await fetchRole();
      if (role !== "admin") {
        setOk(false);
        navigate("/dashboard", { replace: true });
        return;
      }
      setOk(true);
    })();
  }, [adminOnly, navigate]);

  return ok ? <>{children}</> : null;
}
