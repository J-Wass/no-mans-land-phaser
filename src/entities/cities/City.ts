/**
 * City entity - represents a city that occupies a territory.
 * One city produces one thing at a time (no queue).
 * Cities start with CITY_HALL. All other buildings must be constructed.
 */

import { EntityType } from '@/types/common';
import type { EntityId, GridCoordinates, GameEntity } from '@/types/common';
import type { Serializable } from '@/types/serializable';
import type { ProductionOrder } from '@/systems/production/ProductionOrder';
import {
  CITY_WALLS_DMG_PER_LEVEL,
  CITY_WALLS_HP_PER_LEVEL,
  MAX_CITY_WALLS_LEVEL,
  CityBuildingType,
} from '@/systems/territory/CityBuilding';

export interface CityData {
  id:            EntityId;
  name:          string;
  ownerId:       EntityId;
  position:      GridCoordinates;
  population:    number;
  currentOrder:  ProductionOrder | null;
  buildings:     CityBuildingType[];
  buildingLevels: Partial<Record<CityBuildingType, number>>;
  currentHealth: number;
  maxHealth:     number;
  meleeDamage:   number;
}

export class City implements GameEntity, Serializable<CityData> {
  private data: CityData;
  public readonly type: EntityType.CITY = EntityType.CITY;

  constructor(id: EntityId, name: string, ownerId: EntityId, position: GridCoordinates) {
    this.data = {
      id,
      name,
      ownerId,
      position,
      population:    1000,
      currentOrder:  null,
      buildings:     [CityBuildingType.CITY_HALL],
      buildingLevels: { [CityBuildingType.CITY_HALL]: 1 },
      maxHealth:     200,
      currentHealth: 200,
      meleeDamage:   12,
    };
  }

  public get id(): EntityId { return this.data.id; }
  public get position(): GridCoordinates { return { ...this.data.position }; }

  public getName(): string      { return this.data.name; }
  public getOwnerId(): EntityId { return this.data.ownerId; }
  public setOwnerId(id: EntityId): void { this.data.ownerId = id; }
  public getPopulation(): number { return this.data.population; }

  // ── Combat stats ──────────────────────────────────────────────────────────────
  public getHealth(): number    { return this.data.currentHealth; }
  public getMaxHealth(): number {
    return this.data.maxHealth + this.getBuildingLevel(CityBuildingType.WALLS) * CITY_WALLS_HP_PER_LEVEL;
  }
  public getMeleeDamage(): number {
    return this.data.meleeDamage + this.getBuildingLevel(CityBuildingType.WALLS) * CITY_WALLS_DMG_PER_LEVEL;
  }
  public isAlive(): boolean     { return this.data.currentHealth > 0; }

  public takeDamage(amount: number): void {
    this.data.currentHealth = Math.max(0, this.data.currentHealth - amount);
  }

  public heal(amount: number): void {
    this.data.currentHealth = Math.min(this.data.maxHealth, this.data.currentHealth + amount);
  }

  public setHealth(amount: number): void {
    this.data.currentHealth = Math.max(0, Math.min(this.data.maxHealth, amount));
  }

  public getCurrentOrder(): ProductionOrder | null { return this.data.currentOrder; }

  /** Begin production. Caller must check affordability and deduct resources first. */
  public startOrder(order: ProductionOrder): void {
    this.data.currentOrder = { ...order };
  }

  /**
   * Advance production by one tick.
   * @returns true when the order just completed this tick.
   */
  public tickProduction(): boolean {
    const order = this.data.currentOrder;
    if (!order) return false;
    order.ticksRemaining = Math.max(0, order.ticksRemaining - 1);
    if (order.ticksRemaining === 0) {
      this.data.currentOrder = null;
      return true;
    }
    return false;
  }

  public cancelOrder(): void {
    this.data.currentOrder = null;
  }

  /** Progress as a 0–1 fraction (clamped to [0, 1]). */
  public getProgressFraction(): number {
    const order = this.data.currentOrder;
    if (!order || order.ticksTotal <= 0) return 0;
    const pct = (order.ticksTotal - order.ticksRemaining) / order.ticksTotal;
    return Math.max(0, Math.min(1, pct));
  }

  // ── Buildings ────────────────────────────────────────────────────────────────

  public getBuildings(): readonly CityBuildingType[] {
    return this.data.buildings;
  }

  public hasBuilding(b: CityBuildingType): boolean {
    return this.data.buildings.includes(b);
  }

  public addBuilding(b: CityBuildingType): void {
    if (this.hasBuilding(b)) {
      if (b === CityBuildingType.WALLS) this.upgradeBuildingLevel(b);
      return;
    }

    this.data.buildings.push(b);
    this.data.buildingLevels = { ...this.data.buildingLevels, [b]: 1 };
    if (b === CityBuildingType.WALLS) this.data.currentHealth = this.getMaxHealth();
  }

  public setBuildings(buildings: CityBuildingType[]): void {
    this.data.buildings = [...buildings];
    for (const building of buildings) {
      if (!this.data.buildingLevels[building]) {
        this.data.buildingLevels = { ...this.data.buildingLevels, [building]: 1 };
      }
    }
    this.data.currentHealth = Math.min(this.data.currentHealth, this.getMaxHealth());
  }

  public getBuildingLevel(b: CityBuildingType): number {
    if (!this.hasBuilding(b)) return 0;
    return this.data.buildingLevels[b] ?? 1;
  }

  public setBuildingLevel(b: CityBuildingType, level: number): void {
    if (level <= 0) return;
    if (!this.hasBuilding(b)) this.data.buildings.push(b);
    const maxLevel = b === CityBuildingType.WALLS ? MAX_CITY_WALLS_LEVEL : 1;
    const clamped = Math.max(1, Math.min(maxLevel, level));
    this.data.buildingLevels = { ...this.data.buildingLevels, [b]: clamped };
    this.data.currentHealth = Math.min(this.data.currentHealth, this.getMaxHealth());
  }

  public upgradeBuildingLevel(b: CityBuildingType): boolean {
    if (!this.hasBuilding(b)) return false;
    const maxLevel = b === CityBuildingType.WALLS ? MAX_CITY_WALLS_LEVEL : 1;
    const current = this.getBuildingLevel(b);
    if (current >= maxLevel) return false;
    this.data.buildingLevels = { ...this.data.buildingLevels, [b]: current + 1 };
    if (b === CityBuildingType.WALLS) this.data.currentHealth = this.getMaxHealth();
    return true;
  }

  public getData(): Readonly<CityData> { return this.data; }

  public toJSON(): CityData {
    return {
      ...this.data,
      position:      { ...this.data.position },
      currentOrder:  this.data.currentOrder ? { ...this.data.currentOrder } : null,
      buildings:     [...this.data.buildings],
      buildingLevels: { ...this.data.buildingLevels },
    };
  }
}
