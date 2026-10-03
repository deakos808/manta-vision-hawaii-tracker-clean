import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSessionContext } from '@supabase/auth-helpers-react';
import { useUserAccess } from '@/hooks/useUserAccess';
import { getProtectedRouteDecision } from '@/features/auth/authRouting';

export function AuthenticationLoadingState() {
  return <div className="grid min-h-screen place-items-center bg-white text-sm font-medium text-slate-600" role="status">Restoring your secure session…</div>;
}

export default function RequireAuth(props: { children: React.ReactNode; adminOnly?: boolean }) {
  const { children, adminOnly = false } = props;
  const { isLoading: sessionLoading } = useSessionContext();
  const access = useUserAccess();
  const location = useLocation();

  const decision = getProtectedRouteDecision(
    sessionLoading ? 'loading' : access.state,
    adminOnly,
  );
  if (decision === 'pending') return <AuthenticationLoadingState />;

  if (decision === 'signin') {
    return <Navigate to="/signin" state={{ redirectTo: `${location.pathname}${location.search}${location.hash}` }} replace />;
  }

  const messages: Partial<Record<typeof decision, { title: string; detail: string }>> = {
    inactive: { title: 'Account suspended', detail: 'Your application access is inactive. Contact an administrator for help.' },
    missing_profile: { title: 'Account needs reconciliation', detail: 'Your sign-in exists, but its application profile is missing. Contact an administrator.' },
    unauthorized: { title: 'Administrator access required', detail: 'You are signed in, but this page is restricted to active administrators.' },
    error: { title: 'Unable to verify access', detail: 'Manta Tracker could not verify your application permissions. Try again or contact an administrator.' },
  };
  const message = messages[decision];
  if (message) {
    return (
      <div className="mx-auto mt-12 max-w-xl rounded-lg border border-amber-300 bg-amber-50 p-6 text-slate-800" role="alert">
        <h1 className="text-lg font-semibold">{message.title}</h1>
        <p className="mt-2 text-sm">{message.detail}</p>
      </div>
    );
  }
  return <>{children}</>;
}
