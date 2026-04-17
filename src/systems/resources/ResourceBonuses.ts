/**
 * ResourceBonuses — compute combat and economic bonuses from active territory deposits.
 *
 * A deposit is "active" when:
 *   - The territory is controlled by the nation, AND
 *   - The matching mine building has been constructed.
 *
 * Use GameState.getNationActiveDeposits(nationId) to get the set for a nation.
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

/**
 * Damage multiplier from fire mana (+10%).
 * Returns a factor to multiply the base offense score by.
 */
export function fireManaDamageFactor(deposits: ReadonlySet<TerritoryResourceType>): number {
  return deposits.has(TerritoryResourceType.FIRE_MANA) ? 1.10 : 1.0;
}

/**
 * Effective HP factor from earth mana (+15%).
 * Applied to the unit's current health ratio during mitigation/offense to simulate tougher units.
 */
export function earthManaHPFactor(deposits: ReadonlySet<TerritoryResourceType>): number {
  return deposits.has(TerritoryResourceType.EARTH_MANA) ? 1.15 : 1.0;
}

/**
 * Extra heal fraction of maxHP per city-heal pulse from water mana (+5% maxHP/s).
 * Add this to the base heal amount each pulse.
 */
export function waterManaRegenBonus(deposits: ReadonlySet<TerritoryResourceType>): number {
  return deposits.has(TerritoryResourceType.WATER_MANA) ? 0.05 : 0;
}

/**
 * Extra gold income per tick-interval from precious metal deposits.
 * Silver: +2 gold, Gold deposit: +4 gold.
 */
export function mineralGoldBonus(deposits: ReadonlySet<TerritoryResourceType>): number {
  let bonus = 0;
  if (deposits.has(TerritoryResourceType.SILVER))       bonus += 2;
  if (deposits.has(TerritoryResourceType.GOLD_DEPOSIT)) bonus += 4;
  return bonus;
}

/**
 * Whether a nation has an active air mana mine (grants +1 vision to all units).
 */
export function hasAirMana(deposits: ReadonlySet<TerritoryResourceType>): boolean {
  return deposits.has(TerritoryResourceType.AIR_MANA);
}

/**
 * Whether a nation has an active shadow mana mine (reduces enemy unit vision toward them by 1).
 */
export function hasShadowMana(deposits: ReadonlySet<TerritoryResourceType>): boolean {
  return deposits.has(TerritoryResourceType.SHADOW_MANA);
}

/**
 * Whether a nation has an active lightning mana mine.
 * Grants a +10% attack speed bonus (represented as extra attack factor in combat).
 */
export function lightningManaFactor(deposits: ReadonlySet<TerritoryResourceType>): number {
  return deposits.has(TerritoryResourceType.LIGHTNING_MANA) ? 1.10 : 1.0;
}
