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
  PUBLIC_GREEN    = 'PUBLIC_GREEN',
  HOUSING         = 'HOUSING',
  COURTHOUSE      = 'COURTHOUSE',
  FORT            = 'FORT',
  CASTLE          = 'CASTLE',
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
    perks: 'Claims territory',
    cost: { [ResourceType.RAW_MATERIAL]: 10, [ResourceType.FOOD]: 5 },
    requires: null,
    requiresTech: null,
    requiresDeposit: null,
  },
  {
    type: TerritoryBuildingType.WALLS,
    label: 'Walls',
    perks: 'Defense+',
    cost: { [ResourceType.RAW_MATERIAL]: 20 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
  },
  {
    type: TerritoryBuildingType.FARMS,
    label: 'Farms',
    perks: '🍎 +2/s',
    cost: { [ResourceType.RAW_MATERIAL]: 20 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
  },
  {
    type: TerritoryBuildingType.WORKSHOP,
    label: 'Workshop',
    perks: '🪨 +1/s',
    cost: { [ResourceType.RAW_MATERIAL]: 20 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
  },
  {
    type: TerritoryBuildingType.WATCHTOWER,
    label: 'Watchtower',
    perks: 'Vision+',
    cost: { [ResourceType.RAW_MATERIAL]: 15 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
  },
  {
    type: TerritoryBuildingType.PUBLIC_GREEN,
    label: 'Public Green',
    perks: 'Happiness+',
    cost: { [ResourceType.RAW_MATERIAL]: 20 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
  },
  {
    type: TerritoryBuildingType.HOUSING,
    label: 'Housing',
    perks: 'Population+',
    cost: { [ResourceType.RAW_MATERIAL]: 25, [ResourceType.FOOD]: 10 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
  },
  {
    type: TerritoryBuildingType.COURTHOUSE,
    label: 'Courthouse',
    perks: 'Corruption-',
    cost: { [ResourceType.RAW_MATERIAL]: 30 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'law',
    requiresDeposit: null,
  },
  {
    type: TerritoryBuildingType.FORT,
    label: 'Fort',
    perks: 'Defense++',
    cost: { [ResourceType.RAW_MATERIAL]: 30, [ResourceType.FOOD]: 20 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
  },
  {
    type: TerritoryBuildingType.CASTLE,
    label: 'Castle',
    perks: 'Defense+++',
    cost: { [ResourceType.RAW_MATERIAL]: 60, [ResourceType.FOOD]: 40 },
    requires: TerritoryBuildingType.FORT,
    requiresTech: 'physics',
    requiresDeposit: null,
  },
  {
    type: TerritoryBuildingType.COPPER_MINE,
    label: 'Copper Mine',
    perks: 'Copper supply',
    cost: { [ResourceType.RAW_MATERIAL]: 25 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: TerritoryResourceType.COPPER,
  },
  {
    type: TerritoryBuildingType.IRON_MINE,
    label: 'Iron Mine',
    perks: 'Iron supply',
    cost: { [ResourceType.RAW_MATERIAL]: 30 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'iron_working',
    requiresDeposit: TerritoryResourceType.IRON,
  },
  {
    type: TerritoryBuildingType.FIRE_GLASS_MINE,
    label: 'Fire Glass Mine',
    perks: 'Fire Glass supply',
    cost: { [ResourceType.RAW_MATERIAL]: 40 },
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'steel_working',
    requiresDeposit: TerritoryResourceType.FIRE_GLASS,
  },
  {
    type: TerritoryBuildingType.MANA_MINE,
    label: 'Mana Mine',
    perks: 'Mana supply',
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
  [TerritoryBuildingType.PUBLIC_GREEN]:    '❋',
  [TerritoryBuildingType.HOUSING]:         '⌂',
  [TerritoryBuildingType.COURTHOUSE]:      '⚖',
  [TerritoryBuildingType.FORT]:            '▲',
  [TerritoryBuildingType.CASTLE]:          '★',
  [TerritoryBuildingType.COPPER_MINE]:     '⊛',
  [TerritoryBuildingType.IRON_MINE]:       '⊗',
  [TerritoryBuildingType.FIRE_GLASS_MINE]: '◈',
  [TerritoryBuildingType.MANA_MINE]:       '◆',
};
