import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

function useSignOutImpl() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const signOut = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try { await supabase.auth.signOut(); }
    finally {
      setLoading(false);
      navigate("/signin", { replace: true });
    }
  }, [loading, navigate]);
  return { signOut, loading };
}

// Export both styles so existing imports keep working
export default useSignOutImpl;
export const useSignOut = useSignOutImpl;
