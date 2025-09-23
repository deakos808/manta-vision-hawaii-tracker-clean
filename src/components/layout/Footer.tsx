import { useSession } from "@supabase/auth-helpers-react";
import { useUserRole } from "@/hooks/useUserRole";

export default function Footer() {
  const session = useSession();
  const { role } = useUserRole();

  console.log("[Footer] session =", session?.user?.email);
  console.log("[Footer] role =", role);

  return (
    <footer className="text-xs text-muted-foreground text-center py-4 border-t">
      <p>
        Signed in as: <strong>{session?.user?.email ?? "anonymous"}</strong>{" "}
        (<em>{role || "unknown"}</em>)
      </p>
      <p>
        Code version (HST):{" "}
        <strong>{import.meta.env.VITE_DEPLOYED_AT}</strong> —{" "}
        {import.meta.env.VITE_GIT_HASH?.slice(0, 7)}
      </p>
    </footer>
  );
}
