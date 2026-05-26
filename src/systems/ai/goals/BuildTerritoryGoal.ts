/**
 * BuildTerritoryGoal — builds mines on deposit tiles the AI controls.
 * Requires the tile to have an OUTPOST and the appropriate tech.
 */

import type { AIContext, AIGoal, GoalStatus } from '../AITypes';
import type { GridCoordinates } from '@/types/common';
import { TerritoryBuildingType, TERRITORY_BUILDING_MAP } from '@/systems/territory/TerritoryBuilding';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';

const MANA_DEPOSITS = new Set<TerritoryResourceType>([
  TerritoryResourceType.WATER_MANA,
  TerritoryResourceType.FIRE_MANA,
  TerritoryResourceType.LIGHTNING_MANA,
  TerritoryResourceType.EARTH_MANA,
  TerritoryResourceType.AIR_MANA,
  TerritoryResourceType.SHADOW_MANA,
]);

/**
 * Map from deposit type to the mine that exploits it.
 *
 * SILVER and GOLD_DEPOSIT are intentionally absent: there is no dedicated mine
 * building for them, and each mine enforces a matching `requiresDeposit`, so
 * dispatching COPPER_MINE onto a silver/gold tile is always rejected by the
 * CommandProcessor. Mapping them here just made the AI spam failing commands.
 */
const DEPOSIT_TO_MINE: Partial<Record<TerritoryResourceType, TerritoryBuildingType>> = {
  [TerritoryResourceType.COPPER]:         TerritoryBuildingType.COPPER_MINE,
  [TerritoryResourceType.IRON]:           TerritoryBuildingType.IRON_MINE,
  [TerritoryResourceType.FIRE_GLASS]:     TerritoryBuildingType.FIRE_GLASS_MINE,
};

/** Higher = prefer earlier. Mana and advanced ore mines are most impactful. */
const MINE_PRIORITY: Record<TerritoryBuildingType, number> = {
  [TerritoryBuildingType.MANA_MINE]:       40,
  [TerritoryBuildingType.FIRE_GLASS_MINE]: 35,
  [TerritoryBuildingType.IRON_MINE]:       30,
  [TerritoryBuildingType.COPPER_MINE]:     20,
  // Non-mine entries (required for complete record)
  [TerritoryBuildingType.OUTPOST]:          0,
  [TerritoryBuildingType.WALLS]:            0,
  [TerritoryBuildingType.FARMS]:            0,
  [TerritoryBuildingType.WORKSHOP]:         0,
  [TerritoryBuildingType.WATCHTOWER]:       0,
};

export class BuildTerritoryGoal implements AIGoal {
  readonly id = 'build-territory';

  /** Memoized full-grid scan result; valid only for the tick it was computed on. */
  private memoTick = -1;
  private memoBuild: { position: GridCoordinates; mine: TerritoryBuildingType } | null = null;

  priority(_ctx: AIContext): number { return 45; }

  isFeasible(ctx: AIContext): boolean {
    return this.findBuild(ctx) !== null;
  }

  execute(ctx: AIContext): GoalStatus {
    const build = this.findBuild(ctx);
    if (!build) return 'failed';

    const r = ctx.commandProcessor.dispatch({
      type:         'BUILD_TERRITORY',
      playerId:     ctx.playerId,
      position:     build.position,
      building:     build.mine,
      issuedAtTick: ctx.currentTick,
    });
    return r.success ? 'ongoing' : 'failed';
  }

  private findBuild(ctx: AIContext): { position: GridCoordinates; mine: TerritoryBuildingType } | null {
    // isFeasible() and execute() both call this within the same evaluation tick;
    // memoize so the full-grid scan runs once per cycle, not twice.
    if (this.memoTick === ctx.currentTick) return this.memoBuild;

    const result = this.computeBuild(ctx);
    this.memoTick = ctx.currentTick;
    this.memoBuild = result;
    return result;
  }

  private computeBuild(ctx: AIContext): { position: GridCoordinates; mine: TerritoryBuildingType } | null {
    const nation = ctx.gameState.getNation(ctx.nationId);
    if (!nation) return null;

    const grid = ctx.gameState.getGrid();
    const { rows, cols } = grid.getSize();

    let bestPriority = -1;
    let best: { position: GridCoordinates; mine: TerritoryBuildingType } | null = null;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const territory = grid.getTerritory({ row: r, col: c });
        if (!territory) continue;
        if (territory.getControllingNation() !== ctx.nationId) continue;

        const deposit = territory.getResourceDeposit();
        if (!deposit) continue;

        // Determine which mine building this deposit needs
        let mine: TerritoryBuildingType;
        if (MANA_DEPOSITS.has(deposit)) {
          mine = TerritoryBuildingType.MANA_MINE;
        } else {
          const mapped = DEPOSIT_TO_MINE[deposit];
          if (!mapped) continue;
          mine = mapped;
        }

        // Skip if already built or under construction
        if (territory.hasBuilding(mine)) continue;
        if (territory.getCurrentConstruction()?.building === mine) continue;

        // Check tech requirement
        const def = TERRITORY_BUILDING_MAP.get(mine);
        if (!def) continue;
        if (def.requiresTech && !nation.hasResearched(def.requiresTech)) continue;

        // Check resources
        if (!nation.getTreasury().hasResources(def.cost)) continue;

        const prio = MINE_PRIORITY[mine] ?? 0;
        if (prio > bestPriority) {
          bestPriority = prio;
          best = { position: { row: r, col: c }, mine };
        }
      }
    }
    return best;
  }
}
