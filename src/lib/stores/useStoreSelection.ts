import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface StoreSelectionState {
  selectedStoreId: string | null;
  setSelectedStore: (storeId: string) => void;
  clearSelection: () => void;
}

export const useStoreSelection = create<StoreSelectionState>()(
  persist(
    (set) => ({
      selectedStoreId: null,
      setSelectedStore: (storeId) => set({ selectedStoreId: storeId }),
      clearSelection: () => set({ selectedStoreId: null }),
    }),
    {
      name: 'store-selection',
    }
  )
);
