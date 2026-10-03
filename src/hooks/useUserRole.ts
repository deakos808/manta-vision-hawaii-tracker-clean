import { useUserAccess, type AppRole } from "@/hooks/useUserAccess";

export type { AppRole } from "@/hooks/useUserAccess";

export function useUserRole(): { role: AppRole; loading: boolean } {
  const { role, loading } = useUserAccess();
  return { role, loading };
}
