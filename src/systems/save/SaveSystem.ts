import type { GameSaveData } from '@/types/gameSetup';

const SAVE_KEY = 'phaser-rts-save';

export class SaveSystem {
  public static save(data: GameSaveData): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      console.error('[SaveSystem] Failed to write save data');
    }
  }

  public static load(): GameSaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as GameSaveData;
      if (parsed.version !== 1) return null;
      return parsed;
    } catch {
      console.error('[SaveSystem] Failed to read save data');
      return null;
    }
  }

  public static hasSave(): boolean {
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  public static deleteSave(): void {
    localStorage.removeItem(SAVE_KEY);
  }
}
