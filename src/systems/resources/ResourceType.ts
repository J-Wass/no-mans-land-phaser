/**
 * Resource system - economy resources produced and consumed by cities/nations.
 * Territory tile deposits (mana, materials) live in TerritoryResourceType.ts.
 */

export enum ResourceType {
  GOLD         = 'GOLD',         // income from treaties / markets
  FOOD         = 'FOOD',         // farms + territories; unit upkeep + population growth
  RAW_MATERIAL = 'RAW_MATERIAL', // workshops + territories; building upkeep
  HAPPINESS    = 'HAPPINESS',    // avg of cities (public greens); drives pop growth
  RESEARCH     = 'RESEARCH',     // schools; funds tech tree
}

export interface Resource {
  type: ResourceType;
  amount: number;
}

export interface ResourceCost {
  [ResourceType.GOLD]?:         number;
  [ResourceType.FOOD]?:         number;
  [ResourceType.RAW_MATERIAL]?: number;
  [ResourceType.HAPPINESS]?:    number;
  [ResourceType.RESEARCH]?:     number;
}

export type ResourceStorageData = Record<ResourceType, number>;

export class ResourceStorage {
  private resources: Map<ResourceType, number>;

  constructor() {
    this.resources = new Map();
    Object.values(ResourceType).forEach(type => {
      this.resources.set(type, 0);
    });
  }

  public getAmount(type: ResourceType): number {
    return this.resources.get(type) ?? 0;
  }

  public addResource(type: ResourceType, amount: number): void {
    const current = this.getAmount(type);
    this.resources.set(type, current + amount);
  }

  public removeResource(type: ResourceType, amount: number): boolean {
    const current = this.getAmount(type);
    if (current >= amount) {
      this.resources.set(type, current - amount);
      return true;
    }
    return false;
  }

  public hasResources(cost: ResourceCost): boolean {
    return Object.entries(cost).every(([type, amount]) => {
      if (amount === undefined) return true;
      return this.getAmount(type as ResourceType) >= amount;
    });
  }

  public consumeResources(cost: ResourceCost): boolean {
    if (!this.hasResources(cost)) {
      return false;
    }

    Object.entries(cost).forEach(([type, amount]) => {
      if (amount !== undefined) {
        this.removeResource(type as ResourceType, amount);
      }
    });

    return true;
  }

  public getAllResources(): Map<ResourceType, number> {
    return new Map(this.resources);
  }

  public toJSON(): Record<ResourceType, number> {
    const result = {} as Record<ResourceType, number>;
    this.resources.forEach((amount, type) => {
      result[type] = amount;
    });
    return result;
  }
}
