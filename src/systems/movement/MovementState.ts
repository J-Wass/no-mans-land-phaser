import type { EntityId, GridCoordinates } from '@/types/common';

export interface UnitMovementState {
  readonly unitId: EntityId;
  path: GridCoordinates[];          // remaining steps; index 0 = next tile
  ticksRemainingOnStep: number;     // countdown to committing path[0]
  /** Consecutive ticks spent waiting for a friendly unit to clear path[0] (absent = 0). */
  blockedTicks?: number;
}

export type MovementMap = Map<EntityId, UnitMovementState>;
