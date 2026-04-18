/**
 * ClaimTerritoryGoal — two-phase territory expansion.
 *
 * Phase 1: if any friendly unit is standing on an unclaimed passable tile,
 *          immediately build an outpost there.
 * Phase 2: otherwise, pick an unclaimed tile adjacent to our territory and
 *          route an idle unit toward it.
 */

import type { AIContext, AIGoal, GoalStatus } from '../AITypes';
import type { GridCoordinates } from '@/types/common';
import { TerrainType } from '@/systems/grid/Territory';
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';

export class ClaimTerritoryGoal implements AIGoal {
  readonly id = 'claim-territory';

  priority(_ctx: AIContext): number { return 50; }

  isFeasible(ctx: AIContext): boolean {
    return this.hasPendingOutpost(ctx) || this.findExpansionMove(ctx) !== null;
  }

  execute(ctx: AIContext): GoalStatus {
    // Phase 1 — claim any tile a unit is already standing on
    if (this.hasPendingOutpost(ctx)) {
      for (const unit of ctx.gameState.getUnitsByNation(ctx.nationId)) {
        if (!unit.isAlive()) continue;
        const t = ctx.gameState.getGrid().getTerritory(unit.position);
        if (!t || t.getControllingNation()) continue;
        const terrain = t.getTerrainType();
        if (terrain === TerrainType.WATER || terrain === TerrainType.MOUNTAIN) continue;

        const r = ctx.commandProcessor.dispatch({
          type:         'BUILD_TERRITORY',
          playerId:     ctx.playerId,
          position:     unit.position,
          building:     TerritoryBuildingType.OUTPOST,
          issuedAtTick: ctx.currentTick,
        });
        if (r.success) return 'complete';
      }
    }

    // Phase 2 — move a unit toward an unclaimed tile
    const move = this.findExpansionMove(ctx);
    if (!move) return 'failed';

    const r = ctx.commandProcessor.dispatch({
      type:         'MOVE_UNIT',
      playerId:     ctx.playerId,
      unitId:       move.unitId,
      path:         move.path,
      issuedAtTick: ctx.currentTick,
    });
    return r.success ? 'ongoing' : 'failed';
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private hasPendingOutpost(ctx: AIContext): boolean {
    const grid = ctx.gameState.getGrid();
    return ctx.gameState.getUnitsByNation(ctx.nationId).some(unit => {
      if (!unit.isAlive()) return false;
      const t = grid.getTerritory(unit.position);
      if (!t || t.getControllingNation()) return false;
      const terrain = t.getTerrainType();
      return terrain !== TerrainType.WATER && terrain !== TerrainType.MOUNTAIN;
    });
  }

  private findExpansionMove(
    ctx: AIContext,
  ): { unitId: string; path: GridCoordinates[] } | null {
    const grid  = ctx.gameState.getGrid();
    const { rows, cols } = grid.getSize();

    // Collect unclaimed passable tiles adjacent to our territory
    const ownedSet = new Set<string>();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid.getTerritory({ row: r, col: c })?.getControllingNation() === ctx.nationId) {
          ownedSet.add(`${r},${c}`);
        }
      }
    }

    const candidates: GridCoordinates[] = [];
    for (const key of ownedSet) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nr = r + dr; const nc = c + dc;
        const t  = grid.getTerritory({ row: nr, col: nc });
        if (!t || t.getControllingNation()) continue;
        const terrain = t.getTerrainType();
        if (terrain === TerrainType.WATER || terrain === TerrainType.MOUNTAIN) continue;
        candidates.push({ row: nr, col: nc });
      }
    }

    if (candidates.length === 0) return null;

    // Pick a random candidate (spread expansion)
    const target = candidates[Math.floor(Math.random() * candidates.length)]!;

    // Find an idle unit that can reach it
    const units = ctx.gameState.getUnitsByNation(ctx.nationId).filter(
      u => u.isAlive() && !u.isEngagedInBattle() && !ctx.movementSystem.isMoving(u.id),
    );

    for (const unit of units) {
      const path = ctx.pathfinder.findPath(
        unit.position, target, unit.getUnitType(), unit.getStats(),
        ctx.nationId, ctx.gameState,
      );
      if (path && path.length > 0) return { unitId: unit.id, path };
    }
    return null;
  }
}
