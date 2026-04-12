/**
 * Territory system - represents a single grid square
 */

import type { GridCoordinates, EntityId } from '@/types/common';
import { ResourceType } from '@/systems/resources/ResourceType';

export enum TerrainType {
  PLAINS = 'PLAINS',
  FOREST = 'FOREST',
  MOUNTAIN = 'MOUNTAIN',
  WATER = 'WATER',
  DESERT = 'DESERT'
}

export interface TerritoryData {
  coordinates: GridCoordinates;
  terrainType: TerrainType;
  controlledBy: EntityId | null; // Nation ID
  cityId: EntityId | null; // City ID if this territory has a city
  resourceDeposit: ResourceType | null; // Natural resource on this tile
}

export class Territory {
  private data: TerritoryData;

  constructor(coordinates: GridCoordinates, terrainType: TerrainType) {
    this.data = {
      coordinates,
      terrainType,
      controlledBy: null,
      cityId: null,
      resourceDeposit: null
    };
  }

  public getCoordinates(): GridCoordinates {
    return { ...this.data.coordinates };
  }

  public getTerrainType(): TerrainType {
    return this.data.terrainType;
  }

  public getControllingNation(): EntityId | null {
    return this.data.controlledBy;
  }

  public setControllingNation(nationId: EntityId | null): void {
    this.data.controlledBy = nationId;
  }

  public getCityId(): EntityId | null {
    return this.data.cityId;
  }

  public setCityId(cityId: EntityId | null): void {
    this.data.cityId = cityId;
  }

  public hasCity(): boolean {
    return this.data.cityId !== null;
  }

  public getResourceDeposit(): ResourceType | null {
    return this.data.resourceDeposit;
  }

  public setResourceDeposit(resource: ResourceType | null): void {
    this.data.resourceDeposit = resource;
  }

  public isOccupied(): boolean {
    return this.data.cityId !== null;
  }

  public getData(): Readonly<TerritoryData> {
    return this.data;
  }
}
