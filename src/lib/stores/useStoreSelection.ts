import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface StoreSelectionState {
  selectedStoreId: string | null;
  _hasHydrated: boolean;
  setSelectedStore: (storeId: string) => void;
  clearSelection: () => void;
  setHasHydrated: (state: boolean) => void;
}

export const useStoreSelection = create<StoreSelectionState>()(
  persist(
    (set) => ({
      selectedStoreId: null,
      _hasHydrated: false,
      setSelectedStore: (storeId) => set({ selectedStoreId: storeId }),
      clearSelection: () => set({ selectedStoreId: null }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'store-selection',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
