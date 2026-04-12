/**
 * Resource system - defines all resource types
 */

export enum ResourceType {
  FIRE_MANA = 'FIRE_MANA',
  WATER_MANA = 'WATER_MANA',
  IRON = 'IRON',
  GOLD = 'GOLD',
  FOOD = 'FOOD',
  WOOD = 'WOOD'
}

export interface Resource {
  type: ResourceType;
  amount: number;
}

export interface ResourceCost {
  [ResourceType.FIRE_MANA]?: number;
  [ResourceType.WATER_MANA]?: number;
  [ResourceType.IRON]?: number;
  [ResourceType.GOLD]?: number;
  [ResourceType.FOOD]?: number;
  [ResourceType.WOOD]?: number;
}

export class ResourceStorage {
  private resources: Map<ResourceType, number>;

  constructor() {
    this.resources = new Map();
    // Initialize all resources to 0
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
}
