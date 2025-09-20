// src/hooks/useUserRole.ts
import { useState, useEffect } from 'react';
import { useUser } from '@supabase/auth-helpers-react';
import { supabase } from '@/lib/supabase';

type Role = 'user' | 'admin';

interface UseUserRole {
  role: Role;
  loading: boolean;
}

export function useUserRole(): UseUserRole {
  const user = useUser();
  const [role, setRole] = useState<Role>('user');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!user) {
      setRole('user');
      setLoading(false);
      return;
    }

    const fetchRole = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (error || !data) {
        console.error('Error fetching user role:', error);
        setRole('user');
      } else {
        // Assume role column is text 'admin' or 'user'
        setRole(data.role as Role);
      }
      setLoading(false);
    };

    fetchRole();
  }, [user]);

  return { role, loading };
}
