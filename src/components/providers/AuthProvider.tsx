'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/stores/useAuth';
import { Worker } from '@/lib/supabase/types';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setWorker, setLoading } = useAuth();

  useEffect(() => {
    const supabase = createClient();

    const fetchWorker = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: worker } = await supabase
            .from('workers')
            .select('*, store:stores(*)')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .single();

          setWorker(worker as Worker | null);
        } else {
          setWorker(null);
        }
      } catch {
        setWorker(null);
      } finally {
        setLoading(false);
      }
    };

    fetchWorker();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        setWorker(null);
      } else if (event === 'SIGNED_IN') {
        fetchWorker();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setWorker, setLoading]);

  return <>{children}</>;
}
