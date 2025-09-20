// src/components/layout/Navigation.tsx

import { Link } from 'react-router-dom';
import { useUser, useSession } from '@supabase/auth-helpers-react';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';

export default function Navigation() {
  const user = useUser();
  const session = useSession();
  const role = useUserRole();

  const isAdmin = role === 'admin';

  return (
    <nav className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
      <div className="text-lg font-semibold flex items-center space-x-4">
        <Link to="/" className="text-white hover:underline">
          Manta ID <span className="text-sm bg-white text-blue-600 rounded px-2 ml-1">v1.0</span>
        </Link>
        <Link to="/dashboard" className="hover:underline">Dashboard</Link>
        <Link to="/sightings/add" className="hover:underline">Add Sighting</Link>
        <Link to="/browse/data" className="hover:underline">Search Database</Link>
        {isAdmin && <Link to="/admin" className="hover:underline">Admin</Link>}
      </div>
      {user && session ? (
        <form action="/signout" method="post">
          <Button type="submit" size="sm" variant="secondary">Sign Out</Button>
        </form>
      ) : null}
    </nav>
  );
}