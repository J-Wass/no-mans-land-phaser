/**
 * City entity - represents a city that occupies a territory.
 * Cities start with CITY_HALL. All other buildings must be constructed.
 */

export const CITY_QUEUE_MAX = 5;

/** Ticks between automatic level losses while a city is being razed (5s at TICK_RATE=10). */
export const CITY_RAZE_INTERVAL_TICKS = 50;

import { EntityType } from '@/types/common';
import type { EntityId, GridCoordinates, GameEntity } from '@/types/common';
import type { Serializable } from '@/types/serializable';
import type { ProductionOrder } from '@/systems/production/ProductionOrder';
import {
  CITY_WALLS_DMG_PER_LEVEL,
  CITY_WALLS_HP_PER_LEVEL,
  CITY_BUILDING_MAP,
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
  /** When true, a random building loses one level every CITY_RAZE_INTERVAL_TICKS. */
  razing:          boolean;
  /** Ticks until the next automatic raze level-loss. */
  razeCountdown:   number;
  /** A single targeted level removal in progress (takes CITY_RAZE_INTERVAL_TICKS to resolve). */
  pendingRemoval:  { building: CityBuildingType; ticksRemaining: number } | null;
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
      razing:        false,
      razeCountdown: 0,
      pendingRemoval: null,
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

  /** Max level a building can reach, sourced from the catalog (defaults to 1). */
  private maxLevelFor(b: CityBuildingType): number {
    return CITY_BUILDING_MAP.get(b)?.maxLevel ?? 1;
  }

  public addBuilding(b: CityBuildingType): void {
    if (this.hasBuilding(b)) {
      // Re-building an existing building is the upgrade path (any upgradeable building).
      this.upgradeBuildingLevel(b);
      return;
    }

    this.data.buildings.push(b);
    this.data.buildingLevels = { ...this.data.buildingLevels, [b]: 1 };
    if (b === CityBuildingType.WALLS) this.data.currentHealth = this.getMaxHealth();
  }

  /** Remove a building entirely (level → 0). City Hall is permanent and never removed. */
  public removeBuilding(b: CityBuildingType): void {
    if (b === CityBuildingType.CITY_HALL) return;
    this.data.buildings = this.data.buildings.filter(x => x !== b);
    const levels = { ...this.data.buildingLevels };
    delete levels[b];
    this.data.buildingLevels = levels;
    if (b === CityBuildingType.WALLS) {
      this.data.currentHealth = Math.min(this.data.currentHealth, this.getMaxHealth());
    }
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
    const clamped = Math.max(1, Math.min(this.maxLevelFor(b), level));
    this.data.buildingLevels = { ...this.data.buildingLevels, [b]: clamped };
    this.data.currentHealth = Math.min(this.data.currentHealth, this.getMaxHealth());
  }

  public upgradeBuildingLevel(b: CityBuildingType): boolean {
    if (!this.hasBuilding(b)) return false;
    const current = this.getBuildingLevel(b);
    if (current >= this.maxLevelFor(b)) return false;
    this.data.buildingLevels = { ...this.data.buildingLevels, [b]: current + 1 };
    if (b === CityBuildingType.WALLS) this.data.currentHealth = this.getMaxHealth();
    return true;
  }

  /**
   * Drop one level off a building. A building at level 1 is removed entirely.
   * City Hall is exempt. Returns true if anything changed.
   */
  private loseOneLevel(b: CityBuildingType): boolean {
    if (b === CityBuildingType.CITY_HALL || !this.hasBuilding(b)) return false;
    const current = this.getBuildingLevel(b);
    if (current <= 1) {
      this.removeBuilding(b);
    } else {
      this.data.buildingLevels = { ...this.data.buildingLevels, [b]: current - 1 };
      if (b === CityBuildingType.WALLS) {
        this.data.currentHealth = Math.min(this.data.currentHealth, this.getMaxHealth());
      }
    }
    return true;
  }

  // ── Conquest / razing ──────────────────────────────────────────────────────

  /** On capture, every non–City-Hall building drops one level (level-1 buildings are destroyed). */
  public downgradeAllOnConquest(): void {
    for (const b of [...this.data.buildings]) {
      this.loseOneLevel(b);
    }
    // A captured city is no longer being razed by its previous owner.
    this.data.razing = false;
    this.data.pendingRemoval = null;
  }

  public isRazing(): boolean { return this.data.razing; }

  public setRazing(on: boolean): void {
    this.data.razing = on;
    if (on && this.data.razeCountdown <= 0) this.data.razeCountdown = CITY_RAZE_INTERVAL_TICKS;
  }

  public getPendingRemoval(): Readonly<{ building: CityBuildingType; ticksRemaining: number }> | null {
    return this.data.pendingRemoval;
  }

  /** Schedule a single level removal of a specific building (resolves after CITY_RAZE_INTERVAL_TICKS). */
  public queueLevelRemoval(b: CityBuildingType): boolean {
    if (b === CityBuildingType.CITY_HALL || !this.hasBuilding(b)) return false;
    this.data.pendingRemoval = { building: b, ticksRemaining: CITY_RAZE_INTERVAL_TICKS };
    return true;
  }

  /** Buildings eligible to lose a level (present, not City Hall). */
  private razeableBuildings(): CityBuildingType[] {
    return this.data.buildings.filter(b => b !== CityBuildingType.CITY_HALL);
  }

  /**
   * Advance raze / pending-removal timers by one tick.
   * Returns true if a building lost a level this tick (so callers can emit a refresh event).
   */
  public tickDecay(randomFn: () => number): boolean {
    // Targeted single removal takes priority over background razing.
    if (this.data.pendingRemoval) {
      this.data.pendingRemoval.ticksRemaining--;
      if (this.data.pendingRemoval.ticksRemaining <= 0) {
        const b = this.data.pendingRemoval.building;
        this.data.pendingRemoval = null;
        return this.loseOneLevel(b);
      }
      return false;
    }

    if (this.data.razing) {
      const targets = this.razeableBuildings();
      if (targets.length === 0) { this.data.razing = false; return false; }
      this.data.razeCountdown--;
      if (this.data.razeCountdown <= 0) {
        this.data.razeCountdown = CITY_RAZE_INTERVAL_TICKS;
        const target = targets[Math.floor(randomFn() * targets.length)] ?? targets[0]!;
        return this.loseOneLevel(target);
      }
    }
    return false;
  }

  /** Restore raze / pending-removal state from a save snapshot. */
  public restoreDecayState(
    razing: boolean,
    razeCountdown: number,
    pendingRemoval: { building: CityBuildingType; ticksRemaining: number } | null,
  ): void {
    this.data.razing = razing;
    this.data.razeCountdown = razeCountdown;
    this.data.pendingRemoval = pendingRemoval ? { ...pendingRemoval } : null;
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
      pendingRemoval:  this.data.pendingRemoval ? { ...this.data.pendingRemoval } : null,
    };
  }
}
