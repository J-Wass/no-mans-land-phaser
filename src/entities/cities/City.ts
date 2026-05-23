/**
 * City entity - represents a city that occupies a territory.
 * Cities start with CITY_HALL. All other buildings must be constructed.
 */

export const CITY_QUEUE_MAX = 5;

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
  id:              EntityId;
  name:            string;
  ownerId:         EntityId;
  position:        GridCoordinates;
  currentOrder:    ProductionOrder | null;
  productionQueue: ProductionOrder[];
  buildings:       CityBuildingType[];
  buildingLevels:  Partial<Record<CityBuildingType, number>>;
  currentHealth:   number;
  maxHealth:       number;
  meleeDamage:     number;
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
      currentOrder:    null,
      productionQueue: [],
      buildings:       [CityBuildingType.CITY_HALL],
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
  public getQueue(): readonly ProductionOrder[] { return this.data.productionQueue; }
  public isQueueFull(): boolean { return this.data.productionQueue.length >= CITY_QUEUE_MAX; }

  /** Begin or enqueue production. Resources must be deducted by the caller first. */
  public startOrder(order: ProductionOrder): void {
    this.data.currentOrder = { ...order };
  }

  /**
   * Add an order to the queue (or start immediately if idle).
   * Returns false if the queue is already at capacity.
   */
  public enqueueOrder(order: ProductionOrder): boolean {
    if (!this.data.currentOrder) {
      this.startOrder(order);
      return true;
    }
    if (this.data.productionQueue.length >= CITY_QUEUE_MAX) return false;
    this.data.productionQueue.push({ ...order });
    return true;
  }

  /** Remove a queued item by index. Returns the removed order or null if index is invalid. */
  public cancelQueueItem(index: number): ProductionOrder | null {
    if (index < 0 || index >= this.data.productionQueue.length) return null;
    return this.data.productionQueue.splice(index, 1)[0] ?? null;
  }

  /** Restore the queue directly (used by save/load). */
  public restoreQueue(queue: ProductionOrder[]): void {
    this.data.productionQueue = queue.map(o => ({ ...o }));
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
      // Auto-advance the queue
      this.data.currentOrder = this.data.productionQueue.shift() ?? null;
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
      position:        { ...this.data.position },
      currentOrder:    this.data.currentOrder ? { ...this.data.currentOrder } : null,
      productionQueue: this.data.productionQueue.map(o => ({ ...o })),
      buildings:       [...this.data.buildings],
      buildingLevels:  { ...this.data.buildingLevels },
    };
  }
}
