import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MonthSelectionState {
  year: number;
  month: number;
  setYearMonth: (year: number, month: number) => void;
  goToPrevMonth: () => void;
  goToNextMonth: () => void;
  goToToday: () => void;
}

export const useMonthSelection = create<MonthSelectionState>()(
  persist(
    (set) => ({
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      setYearMonth: (year, month) => set({ year, month }),
      goToPrevMonth: () =>
        set((state) => {
          if (state.month === 1) {
            return { year: state.year - 1, month: 12 };
          }
          return { month: state.month - 1 };
        }),
      goToNextMonth: () =>
        set((state) => {
          if (state.month === 12) {
            return { year: state.year + 1, month: 1 };
          }
          return { month: state.month + 1 };
        }),
      goToToday: () =>
        set({
          year: new Date().getFullYear(),
          month: new Date().getMonth() + 1,
        }),
    }),
    {
      name: 'month-selection',
    }
  )
);
