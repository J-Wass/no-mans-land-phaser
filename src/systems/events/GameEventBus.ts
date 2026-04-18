/**
 * GameEventBus - typed event emitter for game-world events.
 *
 * Renderer subscribes here instead of polling state.
 * Future multiplayer: NetworkAdapter also subscribes and broadcasts to clients.
 */

import EventEmitter from 'eventemitter3';
import type { EntityId, GridCoordinates } from '@/types/common';
import type { PlayerId } from '@/entities/players/Player';
import type { BattleOrder, UnitType } from '@/entities/units/Unit';
import type { ProductionOrder } from '@/systems/production/ProductionOrder';
import type { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import type { CityBuildingType } from '@/systems/territory/CityBuilding';
import type { TechId } from '@/systems/research/TechTree';
import type { Unit } from '@/entities/units/Unit';
import type { City } from '@/entities/cities/City';

export type GameEventMap = {
  'unit:step-complete':        { unitId: EntityId; from: GridCoordinates; to: GridCoordinates; tick: number };
  'unit:move-complete':        { unitId: EntityId; destination: GridCoordinates; tick: number };
  'unit:move-ordered':         { unitId: EntityId; path: GridCoordinates[]; playerId: PlayerId };
  'unit:move-cancelled':       { unitId: EntityId };
  'unit:destroyed':            { unitId: EntityId; byUnitId: EntityId | null; tick: number };
  'unit:battle-order-changed': { unitId: EntityId; battleOrder: BattleOrder; tick: number };
  'battle:started':            { battleId: string; unitAId: EntityId; unitBId: EntityId; position: GridCoordinates; tick: number };
  'battle:round-resolved':     {
    battleId: string;
    round: number;
    unitAId: EntityId;
    unitBId: EntityId;
    damageToUnitA: number;
    damageToUnitB: number;
    momentum: number;
    landA: number;
    landB: number;
    tick: number;
  };
  'battle:ended':              {
    battleId: string;
    winnerUnitId: EntityId | null;
    loserUnitId: EntityId | null;
    reason: 'ELIMINATION' | 'RETREAT' | 'ROUT' | 'TIMEOUT' | 'MUTUAL_DESTRUCTION' | 'LAND_LOSS';
    tick: number;
  };
  /** A unit began besieging a city. */
  'city:siege-started':        { siegeId: string; unitId: EntityId; cityId: EntityId; position: GridCoordinates; tick: number };
  /** One round of city siege resolved. */
  'city:siege-round':          { siegeId: string; unitId: EntityId; cityId: EntityId; damageToCity: number; damageToUnit: number; cityHealth: number; tick: number };
  /** A city was captured by an attacking nation. */
  'city:conquered':            { cityId: EntityId; byUnitId: EntityId; byNationId: EntityId; position: GridCoordinates; tick: number };
  /** A ranged unit fired at a target from distance. */
  'ranged:fired':              { unitId: EntityId; targetId: EntityId; targetType: 'unit' | 'city'; damage: number; from: GridCoordinates; to: GridCoordinates; tick: number };
  /** A war has been declared between two nations (auto or manual). */
  'diplomacy:war-declared':    { nationId1: EntityId; nationId2: EntityId; tick: number };
  /** A peace treaty has been accepted. */
  'diplomacy:peace-signed':    { fromNationId: EntityId; toNationId: EntityId; tick: number };
  /** City finished producing a unit; renderer should create the sprite. */
  'city:unit-spawned':         { cityId: EntityId; unitId: EntityId; unitType: UnitType; position: GridCoordinates; tick: number };
  /** City finished a resource project. */
  'city:production-complete':  { cityId: EntityId; order: ProductionOrder; tick: number };
  /** City finished constructing a building. */
  'city:building-built':       { cityId: EntityId; building: CityBuildingType; tick: number };
  /** A previously unclaimed (or captured) territory was claimed by a nation. */
  'territory:claimed':              { position: GridCoordinates; nationId: EntityId; tick: number; fromNationId?: EntityId };
  /** A building was constructed on a territory tile. */
  'territory:building-built':       { position: GridCoordinates; building: TerritoryBuildingType; tick: number };
  /** A unit started conquering an enemy territory tile. */
  'territory:conquest-started':     { position: GridCoordinates; nationId: EntityId; needed: number; tick: number };
  /** Conquest progress update — emitted each tick while contested. */
  'territory:conquest-progress':    { position: GridCoordinates; progress: number; needed: number; tick: number };
  /** Conquest was interrupted (defender arrived or attacker left). */
  'territory:conquest-cancelled':   { position: GridCoordinates; tick: number };
  /** A nation completed a research tech. */
  'nation:research-complete':  { nationId: EntityId; techId: TechId };
  /** A nation started researching a tech. */
  'nation:research-started':   { nationId: EntityId; techId: TechId };
  /** TickEngine completed one game tick. */
  'game:tick':                 { tick: number };
  /** Player selected (or deselected) a unit. */
  'unit:selected':             { unit: Unit | null };
  /** Player highlighted a city (single-click) or deselected. */
  'city:selected':             { city: City | null };
  /** Player single-clicked a territory tile — show info panel without opening menu. */
  'territory:highlighted':     { position: GridCoordinates | null };
  /** A UIScene interactive element consumed a click — GameScene should ignore it. */
  'ui:click-consumed':         Record<string, never>;
};

export class GameEventBus {
  private emitter = new EventEmitter();

  public emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    this.emitter.emit(event, payload);
  }

  public on<K extends keyof GameEventMap>(
    event: K,
    handler: (payload: GameEventMap[K]) => void,
  ): void {
    this.emitter.on(event, handler as (...args: unknown[]) => void);
  }

  public off<K extends keyof GameEventMap>(
    event: K,
    handler: (payload: GameEventMap[K]) => void,
  ): void {
    this.emitter.off(event, handler as (...args: unknown[]) => void);
  }
}
