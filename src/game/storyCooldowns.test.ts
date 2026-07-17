import { beforeEach, describe, expect, it } from 'vitest';
import { carryCooldownsForward, takeCarriedCooldowns } from './storyCooldowns';

/** Minimal in-memory Storage stand-in for globalThis.sessionStorage in tests. */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = createMemoryStorage();
});

describe('storyCooldowns', () => {
  it('round-trips a cooldowns array', () => {
    carryCooldownsForward([0, 2, 4, 0, 1]);
    expect(takeCarriedCooldowns()).toEqual([0, 2, 4, 0, 1]);
  });

  it('is single-use: a second read returns null', () => {
    carryCooldownsForward([1, 2, 3]);
    expect(takeCarriedCooldowns()).toEqual([1, 2, 3]);
    expect(takeCarriedCooldowns()).toBeNull();
  });

  it('returns null when nothing was ever carried', () => {
    expect(takeCarriedCooldowns()).toBeNull();
  });

  it('returns null on malformed stored data instead of throwing', () => {
    sessionStorage.setItem('match3-carry-cooldowns', 'not json');
    expect(() => takeCarriedCooldowns()).not.toThrow();
    expect(takeCarriedCooldowns()).toBeNull();

    sessionStorage.setItem('match3-carry-cooldowns', JSON.stringify({ not: 'an array' }));
    expect(takeCarriedCooldowns()).toBeNull();

    sessionStorage.setItem('match3-carry-cooldowns', JSON.stringify(['x', 'y']));
    expect(takeCarriedCooldowns()).toBeNull();
  });

  it('does not throw when sessionStorage is unavailable', () => {
    const original = (globalThis as unknown as { sessionStorage?: Storage }).sessionStorage;
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
    try {
      expect(() => carryCooldownsForward([1, 2, 3])).not.toThrow();
      expect(takeCarriedCooldowns()).toBeNull();
    } finally {
      (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = original as Storage;
    }
  });
});
