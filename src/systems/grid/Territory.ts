/**
 * Territory system - represents a single grid square
 */

import type { GridCoordinates, EntityId } from '@/types/common';
import type { Serializable } from '@/types/serializable';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';

export const BASE_TERRITORY_HP  = 30;
export const WALLS_HP_BONUS      = 50;
export const WALLS_ATTACK_DAMAGE = 8;
export const BASE_ATTACK_DAMAGE  = 3;

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
  currentHealth:   number;
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
      currentHealth: BASE_TERRITORY_HP,
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
    if (!this.hasBuilding(b)) {
      this.data.buildings.push(b);
      this.data.currentHealth = this.getMaxHealth(); // fresh construction fully restores
    }
  }

  public setBuildings(buildings: TerritoryBuildingType[]): void {
    this.data.buildings = [...buildings];
    this.data.currentHealth = this.getMaxHealth();
  }

  // ── Health (determined by wall level) ────────────────────────────────────────

  public getMaxHealth(): number {
    return BASE_TERRITORY_HP + (this.hasBuilding(TerritoryBuildingType.WALLS) ? WALLS_HP_BONUS : 0);
  }

  public getHealth(): number { return this.data.currentHealth; }

  public takeDamage(amount: number): void {
    this.data.currentHealth = Math.max(0, this.data.currentHealth - amount);
  }

  public heal(amount: number): void {
    this.data.currentHealth = Math.min(this.getMaxHealth(), this.data.currentHealth + amount);
  }

  public setHealth(amount: number): void {
    this.data.currentHealth = Math.max(0, Math.min(this.getMaxHealth(), amount));
  }

  public getAttackDamage(): number {
    return this.hasBuilding(TerritoryBuildingType.WALLS) ? WALLS_ATTACK_DAMAGE : BASE_ATTACK_DAMAGE;
  }

  public getData(): Readonly<TerritoryData> {
    return this.data;
  }

  public toJSON(): TerritoryData {
    return {
      ...this.data,
      coordinates: { ...this.data.coordinates },
      buildings:   [...this.data.buildings],
    };
  }
}
