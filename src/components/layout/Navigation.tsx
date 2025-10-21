import { useSession } from "@supabase/auth-helpers-react";
import { useUserRole } from "@/hooks/useUserRole";
import { Link } from "react-router-dom";

export default function Navigation() {
  const session = useSession();
  const { role } = useUserRole();

  console.log("[Navigation] session =", session?.user?.email);
  console.log("[Navigation] role =", role);

  return (
    <nav className="p-4 border-b flex justify-between items-center">
      <Link to="/" className="text-lg font-semibold">
        <span className="text-sky-700 font-bold">Hawaii Manta Tracker</span>
      </Link>
      <div className="space-x-4">
        {role === "admin" && <Link to="/admin">Admin</Link>}
        {session ? (
          <Link to="/signout" className="text-red-600">
            Sign Out
          </Link>
        ) : (
          <Link to="/signin">Sign In</Link>
        )}
      </div>
    </nav>
  );
}
