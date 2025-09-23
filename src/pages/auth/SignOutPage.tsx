import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function SignOutPage() {
  const navigate = useNavigate();
  useEffect(() => {
    (async () => {
      try {
        await supabase.auth.signOut();
      } finally {
        navigate("/signin", { replace: true });
      }
    })();
  }, [navigate]);
  return null;
}
