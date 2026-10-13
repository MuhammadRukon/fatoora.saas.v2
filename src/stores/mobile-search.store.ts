import { create } from 'zustand';

/**
 * Ephemeral UI state for the mobile search bar. Lets the toggle button
 * (rendered in the right-hand cluster) and the search island (rendered in
 * its own grid cell) share visibility without forcing the header shell to
 * become a client component. No persistence - resets on reload.
 */
interface MobileSearchState {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

export const useMobileSearch = create<MobileSearchState>((set) => ({
  open: false,
  toggle: () => set((state) => ({ open: !state.open })),
  close: () => set({ open: false }),
}));
