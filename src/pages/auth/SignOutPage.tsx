import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function SignOutPage() {
  const navigate = useNavigate();
  useEffect(() => {
    (async () => {
      try { await supabase.auth.signOut(); } catch {}
      try {
        Object.keys(localStorage).forEach(k => { if (k.startsWith("sb-")) localStorage.removeItem(k); });
        sessionStorage.clear();
        caches?.keys?.().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
      } finally {
        navigate("/signin", { replace: true });
      }
    })();
  }, [navigate]);
  return null;
}
