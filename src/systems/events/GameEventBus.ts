/**
 * GameEventBus - typed event emitter for game-world events.
 *
 * Renderer subscribes here instead of polling state.
 * Future multiplayer: NetworkAdapter also subscribes and broadcasts to clients.
 */

import EventEmitter from 'eventemitter3';
import type { EntityId, GridCoordinates } from '@/types/common';
import type { PlayerId } from '@/entities/players/Player';
import type { UnitType } from '@/entities/units/Unit';
import type { ProductionOrder } from '@/systems/production/ProductionOrder';
import type { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import type { CityBuildingType } from '@/systems/territory/CityBuilding';
import type { TechId } from '@/systems/research/TechTree';
import type { Unit } from '@/entities/units/Unit';

export type GameEventMap = {
  'unit:step-complete':        { unitId: EntityId; from: GridCoordinates; to: GridCoordinates; tick: number };
  'unit:move-complete':        { unitId: EntityId; destination: GridCoordinates; tick: number };
  'unit:move-ordered':         { unitId: EntityId; path: GridCoordinates[]; playerId: PlayerId };
  'unit:move-cancelled':       { unitId: EntityId };
  /** City finished producing a unit; renderer should create the sprite. */
  'city:unit-spawned':         { cityId: EntityId; unitId: EntityId; unitType: UnitType; position: GridCoordinates; tick: number };
  /** City finished a resource project. */
  'city:production-complete':  { cityId: EntityId; order: ProductionOrder; tick: number };
  /** City finished constructing a building. */
  'city:building-built':       { cityId: EntityId; building: CityBuildingType; tick: number };
  /** A previously unclaimed territory was claimed by a nation. */
  'territory:claimed':         { position: GridCoordinates; nationId: EntityId; tick: number };
  /** A building was constructed on a territory tile. */
  'territory:building-built':  { position: GridCoordinates; building: TerritoryBuildingType; tick: number };
  /** A nation completed a research tech. */
  'nation:research-complete':  { nationId: EntityId; techId: TechId };
  /** A nation started researching a tech. */
  'nation:research-started':   { nationId: EntityId; techId: TechId };
  /** TickEngine completed one game tick. */
  'game:tick':                 { tick: number };
  /** Player selected (or deselected) a unit. */
  'unit:selected':             { unit: Unit | null };
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
