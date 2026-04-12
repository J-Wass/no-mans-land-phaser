/**
 * Movement cost table.
 * Formula: stepCost = ceil(TERRAIN_BASE_COST[terrain] / unit.speed)
 * Forest-penalty units use effective speed=1 in FOREST regardless of stat.
 */

import { TerrainType } from '@/systems/grid/Territory';
import { UnitType } from '@/entities/units/Unit';
import type { UnitStats } from '@/entities/units/Unit';

export const TERRAIN_BASE_COST: Record<TerrainType, number> = {
  [TerrainType.PLAINS]:   10,
  [TerrainType.HILLS]:    15,
  [TerrainType.FOREST]:   20,
  [TerrainType.MOUNTAIN]: Infinity,
  [TerrainType.WATER]:    Infinity,
  [TerrainType.DESERT]:   15,
};

/** Units that move at effective speed=1 through FOREST. */
export const FOREST_PENALTY_UNITS = new Set<UnitType>([
  UnitType.HEAVY_INFANTRY,
  UnitType.CAVALRY,
  UnitType.CATAPULT,
  UnitType.TREBUCHET,
]);

/**
 * Returns the number of ticks required for a unit to move onto a tile
 * with the given terrain type.
 * Returns Infinity for impassable terrain.
 */
export function stepCost(
  terrain: TerrainType,
  unitType: UnitType,
  stats: UnitStats
): number {
  const base = TERRAIN_BASE_COST[terrain];
  if (!isFinite(base)) return Infinity;

  const effectiveSpeed =
    terrain === TerrainType.FOREST && FOREST_PENALTY_UNITS.has(unitType)
      ? 1
      : stats.speed;

  return Math.max(1, Math.ceil(base / effectiveSpeed));
}
