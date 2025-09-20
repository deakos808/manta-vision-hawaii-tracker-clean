// src/hooks/useRequireConfirmedUser.ts
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@supabase/auth-helpers-react';

export function useRequireConfirmedUser() {
  const session = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    const user = session?.user;

    // If no user, do nothing
    if (!user) return;

    // If not confirmed, redirect
    const isConfirmed = !!user.email_confirmed_at;

    if (!isConfirmed) {
      console.warn('[useRequireConfirmedUser] Email not confirmed, signing out');
      navigate('/signin', { state: { unconfirmed: true } });
    }
  }, [session, navigate]);
}
