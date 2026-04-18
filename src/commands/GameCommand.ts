/**
 * GameCommand types — all state-mutating game actions.
 * Plain serializable JSON (no class instances, no Phaser refs).
 * Future multiplayer: serialize and send over the network.
 */

import type { EntityId, GridCoordinates } from '@/types/common';
import type { PlayerId } from '@/entities/players/Player';
import type { BattleOrder, UnitType } from '@/entities/units/Unit';
import type { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import type { CityBuildingType } from '@/systems/territory/CityBuilding';
import type { TechId } from '@/systems/research/TechTree';
import type { ResourceType } from '@/systems/resources/ResourceType';

export interface MoveUnitCommand {
  type:         'MOVE_UNIT';
  playerId:     PlayerId;
  unitId:       EntityId;
  path:         GridCoordinates[];
  issuedAtTick: number;
}

export interface BuildTerritoryCommand {
  type:         'BUILD_TERRITORY';
  playerId:     PlayerId;
  position:     GridCoordinates;
  building:     TerritoryBuildingType;
  issuedAtTick: number;
}

export interface BuildCityBuildingCommand {
  type:         'BUILD_CITY_BUILDING';
  playerId:     PlayerId;
  cityId:       EntityId;
  building:     CityBuildingType;
  issuedAtTick: number;
}

export interface StartResearchCommand {
  type:         'START_RESEARCH';
  playerId:     PlayerId;
  techId:       TechId;
  issuedAtTick: number;
}

export interface CancelResearchCommand {
  type:         'CANCEL_RESEARCH';
  playerId:     PlayerId;
  issuedAtTick: number;
}

export interface StartCityProductionCommand {
  type:         'START_CITY_PRODUCTION';
  playerId:     PlayerId;
  cityId:       EntityId;
  unitType:     UnitType;
  issuedAtTick: number;
}

export interface SetUnitBattleOrderCommand {
  type:         'SET_UNIT_BATTLE_ORDER';
  playerId:     PlayerId;
  unitId:       EntityId;
  battleOrder:  BattleOrder;
  issuedAtTick: number;
}

export interface DeclareWarCommand {
  type:            'DECLARE_WAR';
  playerId:        PlayerId;
  targetNationId:  EntityId;
  issuedAtTick:    number;
}

export interface ProposePeaceCommand {
  type:            'PROPOSE_PEACE';
  playerId:        PlayerId;
  targetNationId:  EntityId;
  issuedAtTick:    number;
}

export interface OfferTradeCommand {
  type:            'OFFER_TRADE';
  playerId:        PlayerId;
  targetNationId:  EntityId;
  /** Resources the local nation gives to the target nation. */
  offer:           Partial<Record<ResourceType, number>>;
  /** Resources the local nation receives from the target nation. */
  request:         Partial<Record<ResourceType, number>>;
  issuedAtTick:    number;
}

export interface UpgradeTerritoryBuildingCommand {
  type:         'UPGRADE_TERRITORY';
  playerId:     PlayerId;
  position:     GridCoordinates;
  building:     TerritoryBuildingType;
  issuedAtTick: number;
}

export type GameCommand =
  | MoveUnitCommand
  | BuildTerritoryCommand
  | BuildCityBuildingCommand
  | UpgradeTerritoryBuildingCommand
  | StartResearchCommand
  | CancelResearchCommand
  | StartCityProductionCommand
  | SetUnitBattleOrderCommand
  | DeclareWarCommand
  | ProposePeaceCommand
  | OfferTradeCommand;

export interface CommandResult {
  success: boolean;
  reason?: string;
}
