import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { guestCartLineSchema, MAX_GUEST_LINES, type GuestCartLine } from '@/contracts/cart';

/**
 * Guest cart held in localStorage. The real (authoritative) cart for
 * logged-in users lives on the server; this store is *only* used while
 * the user is signed out, then merged via `/api/cart` (PUT) on login.
 *
 * Keeping this strictly client-only and storing only the minimal
 * `{ variantId, quantity }` shape means we never duplicate prices,
 * names or images locally - all hydrated from the catalog API.
 */
interface GuestCartState {
  lines: GuestCartLine[];
  /** Epoch ms of the last successful hydrate; null until the first one. */
  lastValidatedAt: number | null;
  /** Variants that exist but are inactive or out of stock, per the last hydrate (not persisted). */
  unavailable: string[];
  /** Lines pruned by the last hydrate because the variant no longer exists (not persisted). */
  prunedCount: number;
  /** `maxStock` caps the line (known stock); returns false when the change was blocked. */
  add: (variantId: string, quantity?: number, maxStock?: number) => boolean;
  setQuantity: (variantId: string, quantity: number, maxStock?: number) => boolean;
  remove: (variantId: string) => void;
  clear: () => void;
  applyHydrate: (result: { missing: string[]; unavailable: string[] }) => void;
  dismissPruned: () => void;
}

type PersistedGuestCart = Pick<GuestCartState, 'lines' | 'lastValidatedAt'>;

const STORAGE_KEY = 'Cryptech.guestCart';
// Same bounds the hydrate request accepts, so a stored line can never cause a 422.
const storedLineSchema = guestCartLineSchema.extend({
  variantId: guestCartLineSchema.shape.variantId.min(1),
});

/** Keeps the valid lines of whatever was stored; anything else is dropped. */
function sanitize(raw: unknown): PersistedGuestCart {
  const stored = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lines = Array.isArray(stored.lines)
    ? stored.lines.slice(0, MAX_GUEST_LINES).flatMap((l) => {
        const parsed = storedLineSchema.safeParse(l);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  const at = stored.lastValidatedAt;
  return {
    lines,
    lastValidatedAt: typeof at === 'number' && Number.isFinite(at) ? at : null,
  };
}

export const useGuestCart = create<GuestCartState>()(
  persist(
    (set, get) => ({
      lines: [],
      lastValidatedAt: null,
      unavailable: [],
      prunedCount: 0,
      add: (variantId, quantity = 1, maxStock) => {
        const existing = get().lines.find((l) => l.variantId === variantId);
        const next = (existing?.quantity ?? 0) + quantity;
        if (maxStock !== undefined && next > maxStock) return false;
        const capped = Math.min(99, next);
        set((state) => ({
          lines: existing
            ? state.lines.map((l) => (l.variantId === variantId ? { ...l, quantity: capped } : l))
            : [...state.lines, { variantId, quantity: capped }],
        }));
        return true;
      },
      setQuantity: (variantId, quantity, maxStock) => {
        if (quantity <= 0) {
          set((state) => ({ lines: state.lines.filter((l) => l.variantId !== variantId) }));
          return true;
        }
        const current = get().lines.find((l) => l.variantId === variantId)?.quantity ?? 0;
        // Lowering a line that is already over the stock stays allowed.
        if (maxStock !== undefined && quantity > maxStock && quantity > current) return false;
        const capped = Math.min(99, quantity);
        set((state) => ({
          lines: state.lines.map((l) =>
            l.variantId === variantId ? { ...l, quantity: capped } : l,
          ),
        }));
        return true;
      },
      remove: (variantId) =>
        set((state) => ({ lines: state.lines.filter((l) => l.variantId !== variantId) })),
      clear: () => set({ lines: [], unavailable: [], prunedCount: 0, lastValidatedAt: null }),
      // Only variants still in the store count: a hydrate finishing after a clear/remove must not leave stale state.
      applyHydrate: ({ missing, unavailable }) =>
        set((state) => {
          const present = new Set(state.lines.map((l) => l.variantId));
          const pruned = missing.filter((id) => present.has(id));
          return {
            // Same reference when nothing was pruned, so lines subscribers do not re-run.
            lines: pruned.length
              ? state.lines.filter((l) => !missing.includes(l.variantId))
              : state.lines,
            unavailable: unavailable.filter((id) => present.has(id)),
            prunedCount: state.prunedCount + pruned.length,
            lastValidatedAt: Date.now(),
          };
        }),
      dismissPruned: () => set({ prunedCount: 0 }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ lines, lastValidatedAt }) => ({ lines, lastValidatedAt }),
      // Version 0 (pre-validation) and unknown versions keep their valid lines.
      migrate: (persisted) => sanitize(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
    },
  ),
);

// Another tab changed the cart: pick it up without a reload.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === null) void useGuestCart.persist.rehydrate();
  });
}
