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
  [TerrainType.PLAINS]:   50,
  [TerrainType.SNOW_FOREST]:    75,
  [TerrainType.FOREST]:   100,
  [TerrainType.MOUNTAIN]: Infinity,
  [TerrainType.WATER]:    Infinity,
  [TerrainType.DESERT]:   75,
};

/** Units that move at effective speed=1 through FOREST. */
export const FOREST_PENALTY_UNITS = new Set<UnitType>([
  UnitType.HEAVY_INFANTRY,
  UnitType.CAVALRY,
  UnitType.CATAPULT,
  UnitType.TREBUCHET,
]);

/** The Wheel tech multiplies a unit's effective movement speed by this (+20%). */
export const WHEEL_SPEED_MULTIPLIER = 1.2;

/**
 * Returns the number of ticks required for a unit to move onto a tile
 * with the given terrain type.
 *
 * If `activeDeposits` is provided and contains EARTH_MANA, mountains become passable
 * (treated as hills). If WATER_MANA is active, water becomes passable (treated as hills).
 * LIGHTNING_MANA adds +1 effective speed per mine (up to +3).
 * `speedMultiplier` scales effective speed (e.g. 1.2 from the The Wheel tech).
 *
 * Returns Infinity for still-impassable terrain.
 */
export function stepCost(
  terrain: TerrainType,
  unitType: UnitType,
  stats: UnitStats,
  activeDeposits?: ReadonlySet<TerritoryResourceType>,
  activeCounts?: ReadonlyMap<TerritoryResourceType, number>,
  speedMultiplier = 1,
): number {
  let base = TERRAIN_BASE_COST[terrain];

  if (!isFinite(base) && activeDeposits) {
    if (terrain === TerrainType.MOUNTAIN && activeDeposits.has(TerritoryResourceType.EARTH_MANA)) {
      base = TERRAIN_BASE_COST[TerrainType.SNOW_FOREST];
    } else if (terrain === TerrainType.WATER && activeDeposits.has(TerritoryResourceType.WATER_MANA)) {
      base = TERRAIN_BASE_COST[TerrainType.SNOW_FOREST];
    }
  }

  if (!isFinite(base)) return Infinity;

  const effectiveSpeed =
    terrain === TerrainType.FOREST && FOREST_PENALTY_UNITS.has(unitType)
      ? 1
      : stats.speed;

  const speedBonus = lightningManaSpeedBonus(activeDeposits ?? new Set(), activeCounts);
  // Lightning mana (speedBonus) and The Wheel tech (speedMultiplier) both raise effective speed.
  const divisor = (effectiveSpeed + speedBonus) * speedMultiplier;
  return Math.max(1, Math.ceil(base / divisor));
}
