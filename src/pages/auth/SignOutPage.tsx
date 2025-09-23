import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function SignOutPage() {
  const navigate = useNavigate();
  useEffect(() => {
    (async () => {
      try { await supabase.auth.signOut(); } finally {
        navigate("/", { replace: true });
        setTimeout(() => { if (location.pathname !== "/") location.assign("/"); }, 250);
      }
    })();
  }, [navigate]);
  return <div style={{padding:24}}>Signing out…</div>;
}
