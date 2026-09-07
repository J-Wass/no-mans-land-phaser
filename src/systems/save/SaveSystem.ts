import type { GameSaveData } from '@/types/gameSetup';

export interface SaveSlotSummary {
  slot: number;
  saveData: GameSaveData | null;
}

const SLOT_COUNT = 10;
const SAVE_KEY_PREFIX = 'phaser-rts-save-slot-';
/** Generous but bounded — guards against an oversized/malformed file (e.g. an
 * imported save) exhausting memory during JSON.parse. */
const MAX_SAVE_JSON_LENGTH = 20 * 1024 * 1024;

function slotKey(slot: number): string {
  return `${SAVE_KEY_PREFIX}${slot}`;
}

/** Structural check — enough to catch a truncated/malformed save (e.g. `{"version":1}`)
 * before it's handed to GameState.fromJSON, which assumes these fields exist. */
function isValidSaveData(value: unknown): value is GameSaveData {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v['version'] === 1 &&
    typeof v['savedAt'] === 'number' &&
    !!v['setup'] && typeof v['setup'] === 'object' &&
    typeof v['currentTick'] === 'number' &&
    !!v['state'] && typeof v['state'] === 'object' &&
    Array.isArray(v['movementStates']) &&
    Array.isArray(v['battleStates'])
  );
}

export class SaveSystem {
  public static readonly SLOT_COUNT = SLOT_COUNT;

  /** Parse and structurally validate save JSON (from localStorage or an imported file). */
  public static parse(raw: string): GameSaveData | null {
    if (raw.length > MAX_SAVE_JSON_LENGTH) {
      console.error('[SaveSystem] Save data exceeds maximum allowed size');
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('[SaveSystem] Failed to parse save data');
      return null;
    }
    if (!isValidSaveData(parsed)) {
      console.error('[SaveSystem] Save data failed validation');
      return null;
    }
    return parsed;
  }

  /** @returns whether the write actually succeeded — callers must not report success on `false`. */
  public static save(slot: number, data: GameSaveData): boolean {
    try {
      localStorage.setItem(slotKey(slot), JSON.stringify(data));
      return true;
    } catch {
      console.error('[SaveSystem] Failed to write save data');
      return false;
    }
  }

  public static load(slot: number): GameSaveData | null {
    try {
      const raw = localStorage.getItem(slotKey(slot));
      if (!raw) return null;
      return this.parse(raw);
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
