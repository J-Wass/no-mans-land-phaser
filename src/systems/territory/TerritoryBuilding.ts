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
import { CONTENT_STRINGS } from '@/i18n/content';

export enum TerritoryBuildingType {
  OUTPOST         = 'OUTPOST',
  WALLS           = 'WALLS',
  FARMS           = 'FARMS',
  WORKSHOP        = 'WORKSHOP',
  WATCHTOWER      = 'WATCHTOWER',
  COPPER_MINE     = 'COPPER_MINE',
  IRON_MINE       = 'IRON_MINE',
  FIRE_GLASS_MINE = 'FIRE_GLASS_MINE',
  SILVER_MINE     = 'SILVER_MINE',
  GOLD_MINE       = 'GOLD_MINE',
  MANA_MINE       = 'MANA_MINE',
}

export interface TerritoryBuildingDef {
  type:             TerritoryBuildingType;
  label:            string;
  perks:            string;
  cost:             ResourceCost;
  /** Construction time in ticks. */
  ticks:            number;
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
    label: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.OUTPOST].label,
    perks: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.OUTPOST].perks,
    cost: { [ResourceType.GOLD]: 30, [ResourceType.RAW_MATERIAL]: 80, [ResourceType.FOOD]: 40 },
    ticks: 80,
    requires: null,
    requiresTech: null,
    requiresDeposit: null,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: TerritoryBuildingType.WALLS,
    label: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.WALLS].label,
    perks: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.WALLS].perks,
    cost: { [ResourceType.GOLD]: 20, [ResourceType.RAW_MATERIAL]: 70 },
    ticks: 90,
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
    maxLevel: 5,
    upgradeCost: { [ResourceType.GOLD]: 25, [ResourceType.RAW_MATERIAL]: 70 },
  },
  {
    type: TerritoryBuildingType.FARMS,
    label: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.FARMS].label,
    perks: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.FARMS].perks,
    cost: { [ResourceType.RAW_MATERIAL]: 70 },
    ticks: 60,
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: TerritoryBuildingType.WORKSHOP,
    label: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.WORKSHOP].label,
    perks: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.WORKSHOP].perks,
    cost: { [ResourceType.RAW_MATERIAL]: 70 },
    ticks: 70,
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: TerritoryBuildingType.WATCHTOWER,
    label: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.WATCHTOWER].label,
    perks: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.WATCHTOWER].perks,
    cost: { [ResourceType.RAW_MATERIAL]: 60 },
    ticks: 70,
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: null,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: TerritoryBuildingType.COPPER_MINE,
    label: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.COPPER_MINE].label,
    perks: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.COPPER_MINE].perks,
    cost: { [ResourceType.RAW_MATERIAL]: 80 },
    ticks: 80,
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: TerritoryResourceType.COPPER,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: TerritoryBuildingType.IRON_MINE,
    label: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.IRON_MINE].label,
    perks: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.IRON_MINE].perks,
    cost: { [ResourceType.RAW_MATERIAL]: 90 },
    ticks: 90,
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'iron_working',
    requiresDeposit: TerritoryResourceType.IRON,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: TerritoryBuildingType.FIRE_GLASS_MINE,
    label: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.FIRE_GLASS_MINE].label,
    perks: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.FIRE_GLASS_MINE].perks,
    cost: { [ResourceType.RAW_MATERIAL]: 120 },
    ticks: 100,
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'steel_working',
    requiresDeposit: TerritoryResourceType.FIRE_GLASS,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: TerritoryBuildingType.SILVER_MINE,
    label: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.SILVER_MINE].label,
    perks: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.SILVER_MINE].perks,
    cost: { [ResourceType.RAW_MATERIAL]: 90 },
    ticks: 90,
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'masonry',
    requiresDeposit: TerritoryResourceType.SILVER,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: TerritoryBuildingType.GOLD_MINE,
    label: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.GOLD_MINE].label,
    perks: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.GOLD_MINE].perks,
    cost: { [ResourceType.RAW_MATERIAL]: 100 },
    ticks: 95,
    requires: TerritoryBuildingType.OUTPOST,
    requiresTech: 'trade',
    requiresDeposit: TerritoryResourceType.GOLD_DEPOSIT,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: TerritoryBuildingType.MANA_MINE,
    label: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.MANA_MINE].label,
    perks: CONTENT_STRINGS.territoryBuildings[TerritoryBuildingType.MANA_MINE].perks,
    cost: { [ResourceType.RAW_MATERIAL]: 110, [ResourceType.FOOD]: 40 },
    ticks: 100,
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
  [TerritoryBuildingType.SILVER_MINE]:     '☽',
  [TerritoryBuildingType.GOLD_MINE]:       '☀',
  [TerritoryBuildingType.MANA_MINE]:       '◆',
};
