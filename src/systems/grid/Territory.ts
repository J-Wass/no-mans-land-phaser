/**
 * Territory system - represents a single grid square
 */

import type { GridCoordinates, EntityId } from '@/types/common';
import type { Serializable } from '@/types/serializable';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import type { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';

export enum TerrainType {
  PLAINS   = 'PLAINS',
  HILLS    = 'HILLS',
  FOREST   = 'FOREST',
  MOUNTAIN = 'MOUNTAIN',
  WATER    = 'WATER',
  DESERT   = 'DESERT',
}

export interface TerritoryData {
  coordinates:     GridCoordinates;
  terrainType:     TerrainType;
  controlledBy:    EntityId | null;
  cityId:          EntityId | null;
  resourceDeposit: TerritoryResourceType | null;
  buildings:       TerritoryBuildingType[];
}

export class Territory implements Serializable<TerritoryData> {
  private data: TerritoryData;

  constructor(coordinates: GridCoordinates, terrainType: TerrainType) {
    this.data = {
      coordinates,
      terrainType,
      controlledBy: null,
      cityId: null,
      resourceDeposit: null,
      buildings: [],
    };
  }

  public getCoordinates(): GridCoordinates {
    return { ...this.data.coordinates };
  }

  public getTerrainType(): TerrainType {
    return this.data.terrainType;
  }

  public setTerrainType(terrainType: TerrainType): void {
    this.data.terrainType = terrainType;
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

  public getResourceDeposit(): TerritoryResourceType | null {
    return this.data.resourceDeposit;
  }

  public setResourceDeposit(resource: TerritoryResourceType | null): void {
    this.data.resourceDeposit = resource;
  }

  public isOccupied(): boolean {
    return this.data.cityId !== null;
  }

  // ── Buildings ────────────────────────────────────────────────────────────────

  public getBuildings(): readonly TerritoryBuildingType[] {
    return this.data.buildings;
  }

  public hasBuilding(b: TerritoryBuildingType): boolean {
    return this.data.buildings.includes(b);
  }

  public addBuilding(b: TerritoryBuildingType): void {
    if (!this.hasBuilding(b)) this.data.buildings.push(b);
  }

  public setBuildings(buildings: TerritoryBuildingType[]): void {
    this.data.buildings = [...buildings];
  }

  public getData(): Readonly<TerritoryData> {
    return this.data;
  }

  public toJSON(): TerritoryData {
    return {
      ...this.data,
      coordinates: { ...this.data.coordinates },
      buildings: [...this.data.buildings],
    };
  }
}
