import type { GameSaveData } from '@/types/gameSetup';

export interface SaveSlotSummary {
  slot: number;
  saveData: GameSaveData | null;
}

const SLOT_COUNT = 10;
const SAVE_KEY_PREFIX = 'phaser-rts-save-slot-';

function slotKey(slot: number): string {
  return `${SAVE_KEY_PREFIX}${slot}`;
}

export class SaveSystem {
  public static readonly SLOT_COUNT = SLOT_COUNT;

  public static save(slot: number, data: GameSaveData): void {
    try {
      localStorage.setItem(slotKey(slot), JSON.stringify(data));
    } catch {
      console.error('[SaveSystem] Failed to write save data');
    }
  }

  public static load(slot: number): GameSaveData | null {
    try {
      const raw = localStorage.getItem(slotKey(slot));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as GameSaveData;
      if (parsed.version !== 1) return null;
      return parsed;
    } catch {
      console.error('[SaveSystem] Failed to read save data');
      return null;
    }
  }

  public static hasSave(slot: number): boolean {
    return localStorage.getItem(slotKey(slot)) !== null;
  }

  public static deleteSave(slot: number): void {
    localStorage.removeItem(slotKey(slot));
  }

  public static listSlots(): SaveSlotSummary[] {
    const slots: SaveSlotSummary[] = [];
    for (let slot = 1; slot <= SLOT_COUNT; slot++) {
      slots.push({ slot, saveData: this.load(slot) });
    }
    return slots;
  }
}
