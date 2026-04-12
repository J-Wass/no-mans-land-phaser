/**
 * Base Unit class - all unit types extend this
 */

import type { EntityId, GridCoordinates, GameEntity, EntityType } from '@/types/common';
import type { ResourceCost } from '@/systems/resources/ResourceType';

export enum UnitType {
  INFANTRY = 'INFANTRY',
  ARCHER = 'ARCHER',
  CAVALRY = 'CAVALRY',
  SIEGE = 'SIEGE'
}

export interface UnitStats {
  maxHealth: number;
  attack: number;
  defense: number;
  movement: number; // How many tiles they can move per turn
  range: number; // Attack range in tiles
}

export interface UnitData {
  id: EntityId;
  type: UnitType;
  ownerId: EntityId; // Nation ID
  position: GridCoordinates;
  currentHealth: number;
  stats: UnitStats;
  hasMovedThisTurn: boolean;
  hasAttackedThisTurn: boolean;
}

export abstract class Unit implements GameEntity {
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
      hasAttackedThisTurn: false
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
    this.data.position = position;
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

  public abstract getCost(): ResourceCost;

  public getData(): Readonly<UnitData> {
    return this.data;
  }
}
