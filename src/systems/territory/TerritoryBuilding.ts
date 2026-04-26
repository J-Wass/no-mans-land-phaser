/**
 * Territory building types and catalog.
 * Source: "no mans land" spreadsheet, Buildings sheet (Territory / Both columns).
 *
 * OUTPOST claims an unclaimed tile (requires a friendly unit on the tile).
 * All other buildings require OUTPOST first.
 * Resource mines additionally require the matching deposit on the territory.
 */

import type { ResourceCost } from '@/systems/resources/ResourceType';
import { ResourceType } from '@/systems/resources/ResourceType';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import type { TechId } from '@/systems/research/TechTree';

export enum TerritoryBuildingType {
  OUTPOST         = 'OUTPOST',
  WALLS           = 'WALLS',
  FARMS           = 'FARMS',
  WORKSHOP        = 'WORKSHOP',
  WATCHTOWER      = 'WATCHTOWER',
  COPPER_MINE     = 'COPPER_MINE',
  IRON_MINE       = 'IRON_MINE',
  FIRE_GLASS_MINE = 'FIRE_GLASS_MINE',
  MANA_MINE       = 'MANA_MINE',
}

export interface TerritoryBuildingDef {
  type:             TerritoryBuildingType;
  label:            string;
  perks:            string;
  cost:             ResourceCost;
  /** Another building that must already exist on this tile. */
  requires:         TerritoryBuildingType | null;
  /** Tech that must be researched first. */
  requiresTech:     TechId | null;
  /** Territory resource deposit required (for mines). */
  requiresDeposit:  TerritoryResourceType | null;
  /** Maximum level this building can be upgraded to (1 = no upgrades). */
  maxLevel:         number;
  /** Cost to upgrade from level N to N+1 (used for all levels). */
  upgradeCost:      ResourceCost;
}

export const TERRITORY_BUILDING_CATALOG: TerritoryBuildingDef[] = [
  {
    type: TerritoryBuildingType.OUTPOST,
    label: 'Outpost',
    perks: 'Claims this tile for your nation. Prerequisite for all other territory buildings.',
    cost: { [ResourceType.GOLD]: 5, [ResourceType.RAW_MATERIAL]: 10, [ResourceType.FOOD]: 5 },
    requires: null,
    requiresTech: null,
    requiresDeposit: null,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: TerritoryBuildingType.WALLS,
    label: 'Walls',
    perks: 'Lvl1: +50HP +8dmg  Lvl2: +100HP +12dmg range2  Lvl3: +150HP +16dmg  Lvl4: +200HP +20dmg range3  Lvl5: +250HP +24dmg',
    cost: { [ResourceType.GOLD]: 5, [ResourceType.RAW_MATERIAL]: 20 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
    maxLevel: 5,
    upgradeCost: { [ResourceType.GOLD]: 15, [ResourceType.RAW_MATERIAL]: 30 },
  },
  {
    type: TerritoryBuildingType.FARMS,
    label: 'Farms',
    perks: '🍎 +2 Food/s — sustains your army and cities.',
    cost: { [ResourceType.RAW_MATERIAL]: 20 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: TerritoryBuildingType.WORKSHOP,
    label: 'Workshop',
    perks: '🧱 +1 Raw Material/s — accelerates construction and unit production.',
    cost: { [ResourceType.RAW_MATERIAL]: 20 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: TerritoryBuildingType.WATCHTOWER,
    label: 'Watchtower',
    perks: 'Extends vision radius by 2 tiles around this territory.',
    cost: { [ResourceType.RAW_MATERIAL]: 15 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: TerritoryBuildingType.COPPER_MINE,
    label: 'Copper Mine',
    perks: '⊛ Activates copper supply — +2 weapon damage (tier 1). Req: copper deposit.',
    cost: { [ResourceType.RAW_MATERIAL]: 25 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: TerritoryResourceType.COPPER,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: TerritoryBuildingType.IRON_MINE,
    label: 'Iron Mine',
    perks: '⊗ Activates iron supply — +4 weapon damage (tier 2). Req: iron deposit.',
    cost: { [ResourceType.RAW_MATERIAL]: 30 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'iron_working',
    requiresDeposit: TerritoryResourceType.IRON,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: TerritoryBuildingType.FIRE_GLASS_MINE,
    label: 'Fire Glass Mine',
    perks: '◈ Activates fire glass supply — +6 weapon damage (tier 3). Req: fire glass deposit.',
    cost: { [ResourceType.RAW_MATERIAL]: 40 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'steel_working',
    requiresDeposit: TerritoryResourceType.FIRE_GLASS,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: TerritoryBuildingType.MANA_MINE,
    label: 'Mana Mine',
    perks: '◆ Activates this tile\'s mana deposit effect. Req: any mana deposit.',
    cost: { [ResourceType.RAW_MATERIAL]: 35, [ResourceType.FOOD]: 10 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'mana_studies',
    requiresDeposit: null,
    maxLevel: 1,
    upgradeCost: {},
  },
];

export const TERRITORY_BUILDING_MAP = new Map<TerritoryBuildingType, TerritoryBuildingDef>(
  TERRITORY_BUILDING_CATALOG.map(b => [b.type, b]),
);

/** Emoji shown on the map tile for each building type. */
export const BUILDING_MAP_ICON: Record<TerritoryBuildingType, string> = {
  [TerritoryBuildingType.OUTPOST]:         '⚑',
  [TerritoryBuildingType.WALLS]:           '⊞',
  [TerritoryBuildingType.FARMS]:           '⌘',
  [TerritoryBuildingType.WORKSHOP]:        '✦',
  [TerritoryBuildingType.WATCHTOWER]:      '◉',
  [TerritoryBuildingType.COPPER_MINE]:     '⊛',
  [TerritoryBuildingType.IRON_MINE]:       '⊗',
  [TerritoryBuildingType.FIRE_GLASS_MINE]: '◈',
  [TerritoryBuildingType.MANA_MINE]:       '◆',
};
