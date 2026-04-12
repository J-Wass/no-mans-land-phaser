/**
 * City entity - represents a city that occupies a territory
 */

import type { EntityId, GridCoordinates, GameEntity, EntityType } from '@/types/common';
import { ResourceStorage, ResourceType } from '@/systems/resources/ResourceType';
import type { UnitType } from '@/entities/units';

export interface CityData {
  id: EntityId;
  name: string;
  ownerId: EntityId; // Nation ID
  position: GridCoordinates;
  population: number;
  productionQueue: UnitType[];
  currentProduction: UnitType | null;
  productionProgress: number; // Progress toward current production (0-100)
}

export class City implements GameEntity {
  private data: CityData;
  private storage: ResourceStorage;
  public readonly type: EntityType.CITY = EntityType.CITY;

  constructor(
    id: EntityId,
    name: string,
    ownerId: EntityId,
    position: GridCoordinates
  ) {
    this.data = {
      id,
      name,
      ownerId,
      position,
      population: 1000,
      productionQueue: [],
      currentProduction: null,
      productionProgress: 0
    };
    this.storage = new ResourceStorage();
  }

  public get id(): EntityId {
    return this.data.id;
  }

  public get position(): GridCoordinates {
    return { ...this.data.position };
  }

  public getName(): string {
    return this.data.name;
  }

  public getOwnerId(): EntityId {
    return this.data.ownerId;
  }

  public setOwnerId(nationId: EntityId): void {
    this.data.ownerId = nationId;
  }

  public getPopulation(): number {
    return this.data.population;
  }

  public growPopulation(amount: number): void {
    this.data.population += amount;
  }

  public getStorage(): ResourceStorage {
    return this.storage;
  }

  public addResourceProduction(type: ResourceType, amount: number): void {
    this.storage.addResource(type, amount);
  }

  public getCurrentProduction(): UnitType | null {
    return this.data.currentProduction;
  }

  public setProduction(unitType: UnitType): void {
    this.data.currentProduction = unitType;
    this.data.productionProgress = 0;
  }

  public addProductionToQueue(unitType: UnitType): void {
    this.data.productionQueue.push(unitType);
  }

  public advanceProduction(amount: number): boolean {
    if (this.data.currentProduction === null) {
      // Start next in queue if available
      const next = this.data.productionQueue.shift();
      if (next) {
        this.setProduction(next);
      } else {
        return false;
      }
    }

    this.data.productionProgress += amount;

    // Check if production is complete
    if (this.data.productionProgress >= 100) {
      this.data.productionProgress = 0;
      this.data.currentProduction = null;
      return true; // Production complete
    }

    return false;
  }

  public getProductionProgress(): number {
    return this.data.productionProgress;
  }

  public getProductionQueue(): readonly UnitType[] {
    return [...this.data.productionQueue];
  }

  public getData(): Readonly<CityData> {
    return this.data;
  }
}
