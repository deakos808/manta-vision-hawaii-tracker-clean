import React from 'react';
import { NavLink } from 'react-router-dom';
import { useSession } from '@supabase/auth-helpers-react';
import { useUserRole } from '@/hooks/useUserRole';
import hamerLogo from '@/assets/hamer_logo_1.png';

export default function Header() {
  const session = useSession();
  const { role } = useUserRole();
  const authed = !!session?.user;

  return (
    <header className="p-4 border-b flex justify-between items-center">
      <NavLink to="/" className="flex items-center gap-2 text-lg font-semibold">
        <img src={hamerLogo} alt="HAMER" className="h-7 w-7" />
        <span className="text-sky-700 font-bold">Hawaii Manta Tracker</span>
      </NavLink>
      <nav className="space-x-4">
        {authed && <NavLink to="/dashboard">Dashboard</NavLink>}
        {authed && role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
        {!authed && <NavLink to="/signin">Sign In</NavLink>}
        {authed && <NavLink to="/signout" className="text-red-600">Sign Out</NavLink>}
      </nav>
    </header>
  );
}
