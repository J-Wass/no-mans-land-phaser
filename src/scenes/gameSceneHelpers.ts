/**
 * Pure, presentation-only helpers extracted from GameScene to keep that file
 * focused on scene wiring. These have no Phaser or game-state dependencies.
 */

import { TerrainType } from '@/systems/grid/Territory';
import type { Unit, BattleOrder } from '@/entities/units/Unit';

/** Terrain → loaded texture key. */
export const TERRAIN_TEXTURE: Record<TerrainType, string> = {
  [TerrainType.PLAINS]: 'terrain_plains',
  [TerrainType.SNOW_FOREST]: 'terrain_snow_forest',
  [TerrainType.FOREST]: 'terrain_forest',
  [TerrainType.MOUNTAIN]: 'terrain_mountain',
  [TerrainType.WATER]: 'terrain_water',
  [TerrainType.DESERT]: 'terrain_desert',
};

/** Order terrains cycle through when sandbox tile-painting. */
export const TERRAIN_CYCLE: TerrainType[] = [
  TerrainType.PLAINS, TerrainType.SNOW_FOREST, TerrainType.FOREST,
  TerrainType.MOUNTAIN, TerrainType.DESERT, TerrainType.WATER,
];

/** Icon glyph drawn on a tile for each resource-deposit type. */
export const DEPOSIT_ICON: Record<string, string> = {
  COPPER:         '⊛',
  IRON:           '⊗',
  FIRE_GLASS:     '◈',
  SILVER:         '◇',
  GOLD_DEPOSIT:   '◆',
  WATER_MANA:     '~',
  FIRE_MANA:      '▲',
  LIGHTNING_MANA: '⚡',
  EARTH_MANA:     '◉',
  AIR_MANA:       '≋',
  SHADOW_MANA:    '◐',
};

/** Hover-tooltip text explaining what each deposit does (when its mine is built). */
export const DEPOSIT_INFO: Record<string, string> = {
  COPPER:         'Copper\nCopper Mine → Bronze weapons (+2 melee & ranged).\nEnables Cavalry & Crossbowman.',
  IRON:           'Iron\nIron Mine → Iron weapons (+4 melee & ranged).\nEnables Heavy Infantry, Catapult & Crossbowman.',
  FIRE_GLASS:     'Fire Glass\nFire Glass Mine → Fire Glass weapons (+6 melee & ranged).\nEnables Trebuchet & Crossbowman.',
  SILVER:         'Silver\nA valuable precious-metal deposit.',
  GOLD_DEPOSIT:   'Gold\nA rich precious-metal deposit.',
  WATER_MANA:     'Water Mana\nMana Mine → heals your whole army (+5% max HP per pulse, up to +15%).',
  FIRE_MANA:      'Fire Mana\nMana Mine → +10% unit damage per mine (up to +30%).',
  LIGHTNING_MANA: 'Lightning Mana\nMana Mine → +1 movement speed per mine (up to +3).',
  EARTH_MANA:     'Earth Mana\nMana Mine → +10% damage mitigation per mine (up to +30%).',
  AIR_MANA:       'Air Mana\nMana Mine → +1 vision per mine (up to +3).',
  SHADOW_MANA:    'Shadow Mana\nMana Mine → conceals your units and improves withdrawals.',
};

/** Single-letter label drawn over a unit sprite. */
export function unitInitial(unit: Unit): string {
  switch (unit.getUnitType()) {
    case 'INFANTRY': return 'I';
    case 'SCOUT': return 'S';
    case 'HEAVY_INFANTRY': return 'H';
    case 'CAVALRY': return 'C';
    case 'LONGBOWMAN': return 'L';
    case 'CROSSBOWMAN': return 'X';
    case 'CATAPULT': return 'K';
    case 'TREBUCHET': return 'T';
    default: return '?';
  }
}

export function stanceShortLabel(order: BattleOrder): string {
  switch (order) {
    case 'FALL_BACK': return 'FALL BACK';
    case 'HOLD':      return 'HOLD';
    case 'ADVANCE':   return 'ADVANCE';
  }
}

export function stanceBadgeColor(order: BattleOrder): string {
  switch (order) {
    case 'FALL_BACK': return '#ffaa44';
    case 'HOLD':      return '#aaaacc';
    case 'ADVANCE':   return '#44ddff';
  }
}
