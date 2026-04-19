export type Difficulty = 'easy' | 'medium' | 'hard' | 'sandbox';
export type GameMode = 'skirmish' | 'scenario';

export interface GameSetup {
  opponentCount: number; // 1-4
  difficulty: Difficulty;
  gameMode: GameMode;
  scenarioId: string | null;
}

export function normalizeGameSetup(setup?: Partial<GameSetup> | null): GameSetup {
  const opponentCount = Math.max(1, Math.min(4, setup?.opponentCount ?? 1));
  return {
    opponentCount,
    difficulty: setup?.difficulty ?? 'medium',
    gameMode: setup?.gameMode ?? 'skirmish',
    scenarioId: setup?.scenarioId ?? null,
  };
}

/** One unit's in-flight movement state, persisted with a save. */
export interface SavedMovementState {
  unitId: string;
  path: Array<{ row: number; col: number }>;
  ticksRemainingOnStep: number;
}

export interface SavedBattleState {
  id: string;
  unitAId: string;
  unitBId: string;
  position: { row: number; col: number };
  attackerId: string;
  attackerOrigin: { row: number; col: number };
  defenderOrigin: { row: number; col: number };
  ticksUntilRound: number;
  roundsElapsed: number;
  startedAtTick: number;
}

export interface SavedSiegeState {
  id: string;
  unitId: string;
  cityId: string;
  position: { row: number; col: number };
  attackerOrigin: { row: number; col: number };
  pendingPath?: Array<{ row: number; col: number }>;
  ticksUntilRound: number;
  roundsElapsed: number;
}

export interface SavedPeaceCooldown {
  key: string;          // sorted "nationA:nationB"
  expiresAtTick: number;
}

export interface GameSaveData {
  version: 1;
  savedAt: number; // Date.now() timestamp
  setup: GameSetup;
  currentTick: number;
  /** Snapshot from GameState.toJSON() */
  state: Record<string, unknown>;
  movementStates: SavedMovementState[];
  battleStates: SavedBattleState[];
  siegeStates?: SavedSiegeState[];
  peaceCooldowns?: SavedPeaceCooldown[];
}
