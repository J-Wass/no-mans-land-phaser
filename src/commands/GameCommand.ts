/**
 * GameCommand types — all state-mutating game actions.
 * Plain serializable JSON (no class instances, no Phaser refs).
 * Future multiplayer: serialize and send over the network.
 */

import type { EntityId, GridCoordinates } from '@/types/common';
import type { PlayerId } from '@/entities/players/Player';
import type { UnitType } from '@/entities/units/Unit';
import type { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import type { CityBuildingType } from '@/systems/territory/CityBuilding';
import type { TechId } from '@/systems/research/TechTree';

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

export type GameCommand =
  | MoveUnitCommand
  | BuildTerritoryCommand
  | BuildCityBuildingCommand
  | StartResearchCommand
  | CancelResearchCommand
  | StartCityProductionCommand;

export interface CommandResult {
  success: boolean;
  reason?: string;
}
