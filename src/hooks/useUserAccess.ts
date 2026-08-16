import { useEffect, useState } from "react";
import { useSessionContext } from "@supabase/auth-helpers-react";
import { supabase } from "@/lib/supabase";
import type { UserAccessState } from "@/features/auth/authRouting";

export type AppRole = "admin" | "user" | "unknown";

export interface UserAccess {
  state: UserAccessState;
  role: AppRole;
  isActive: boolean | null;
  loading: boolean;
}

export function useUserAccess(): UserAccess {
  const { session, isLoading: sessionLoading } = useSessionContext();
  const [access, setAccess] = useState<UserAccess>({
    state: "loading",
    role: "unknown",
    isActive: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    const userId = session?.user?.id;

    if (sessionLoading) {
      setAccess({ state: "loading", role: "unknown", isActive: null, loading: true });
      return () => { cancelled = true; };
    }

    if (!userId) {
      setAccess({ state: "signed_out", role: "unknown", isActive: null, loading: false });
      return () => { cancelled = true; };
    }

    setAccess({ state: "loading", role: "unknown", isActive: null, loading: true });
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("role,is_active")
          .eq("id", userId)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          console.error("[useUserAccess] profile lookup failed");
          setAccess({ state: "error", role: "unknown", isActive: null, loading: false });
          return;
        }
        if (!data) {
          setAccess({ state: "missing_profile", role: "unknown", isActive: null, loading: false });
          return;
        }

        const role: AppRole = data.role === "admin" ? "admin" : data.role === "user" ? "user" : "unknown";
        if (data.is_active !== true) {
          setAccess({ state: "inactive", role, isActive: false, loading: false });
          return;
        }
        if (role === "unknown") {
          setAccess({ state: "error", role, isActive: true, loading: false });
          return;
        }
        setAccess({ state: role, role, isActive: true, loading: false });
      } catch {
        if (!cancelled) {
          console.error("[useUserAccess] unexpected profile lookup failure");
          setAccess({ state: "error", role: "unknown", isActive: null, loading: false });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [session?.user?.id, sessionLoading]);

  return access;
}
