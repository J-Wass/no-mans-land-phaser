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
import type { Difficulty } from '@/types/gameSetup';
import type { MoraleBand } from '@/config/moraleBalance';

export type MoraleGainSource =
  | 'win' | 'kill' | 'witness' | 'conquest' | 'rally' | 'territory' | 'siege';

export type MoraleLossSource =
  | 'damage' | 'advance' | 'allied-death' | 'city-lost' | 'battle-lost';

export type GameEventMap = {
  'unit:step-complete':        { unitId: EntityId; from: GridCoordinates; to: GridCoordinates; tick: number };
  'unit:move-complete':        { unitId: EntityId; destination: GridCoordinates; tick: number };
  'unit:move-ordered':         { unitId: EntityId; path: GridCoordinates[]; playerId: PlayerId };
  'unit:move-cancelled':       { unitId: EntityId };
  'unit:destroyed':            { unitId: EntityId; byUnitId: EntityId | null; ownerNationId: EntityId; position: GridCoordinates; tick: number };
  'unit:battle-order-changed': { unitId: EntityId; battleOrder: BattleOrder; tick: number };
  'battle:started':            { battleId: string; unitAId: EntityId; unitBId: EntityId; position: GridCoordinates; tick: number };
  'battle:round-resolved':     {
    battleId: string;
    round: number;
    unitAId: EntityId;
    unitBId: EntityId;
    damageToUnitA: number;
    damageToUnitB: number;
    tick: number;
  };
  'battle:ended':              {
    battleId: string;
    winnerUnitId: EntityId | null;
    loserUnitId: EntityId | null;
    reason: 'ELIMINATION' | 'WITHDRAW' | 'ROUT' | 'MUTUAL_DESTRUCTION';
    tick: number;
  };
  'unit:withdrew':             { unitId: EntityId; from: GridCoordinates; to: GridCoordinates; tick: number };
  /** A unit began besieging a city. */
  'city:siege-started':        { siegeId: string; unitId: EntityId; cityId: EntityId; position: GridCoordinates; tick: number };
  /** One round of city siege resolved. */
  'city:siege-round':          { siegeId: string; unitId: EntityId; cityId: EntityId; damageToCity: number; damageToUnit: number; cityHealth: number; tick: number };
  /** A city was captured by an attacking nation. `fromNationId` is the previous owner. */
  'city:conquered':            { cityId: EntityId; byUnitId: EntityId; byNationId: EntityId; fromNationId: EntityId; position: GridCoordinates; tick: number };
  /** A ranged unit fired at a target from distance. */
  'ranged:fired':              { unitId: EntityId; targetId: EntityId; targetType: 'unit' | 'city'; damage: number; from: GridCoordinates; to: GridCoordinates; tick: number };
  /** A war has been declared between two nations (auto or manual). */
  'diplomacy:war-declared':    { nationId1: EntityId; nationId2: EntityId; tick: number };
  /** A peace treaty has been accepted. */
  'diplomacy:peace-signed':    { fromNationId: EntityId; toNationId: EntityId; tick: number };
  /** A unit production order was successfully queued at a city. */
  'city:production-started':   { cityId: EntityId; unitType: UnitType; tick: number };
  /** City finished producing a unit; renderer should create the sprite. */
  'city:unit-spawned':         { cityId: EntityId; unitId: EntityId; unitType: UnitType; position: GridCoordinates; tick: number };
  /** City finished a resource project. */
  'city:production-complete':  { cityId: EntityId; order: ProductionOrder; tick: number };
  /** City finished constructing a building. */
  'city:building-built':       { cityId: EntityId; building: CityBuildingType; tick: number };
  /** A city's buildings or their levels changed (conquest down-level, raze, single level removal). */
  'city:buildings-changed':    { cityId: EntityId; tick: number };
  /** A previously unclaimed (or captured) territory was claimed by a nation. */
  'territory:claimed':              { position: GridCoordinates; nationId: EntityId; tick: number; fromNationId?: EntityId };
  /** A building was constructed on a territory tile. */
  'territory:building-built':       { position: GridCoordinates; building: TerritoryBuildingType; tick: number };
  /** A building started construction on a territory tile. */
  'territory:building-started':     { position: GridCoordinates; building: TerritoryBuildingType; nationId: EntityId; tick: number };
  /** A territory building was upgraded to the next level. */
  'territory:building-upgraded':    { position: GridCoordinates; building: TerritoryBuildingType; newLevel: number; tick: number };
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
  /** A nation's research queue changed. */
  'nation:research-queue-updated': { nationId: EntityId; queue: TechId[] };
  /** A nation was eliminated from active play. */
  'nation:defeated':           { nationId: EntityId; name: string; tick: number };
  /** A unit's morale crossed a band threshold. UI uses this for toasts. */
  'morale:band-changed':       { unitId: EntityId; oldBand: MoraleBand; newBand: MoraleBand; value: number; tick: number };
  /** A unit gained morale from a discrete event (not per-tick recovery). UI uses this for floaters. */
  'morale:gained':             { unitId: EntityId; amount: number; source: MoraleGainSource; tick: number };
  /** A unit lost morale from a discrete event (not per-round damage). UI uses this for floaters. */
  'morale:lost':               { unitId: EntityId; amount: number; source: MoraleLossSource; tick: number };
  /** TickEngine completed one game tick. */
  'game:tick':                 { tick: number };
  /** A nation dominates a geographic region (controls ≥66% of its tiles). */
  'region:dominated':          { regionId: string; nationId: EntityId; tick: number };
  /** Player toggled game speed (1 = normal, 2 = fast, 4 = very fast). */
  'game:speed-change':         { speed: number };
  /** Player selected (or deselected) a unit. */
  'unit:selected':             { unit: Unit | null };
  /** Player highlighted a city (single-click) or deselected. */
  'city:selected':             { city: City | null };
  /** Player single-clicked a territory tile — show info panel without opening menu. */
  'territory:highlighted':     { position: GridCoordinates | null };
  /** A UIScene interactive element consumed a click — GameScene should ignore it. */
  'ui:click-consumed':         Record<string, never>;
  /** Player panned the camera (right-click drag) — used by the tutorial mouse-controls primer. */
  'ui:camera-panned':          Record<string, never>;
  /** A full-screen DOM menu/modal was opened (used by the tutorial to detect player navigation). */
  'ui:modal-opened':           { modal: 'cityMenu' | 'territoryMenu' | 'research' | 'diplomacy' };
  /** Sandbox toolbar: player changed AI difficulty (or 'sandbox' = off). */
  'sandbox:ai-difficulty-changed': { difficulty: Difficulty };
  /** Sandbox toolbar: tile paint mode toggled. */
  'sandbox:tile-edit-mode':    { active: boolean };
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
