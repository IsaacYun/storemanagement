import { create } from 'zustand';
import { Worker } from '@/lib/supabase/types';

interface AuthState {
  worker: Worker | null;
  isAdmin: boolean;
  isLoading: boolean;
  setWorker: (worker: Worker | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuth = create<AuthState>((set) => ({
  worker: null,
  isAdmin: false,
  isLoading: true,
  setWorker: (worker) =>
    set({
      worker,
      isAdmin: worker?.role === 'admin',
    }),
  setLoading: (isLoading) => set({ isLoading }),
}));
