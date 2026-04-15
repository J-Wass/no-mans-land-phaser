/**
 * Base Unit class - all unit types extend this
 */

import { EntityType } from '@/types/common';
import type { EntityId, GridCoordinates, GameEntity } from '@/types/common';
import type { ResourceCost } from '@/systems/resources/ResourceType';
import type { Serializable } from '@/types/serializable';

export enum UnitType {
  INFANTRY       = 'INFANTRY',
  SCOUT          = 'SCOUT',
  HEAVY_INFANTRY = 'HEAVY_INFANTRY',
  CAVALRY        = 'CAVALRY',
  LONGBOWMAN     = 'LONGBOWMAN',
  CROSSBOWMAN    = 'CROSSBOWMAN',
  CATAPULT       = 'CATAPULT',
  TREBUCHET      = 'TREBUCHET',
}

export type ArmorType = 'light' | 'heavy';
export type BattleOrder = 'RETREAT' | 'FALL_BACK' | 'HOLD' | 'ADVANCE' | 'CHARGE';

export interface UnitStats {
  maxHealth: number;
  meleeDamage: number;
  rangedDamage: number;   // 0 for melee-only units
  armorType: ArmorType;
  speed: number;          // used in movement cost formula
  attackRange: number;    // 1=melee only, 2-3=ranged
  vision: number;         // tiles visible
  /** Resources drained from treasury every UPKEEP_INTERVAL ticks while the unit is alive. */
  upkeep: ResourceCost;
}

export const DEFAULT_MORALE    = 80;
export const MAX_MORALE        = 100;
export const MORALE_LOW        = 30;   // refuses ADVANCE/CHARGE below this
export const MORALE_ROUT       = 10;   // auto-retreats below this

export interface UnitData {
  id: EntityId;
  type: UnitType;
  ownerId: EntityId;
  position: GridCoordinates;
  currentHealth: number;
  stats: UnitStats;
  hasMovedThisTurn: boolean;
  hasAttackedThisTurn: boolean;
  battleOrder: BattleOrder;
  engagedInBattle: boolean;
  morale: number;
  battlesEngaged: number;
  homeCityId: EntityId | null;
  preferredTargetId: EntityId | null;
}

export abstract class Unit implements GameEntity, Serializable<UnitData> {
  protected data: UnitData;
  public readonly type: EntityType.UNIT = EntityType.UNIT;

  constructor(
    id: EntityId,
    unitType: UnitType,
    ownerId: EntityId,
    position: GridCoordinates,
    stats: UnitStats
  ) {
    this.data = {
      id,
      type: unitType,
      ownerId,
      position,
      currentHealth: stats.maxHealth,
      stats,
      hasMovedThisTurn: false,
      hasAttackedThisTurn: false,
      battleOrder: 'ADVANCE',
      engagedInBattle: false,
      morale: DEFAULT_MORALE,
      battlesEngaged: 0,
      homeCityId: null,
      preferredTargetId: null,
    };
  }

  public get id(): EntityId {
    return this.data.id;
  }

  public get position(): GridCoordinates {
    return { ...this.data.position };
  }

  public getUnitType(): UnitType {
    return this.data.type;
  }

  public getOwnerId(): EntityId {
    return this.data.ownerId;
  }

  public getHealth(): number {
    return this.data.currentHealth;
  }

  public getMaxHealth(): number {
    return this.data.stats.maxHealth;
  }

  public getStats(): Readonly<UnitStats> {
    return this.data.stats;
  }

  public getBattleOrder(): BattleOrder {
    return this.data.battleOrder;
  }

  public setBattleOrder(order: BattleOrder): void {
    this.data.battleOrder = order;
  }

  public isEngagedInBattle(): boolean {
    return this.data.engagedInBattle;
  }

  public setEngagedInBattle(engaged: boolean): void {
    this.data.engagedInBattle = engaged;
  }

  public getMorale(): number {
    return this.data.morale;
  }

  public setMorale(value: number): void {
    this.data.morale = Math.max(0, Math.min(MAX_MORALE, value));
  }

  public getBattlesEngaged(): number {
    return this.data.battlesEngaged;
  }

  public incrementBattlesEngaged(): void {
    this.data.battlesEngaged++;
  }

  /** Directly set battles-engaged count — used only when restoring from a save. */
  public setBattlesEngaged(count: number): void {
    this.data.battlesEngaged = Math.max(0, count);
  }

  public getHomeCityId(): EntityId | null {
    return this.data.homeCityId;
  }

  public setHomeCityId(cityId: EntityId | null): void {
    this.data.homeCityId = cityId;
  }

  public getPreferredTargetId(): EntityId | null {
    return this.data.preferredTargetId;
  }

  public setPreferredTargetId(targetId: EntityId | null): void {
    this.data.preferredTargetId = targetId;
  }

  public isAlive(): boolean {
    return this.data.currentHealth > 0;
  }

  public takeDamage(amount: number): void {
    this.data.currentHealth = Math.max(0, this.data.currentHealth - amount);
  }

  public heal(amount: number): void {
    this.data.currentHealth = Math.min(
      this.data.stats.maxHealth,
      this.data.currentHealth + amount
    );
  }

  public moveTo(position: GridCoordinates): void {
    this.data.position = { ...position };
    this.data.hasMovedThisTurn = true;
  }

  public canMove(): boolean {
    return !this.data.hasMovedThisTurn && this.isAlive();
  }

  public canAttack(): boolean {
    return !this.data.hasAttackedThisTurn && this.isAlive();
  }

  public markAttacked(): void {
    this.data.hasAttackedThisTurn = true;
  }

  public resetTurn(): void {
    this.data.hasMovedThisTurn = false;
    this.data.hasAttackedThisTurn = false;
  }

  /** Directly set current health — used only when restoring from a save. */
  public setHealth(amount: number): void {
    this.data.currentHealth = Math.max(0, Math.min(this.data.stats.maxHealth, amount));
  }

  public abstract getCost(): ResourceCost;

  /** Per-tick-interval upkeep cost. Deducted by ProductionSystem every UPKEEP_INTERVAL ticks. */
  public getUpkeep(): ResourceCost {
    return this.data.stats.upkeep;
  }

  public getData(): Readonly<UnitData> {
    return this.data;
  }

  public toJSON(): UnitData {
    return {
      ...this.data,
      position: { ...this.data.position },
      stats: { ...this.data.stats },
    };
  }
}
