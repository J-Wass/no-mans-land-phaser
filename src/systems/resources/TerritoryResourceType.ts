/**
 * Territory resource deposits — tile-level bonuses, not economy resources.
 * Mana types grant unit/army advantages; materials enable weapon tiers.
 */

export enum TerritoryResourceType {
  // Mana deposits
  WATER_MANA     = 'WATER_MANA',
  FIRE_MANA      = 'FIRE_MANA',
  LIGHTNING_MANA = 'LIGHTNING_MANA',
  EARTH_MANA     = 'EARTH_MANA',
  AIR_MANA       = 'AIR_MANA',
  SHADOW_MANA    = 'SHADOW_MANA',
  // Material deposits
  COPPER         = 'COPPER',
  IRON           = 'IRON',
  FIRE_GLASS     = 'FIRE_GLASS',
  SILVER         = 'SILVER',
  GOLD_DEPOSIT   = 'GOLD_DEPOSIT',
}
