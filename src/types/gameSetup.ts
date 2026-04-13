export type Difficulty = 'easy' | 'medium' | 'hard';

export interface GameSetup {
  opponentCount: number; // 1–4
  difficulty: Difficulty;
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
  momentum: number;
  startedAtTick: number;
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
}
