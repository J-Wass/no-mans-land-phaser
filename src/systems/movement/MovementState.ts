import type { EntityId, GridCoordinates } from '@/types/common';

export interface UnitMovementState {
  readonly unitId: EntityId;
  path: GridCoordinates[];          // remaining steps; index 0 = next tile
  ticksRemainingOnStep: number;     // countdown to committing path[0]
}

export type MovementMap = Map<EntityId, UnitMovementState>;
