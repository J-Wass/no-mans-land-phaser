import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SaveSystem } from './SaveSystem';
import type { GameSaveData } from '@/types/gameSetup';
import { normalizeGameSetup } from '@/types/gameSetup';

class MemoryStorage {
  private readonly store = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }
}

function makeSaveData(savedAt: number): GameSaveData {
  return {
    version: 1,
    savedAt,
    setup: normalizeGameSetup({ gameMode: 'scenario', scenarioId: 'intro' }),
    currentTick: 42,
    state: { hello: 'world' },
    movementStates: [],
    battleStates: [],
    siegeStates: [],
    peaceCooldowns: [],
  };
}

describe('SaveSystem', () => {
  const storage = new MemoryStorage();

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
  });

  it('saves, loads, and lists up to 10 slots', () => {
    const slot1 = makeSaveData(1000);
    const slot3 = makeSaveData(3000);

    SaveSystem.save(1, slot1);
    SaveSystem.save(3, slot3);

    expect(SaveSystem.SLOT_COUNT).toBe(10);
    expect(SaveSystem.hasSave(1)).toBe(true);
    expect(SaveSystem.load(3)).toEqual(slot3);
    expect(SaveSystem.listSlots()).toEqual([
      { slot: 1, saveData: slot1 },
      { slot: 2, saveData: null },
      { slot: 3, saveData: slot3 },
      { slot: 4, saveData: null },
      { slot: 5, saveData: null },
      { slot: 6, saveData: null },
      { slot: 7, saveData: null },
      { slot: 8, saveData: null },
      { slot: 9, saveData: null },
      { slot: 10, saveData: null },
    ]);
  });

  it('deletes saves and rejects unsupported versions or corrupt data', () => {
    SaveSystem.save(2, makeSaveData(2000));
    SaveSystem.deleteSave(2);

    expect(SaveSystem.hasSave(2)).toBe(false);
    expect(SaveSystem.load(2)).toBeNull();

    localStorage.setItem('phaser-rts-save-slot-4', JSON.stringify({ ...makeSaveData(4000), version: 2 }));
    expect(SaveSystem.load(4)).toBeNull();

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('phaser-rts-save-slot-5', '{not-json');
    expect(SaveSystem.load(5)).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('rejects a truncated save that has the right version but is missing required fields', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // This is the exact shape a truncated/malformed import would produce —
    // passes a naive `version === 1` check but has none of the state a load
    // actually needs.
    expect(SaveSystem.parse('{"version":1}')).toBeNull();
    errorSpy.mockRestore();
  });

  it('rejects save data larger than the maximum allowed size', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const huge = 'x'.repeat(21 * 1024 * 1024);
    expect(SaveSystem.parse(huge)).toBeNull();
    errorSpy.mockRestore();
  });

  it('save() reports failure instead of silently succeeding when storage throws', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const failingStorage = {
      ...storage,
      setItem: () => { throw new Error('quota exceeded'); },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: failingStorage, configurable: true, writable: true,
    });

    expect(SaveSystem.save(1, makeSaveData(1000))).toBe(false);
    errorSpy.mockRestore();
  });

  it('finds the most recently saved slot regardless of slot number', () => {
    expect(SaveSystem.mostRecentSlot()).toBeNull();
    SaveSystem.save(1, makeSaveData(1000));
    SaveSystem.save(7, makeSaveData(9000));
    SaveSystem.save(3, makeSaveData(5000));
    expect(SaveSystem.mostRecentSlot()?.slot).toBe(7);
  });
});
