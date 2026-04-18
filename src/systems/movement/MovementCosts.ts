/**
 * Movement cost table.
 * Formula: stepCost = ceil(TERRAIN_BASE_COST[terrain] / unit.speed)
 * Forest-penalty units use effective speed=1 in FOREST regardless of stat.
 * Mana bonuses (EARTH=mountainwalking, WATER=waterwalking) unlock otherwise-impassable terrain.
 */

import { TerrainType } from '@/systems/grid/Territory';
import { UnitType } from '@/entities/units/Unit';
import type { UnitStats } from '@/entities/units/Unit';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import { lightningManaSpeedBonus } from '@/systems/resources/ResourceBonuses';

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
 *
 * If `activeDeposits` is provided and contains EARTH_MANA, mountains become passable
 * (treated as hills). If WATER_MANA is active, water becomes passable (treated as hills).
 * LIGHTNING_MANA adds +1 effective speed per mine (up to +3).
 *
 * Returns Infinity for still-impassable terrain.
 */
export function stepCost(
  terrain: TerrainType,
  unitType: UnitType,
  stats: UnitStats,
  activeDeposits?: ReadonlySet<TerritoryResourceType>,
  activeCounts?: ReadonlyMap<TerritoryResourceType, number>,
): number {
  let base = TERRAIN_BASE_COST[terrain];

  if (!isFinite(base) && activeDeposits) {
    if (terrain === TerrainType.MOUNTAIN && activeDeposits.has(TerritoryResourceType.EARTH_MANA)) {
      base = TERRAIN_BASE_COST[TerrainType.HILLS];
    } else if (terrain === TerrainType.WATER && activeDeposits.has(TerritoryResourceType.WATER_MANA)) {
      base = TERRAIN_BASE_COST[TerrainType.HILLS];
    }
  }

  if (!isFinite(base)) return Infinity;

  const effectiveSpeed =
    terrain === TerrainType.FOREST && FOREST_PENALTY_UNITS.has(unitType)
      ? 1
      : stats.speed;

  const speedBonus = lightningManaSpeedBonus(activeDeposits ?? new Set(), activeCounts);
  if (speedBonus > 0) {
    return Math.max(1, Math.ceil(base / (effectiveSpeed + speedBonus)));
  }

  return Math.max(1, Math.ceil(base / effectiveSpeed));
}
