// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Node's own `localStorage` getter shadows jsdom's (undefined without --localstorage-file),
// and the zustand store reads it at import time, so stub before importing the store.
const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  const api = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: api, configurable: true });
  return api;
});

const KEY = 'Cryptech.guestCart';

async function freshStore() {
  vi.resetModules();
  return (await import('../guest-cart')).useGuestCart;
}

beforeEach(() => storage.clear());

describe('guest cart maxStock', () => {
  it('add past the known stock is blocked and leaves the quantity unchanged', async () => {
    const store = await freshStore();
    expect(store.getState().add('v', 2, 3)).toBe(true);
    expect(store.getState().add('v', 2, 3)).toBe(false);
    expect(store.getState().lines).toEqual([{ variantId: 'v', quantity: 2 }]);
    expect(store.getState().add('v', 1, 3)).toBe(true);
    expect(store.getState().lines[0].quantity).toBe(3);
  });

  it('a new line above the stock, or any add with stock 0, is blocked', async () => {
    const store = await freshStore();
    expect(store.getState().add('a', 5, 2)).toBe(false);
    expect(store.getState().add('b', 1, 0)).toBe(false);
    expect(store.getState().lines).toEqual([]);
  });

  it('setQuantity blocks an increase past the stock but allows lowering a line that is already over it', async () => {
    const store = await freshStore();
    store.getState().add('v', 5);
    expect(store.getState().setQuantity('v', 6, 2)).toBe(false);
    expect(store.getState().setQuantity('v', 4, 2)).toBe(true);
    expect(store.getState().lines[0].quantity).toBe(4);
    expect(store.getState().setQuantity('v', 2, 2)).toBe(true);
    expect(store.getState().setQuantity('v', 3, 2)).toBe(false);
    expect(store.getState().lines[0].quantity).toBe(2);
  });

  it('99 stays the absolute ceiling even with a larger or unknown stock', async () => {
    const store = await freshStore();
    store.getState().add('v', 98);
    store.getState().add('v', 5);
    expect(store.getState().lines[0].quantity).toBe(99);
    store.getState().setQuantity('v', 150, 500);
    expect(store.getState().lines[0].quantity).toBe(99);
  });

  it('setQuantity 0 removes the line', async () => {
    const store = await freshStore();
    store.getState().add('v', 2);
    store.getState().setQuantity('v', 0, 1);
    expect(store.getState().lines).toEqual([]);
  });
});

describe('guest cart hydrate result', () => {
  it('prunes only the missing variants, records the rest as unavailable and stamps lastValidatedAt', async () => {
    const store = await freshStore();
    store.getState().add('gone', 1);
    store.getState().add('soldout', 2);
    store.getState().add('ok', 1);
    const before = Date.now();
    store.getState().applyHydrate({ missing: ['gone'], unavailable: ['soldout'] });
    const s = store.getState();
    expect(s.lines.map((l) => l.variantId)).toEqual(['soldout', 'ok']);
    expect(s.unavailable).toEqual(['soldout']);
    expect(s.prunedCount).toBe(1);
    expect(s.lastValidatedAt).toBeGreaterThanOrEqual(before);
    s.dismissPruned();
    expect(store.getState().prunedCount).toBe(0);
  });

  it('clear resets the hydrate bookkeeping, and a hydrate finishing after the clear changes nothing', async () => {
    const store = await freshStore();
    store.getState().add('gone', 1);
    store.getState().add('soldout', 1);
    store.getState().applyHydrate({ missing: ['gone'], unavailable: ['soldout'] });
    expect(store.getState().prunedCount).toBe(1);

    store.getState().clear();
    expect(store.getState()).toMatchObject({
      lines: [],
      unavailable: [],
      prunedCount: 0,
      lastValidatedAt: null,
    });

    // A hydrate computed for the pre-merge lines lands late.
    store.getState().applyHydrate({ missing: ['gone'], unavailable: ['soldout'] });
    expect(store.getState()).toMatchObject({ lines: [], unavailable: [], prunedCount: 0 });
  });

  it('persists lines and lastValidatedAt only', async () => {
    const store = await freshStore();
    store.getState().add('v', 1);
    store.getState().applyHydrate({ missing: [], unavailable: ['v'] });
    const saved = JSON.parse(storage.getItem(KEY)!);
    expect(saved.version).toBe(1);
    expect(Object.keys(saved.state).sort()).toEqual(['lastValidatedAt', 'lines']);
  });
});

describe('guest cart storage validation', () => {
  const seed = (state: unknown, version = 1) =>
    storage.setItem(KEY, JSON.stringify({ state, version }));

  it('drops corrupt lines on rehydrate and keeps the valid ones', async () => {
    seed({
      lines: [
        { variantId: 'ok', quantity: 2 },
        { variantId: 'zero', quantity: 0 },
        { variantId: 'nan', quantity: null },
        { variantId: 'str', quantity: '3' },
        { variantId: 'frac', quantity: 1.5 },
        { variantId: 'neg', quantity: -1 },
        { quantity: 1 },
        { variantId: '', quantity: 1 },
        { variantId: 7, quantity: 1 },
        null,
      ],
      lastValidatedAt: 123,
    });
    const store = await freshStore();
    expect(store.getState().lines).toEqual([{ variantId: 'ok', quantity: 2 }]);
    expect(store.getState().lastValidatedAt).toBe(123);
  });

  it('survives a wrong version and the pre-version (0) shape, keeping valid lines', async () => {
    seed(
      {
        lines: [
          { variantId: 'a', quantity: 1 },
          { variantId: 'b', quantity: 0 },
        ],
      },
      0,
    );
    expect((await freshStore()).getState().lines).toEqual([{ variantId: 'a', quantity: 1 }]);
    seed({ lines: [{ variantId: 'c', quantity: 4 }] }, 99);
    expect((await freshStore()).getState().lines).toEqual([{ variantId: 'c', quantity: 4 }]);
  });

  it('falls back to an empty store for garbage state', async () => {
    seed({ lines: 'nope', lastValidatedAt: 'x' });
    const store = await freshStore();
    expect(store.getState().lines).toEqual([]);
    expect(store.getState().lastValidatedAt).toBeNull();
    storage.setItem(KEY, '{not json');
    expect((await freshStore()).getState().lines).toEqual([]);
  });

  it('caps stored lines at the hydrate limit so the request is never a 422', async () => {
    seed({ lines: Array.from({ length: 60 }, (_, i) => ({ variantId: `v${i}`, quantity: 1 })) });
    expect((await freshStore()).getState().lines).toHaveLength(50);
  });
});

describe('guest cart two-tab sync', () => {
  it('a storage event for the cart key rehydrates this tab; other keys are ignored', async () => {
    const store = await freshStore();
    store.getState().add('mine', 1);
    // Another tab wrote a different cart.
    storage.setItem(
      KEY,
      JSON.stringify({ state: { lines: [{ variantId: 'theirs', quantity: 3 }] }, version: 1 }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
    expect(store.getState().lines[0].variantId).toBe('mine');
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    expect(store.getState().lines).toEqual([{ variantId: 'theirs', quantity: 3 }]);
  });

  it('a cart cleared in another tab clears this one', async () => {
    const store = await freshStore();
    store.getState().add('v', 1);
    storage.setItem(
      KEY,
      JSON.stringify({ state: { lines: [], lastValidatedAt: null }, version: 1 }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    expect(store.getState().lines).toEqual([]);
  });
});
