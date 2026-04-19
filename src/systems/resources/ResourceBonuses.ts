/**
 * ResourceBonuses — compute combat and economic bonuses from active territory deposits.
 *
 * A deposit is "active" when:
 *   - The territory is controlled by the nation, AND
 *   - The matching mine building has been constructed.
 *
 * Use GameState.getNationActiveDeposits(nationId) to get the presence set.
 * Use GameState.getNationActiveDepositCounts(nationId) to get per-type counts for
 * "further advantage" (2+ mines of the same type).
 */

import { TerritoryResourceType } from './TerritoryResourceType';

/**
 * Flat melee and ranged damage bonus from weapon-tier material mines.
 * Copper (+2) < Iron (+4) < Fire Glass (+6); only the best active tier applies.
 */
export function weaponTierDamageBonus(deposits: ReadonlySet<TerritoryResourceType>): number {
  if (deposits.has(TerritoryResourceType.FIRE_GLASS)) return 6;
  if (deposits.has(TerritoryResourceType.IRON))       return 4;
  if (deposits.has(TerritoryResourceType.COPPER))     return 2;
  return 0;
}

/** Clamp mine count to [0, 3]. */
function mineCount(
  type: TerritoryResourceType,
  deposits: ReadonlySet<TerritoryResourceType>,
  counts?: ReadonlyMap<TerritoryResourceType, number>,
): number {
  if (!deposits.has(type)) return 0;
  return Math.min(3, counts?.get(type) ?? 1);
}

/**
 * Damage multiplier from fire mana. +10% per mine, up to +30% at 3 mines.
 */
export function fireManaDamageFactor(
  deposits: ReadonlySet<TerritoryResourceType>,
  counts?: ReadonlyMap<TerritoryResourceType, number>,
): number {
  const n = mineCount(TerritoryResourceType.FIRE_MANA, deposits, counts);
  return 1.0 + n * 0.10;
}

/**
 * Damage mitigation factor from earth mana. +10% mitigation per mine, up to +30% at 3 mines.
 */
export function earthManaHPFactor(
  deposits: ReadonlySet<TerritoryResourceType>,
  counts?: ReadonlyMap<TerritoryResourceType, number>,
): number {
  const n = mineCount(TerritoryResourceType.EARTH_MANA, deposits, counts);
  return 1.0 + n * 0.10;
}

/**
 * Extra heal fraction of maxHP per water-mana heal pulse (independent of city).
 * +5% per mine, up to +15% at 3 mines.
 */
export function waterManaRegenBonus(
  deposits: ReadonlySet<TerritoryResourceType>,
  counts?: ReadonlyMap<TerritoryResourceType, number>,
): number {
  const n = mineCount(TerritoryResourceType.WATER_MANA, deposits, counts);
  return n * 0.05;
}

/**
 * Extra gold income per tick-interval from precious metal deposits.
 * Silver: +2 gold per mine, Gold deposit: +4 gold per mine, stacks up to 3 mines each.
 */
export function mineralGoldBonus(
  deposits: ReadonlySet<TerritoryResourceType>,
  counts?: ReadonlyMap<TerritoryResourceType, number>,
): number {
  let bonus = 0;
  const silverCount = mineCount(TerritoryResourceType.SILVER, deposits, counts);
  const goldCount   = mineCount(TerritoryResourceType.GOLD_DEPOSIT, deposits, counts);
  bonus += 2 * silverCount;
  bonus += 4 * goldCount;
  return bonus;
}

/**
 * Vision radius bonus from air mana. +1 per mine, up to +3 at 3 mines.
 */
export function airManaVisionBonus(
  deposits: ReadonlySet<TerritoryResourceType>,
  counts?: ReadonlyMap<TerritoryResourceType, number>,
): number {
  return mineCount(TerritoryResourceType.AIR_MANA, deposits, counts);
}

/**
 * How many tiles of vision to subtract from an observer looking at a shadow-mana unit.
 * -1 per mine, up to -3 at 3 mines. Apply with max(0, vision - reduction).
 */
export function shadowManaVisionReduction(
  deposits: ReadonlySet<TerritoryResourceType>,
  counts?: ReadonlyMap<TerritoryResourceType, number>,
): number {
  return mineCount(TerritoryResourceType.SHADOW_MANA, deposits, counts) > 0 ? 1 : 0;
}

/**
 * Extra withdraw chance from shadow mana after the first mine grants concealment.
 * 1 mine: +0%, 2 mines: +10%, 3 mines: +20%.
 */
export function shadowManaWithdrawBonus(
  deposits: ReadonlySet<TerritoryResourceType>,
  counts?: ReadonlyMap<TerritoryResourceType, number>,
): number {
  const n = mineCount(TerritoryResourceType.SHADOW_MANA, deposits, counts);
  return Math.max(0, n - 1) * 0.10;
}

/**
 * Extra effective speed from lightning mana. +1 speed per mine, up to +3 at 3 mines.
 */
export function lightningManaSpeedBonus(
  deposits: ReadonlySet<TerritoryResourceType>,
  counts?: ReadonlyMap<TerritoryResourceType, number>,
): number {
  return mineCount(TerritoryResourceType.LIGHTNING_MANA, deposits, counts);
}
