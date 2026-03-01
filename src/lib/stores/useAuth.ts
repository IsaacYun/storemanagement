import { create } from 'zustand';
import { Worker } from '@/lib/supabase/types';
import { createClient } from '@/lib/supabase/client';

interface AuthState {
  worker: Worker | null;
  isAdmin: boolean;
  isLoading: boolean;
  setWorker: (worker: Worker | null) => void;
  setLoading: (loading: boolean) => void;
  refreshWorker: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  worker: null,
  isAdmin: false,
  isLoading: true,
  setWorker: (worker) =>
    set({
      worker,
      isAdmin: worker?.role === 'admin',
    }),
  setLoading: (isLoading) => set({ isLoading }),
  refreshWorker: async () => {
    const currentWorker = get().worker;
    if (!currentWorker) return;

    const supabase = createClient();
    const { data } = await supabase
      .from('workers')
      .select('*')
      .eq('id', currentWorker.id)
      .single();

    if (data) {
      set({
        worker: data,
        isAdmin: data.role === 'admin',
      });
    }
  },
}));
