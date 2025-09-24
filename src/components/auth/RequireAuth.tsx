import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@supabase/auth-helpers-react';
import { useUserRole } from '@/hooks/useUserRole';

export default function RequireAuth(props: { children: React.ReactNode; adminOnly?: boolean }) {
  const { children, adminOnly = false } = props;
  const session = useSession();
  const { role } = useUserRole();
  const location = useLocation();

  if (!session?.user) {
    return <Navigate to="/signin" state={{ redirectTo: location.pathname }} replace />;
  }

  if (adminOnly && role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
