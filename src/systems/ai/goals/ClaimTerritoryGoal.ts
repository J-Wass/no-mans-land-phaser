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
import type { Unit } from '@/entities/units/Unit';
import { TerrainType } from '@/systems/grid/Territory';
import { TerritoryBuildingType, TERRITORY_BUILDING_MAP } from '@/systems/territory/TerritoryBuilding';
import { addCosts } from '@/systems/resources/ResourceType';
import type { ResourceCost } from '@/systems/resources/ResourceType';
import { REGION_CONTROL_THRESHOLD } from '@/systems/regions/RegionSystem';

export class ClaimTerritoryGoal implements AIGoal {
  readonly id = 'claim-territory';

  /**
   * @param unitFilter Which idle units may be sent out to claim tiles (phase 2).
   *   Defaults to any unit; a profile can keep its army at home by passing e.g. Scouts only.
   * @param reserve Resources to keep in hand on top of an Outpost's cost (phase 1),
   *   so cheap Outposts don't starve buildings or units the profile is saving for.
   */
  constructor(
    private readonly unitFilter: (unit: Unit) => boolean = () => true,
    private readonly reserve: ResourceCost = {},
  ) {}

  priority(_ctx: AIContext): number { return 50; }

  isFeasible(ctx: AIContext): boolean {
    return (this.hasPendingOutpost(ctx) && this.canAffordOutpost(ctx)) || this.findExpansionMove(ctx) !== null;
  }

  execute(ctx: AIContext): GoalStatus {
    // Phase 1 — claim any tile a unit is already standing on
    if (this.hasPendingOutpost(ctx) && this.canAffordOutpost(ctx)) {
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

  private canAffordOutpost(ctx: AIContext): boolean {
    const cost = TERRITORY_BUILDING_MAP.get(TerritoryBuildingType.OUTPOST)?.cost ?? {};
    return ctx.gameState.getNation(ctx.nationId)?.getTreasury().hasResources(addCosts(cost, this.reserve)) ?? false;
  }

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

    // Score each candidate and pick the best
    const target = this.bestCandidate(ctx, candidates);

    // Find an idle unit that can reach it
    const units = ctx.gameState.getUnitsByNation(ctx.nationId).filter(
      u => u.isAlive() && !u.isEngagedInBattle() && !ctx.movementSystem.isMoving(u.id) && this.unitFilter(u),
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

  private bestCandidate(ctx: AIContext, candidates: GridCoordinates[]): GridCoordinates {
    const grid          = ctx.gameState.getGrid();
    const regionSystem  = ctx.gameState.getRegionSystem();

    let best      = candidates[0]!;
    let bestScore = -Infinity;

    for (const pos of candidates) {
      let score = 0;
      const territory = grid.getTerritory(pos);
      if (!territory) continue;

      // Prefer deposit tiles
      if (territory.getResourceDeposit()) score += 30;

      // Terrain income bonus
      switch (territory.getTerrainType()) {
        case TerrainType.PLAINS:      score += 5; break;
        case TerrainType.FOREST:      score += 4; break;
        case TerrainType.SNOW_FOREST: score += 4; break;
        case TerrainType.DESERT:      score += 3; break;
        default: break;
      }

      // Region completion bonus — prefer tiles in regions we partially control
      if (regionSystem) {
        const region = regionSystem.getRegionAt(pos);
        if (region) {
          let ownedCount = 0;
          for (const tile of region.tiles) {
            if (grid.getTerritory(tile)?.getControllingNation() === ctx.nationId) ownedCount++;
          }
          const fraction = ownedCount / region.tiles.length;
          // Only bonus if we're progressing toward domination but not already there
          if (fraction > 0 && fraction < REGION_CONTROL_THRESHOLD) {
            score += Math.round(fraction * 20);
          }
        }
      }

      if (score > bestScore) { bestScore = score; best = pos; }
    }
    return best;
  }
}
