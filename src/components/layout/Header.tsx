// src/components/layout/Header.tsx
import { Link, useLocation } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import useSignOut from "@/hooks/useSignOut";
import logo from '@/assets/hamer_logo_1.png';

export default function Header() {
  const location = useLocation();
  const { signOut } = useSignOut();
  const { role } = useUserRole();

  const navLinkClass = (path: string) =>
    `text-sm font-medium ${location.pathname === path ? 'text-blue-600' : 'text-gray-600 hover:text-black'}`;

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-white border-b">
      <div className="flex items-center space-x-3">
        <Link to="/" className="flex items-center space-x-2">
          <img src={logo} alt="Logo" className="h-8 w-auto" />
          <span className="text-xl font-semibold text-blue-800">Hawaii Manta Tracker</span>
        </Link>
      </div>
      <nav className="flex items-center space-x-4">
        <Link to="/dashboard" className={navLinkClass('/dashboard')}>
          Dashboard
        </Link>
        {role === 'admin' && (
          <Link to="/admin" className={navLinkClass('/admin')}>
            Admin
          </Link>
        )}
        <button onClick={signOut} className="text-sm text-red-600 hover:underline">
          Sign Out
        </button>
      </nav>
    </header>
  );
}
