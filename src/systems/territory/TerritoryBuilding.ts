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
}

export const TERRITORY_BUILDING_CATALOG: TerritoryBuildingDef[] = [
  {
    type: TerritoryBuildingType.OUTPOST,
    label: 'Outpost',
    perks: 'Claims this tile for your nation. Prerequisite for all other territory buildings.',
    cost: { [ResourceType.RAW_MATERIAL]: 10, [ResourceType.FOOD]: 5 },
    requires: null,
    requiresTech: null,
    requiresDeposit: null,
  },
  {
    type: TerritoryBuildingType.WALLS,
    label: 'Walls',
    perks: 'Reduces melee & ranged damage taken by units defending this tile. Discourages enemy expansion.',
    cost: { [ResourceType.RAW_MATERIAL]: 20 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
  },
  {
    type: TerritoryBuildingType.FARMS,
    label: 'Farms',
    perks: '🍎 +2 Food/s — sustains your army and cities. Each farm meaningfully extends how long you can field troops.',
    cost: { [ResourceType.RAW_MATERIAL]: 20 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
  },
  {
    type: TerritoryBuildingType.WORKSHOP,
    label: 'Workshop',
    perks: '🪨 +1 Raw Material/s — accelerates construction and unit production across your empire.',
    cost: { [ResourceType.RAW_MATERIAL]: 20 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
  },
  {
    type: TerritoryBuildingType.WATCHTOWER,
    label: 'Watchtower',
    perks: 'Extends vision radius by 2 tiles around this territory. Reveals enemy movements and warns of incoming attacks.',
    cost: { [ResourceType.RAW_MATERIAL]: 15 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
  },
  {
    type: TerritoryBuildingType.COPPER_MINE,
    label: 'Copper Mine',
    perks: '⊛ Activates copper supply — all your units gain +2 weapon damage (tier 1 weapons). Req: copper deposit.',
    cost: { [ResourceType.RAW_MATERIAL]: 25 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: TerritoryResourceType.COPPER,
  },
  {
    type: TerritoryBuildingType.IRON_MINE,
    label: 'Iron Mine',
    perks: '⊗ Activates iron supply — all your units gain +4 weapon damage (tier 2 weapons). Req: iron deposit.',
    cost: { [ResourceType.RAW_MATERIAL]: 30 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'iron_working',
    requiresDeposit: TerritoryResourceType.IRON,
  },
  {
    type: TerritoryBuildingType.FIRE_GLASS_MINE,
    label: 'Fire Glass Mine',
    perks: '◈ Activates fire glass supply — all your units gain +6 weapon damage (tier 3 weapons). Req: fire glass deposit.',
    cost: { [ResourceType.RAW_MATERIAL]: 40 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'steel_working',
    requiresDeposit: TerritoryResourceType.FIRE_GLASS,
  },
  {
    type: TerritoryBuildingType.MANA_MINE,
    label: 'Mana Mine',
    perks: '◆ Activates this tile\'s mana deposit effect: fire=+10% dmg, earth=+15% HP, water=+5% regen, lightning=+10% dmg. Req: any mana deposit.',
    cost: { [ResourceType.RAW_MATERIAL]: 35, [ResourceType.FOOD]: 10 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'mana_studies',
    requiresDeposit: null, // any mana deposit — validated at command time
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
