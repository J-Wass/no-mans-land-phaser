/**
 * Territory system - represents a single grid square
 */

import type { GridCoordinates, EntityId } from '@/types/common';
import type { Serializable } from '@/types/serializable';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';

export const BASE_TERRITORY_HP  = 30;
/** HP bonus per wall level (e.g. lvl 3 = +150 HP). */
export const WALLS_HP_PER_LEVEL  = 50;
/** Attack damage per wall level. lvl 1 = 8, each level +4. */
export const WALLS_DMG_BASE      = 8;
export const WALLS_DMG_PER_LEVEL = 4;
export const BASE_ATTACK_DAMAGE  = 3;
export const MAX_WALLS_LEVEL     = 5;

/** Legacy alias kept so existing imports don't break. */
export const WALLS_HP_BONUS      = WALLS_HP_PER_LEVEL;
export const WALLS_ATTACK_DAMAGE = WALLS_DMG_BASE;

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
  buildingLevels:  Partial<Record<TerritoryBuildingType, number>>;
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
      buildingLevels: {},
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
      this.data.buildingLevels = { ...this.data.buildingLevels, [b]: 1 };
      this.data.currentHealth = this.getMaxHealth();
    }
  }

  public setBuildings(buildings: TerritoryBuildingType[]): void {
    this.data.buildings = [...buildings];
    // Initialise any missing levels at 1
    for (const b of buildings) {
      if (!this.data.buildingLevels[b]) {
        this.data.buildingLevels = { ...this.data.buildingLevels, [b]: 1 };
      }
    }
    this.data.currentHealth = this.getMaxHealth();
  }

  // ── Building levels ──────────────────────────────────────────────────────────

  public getBuildingLevel(b: TerritoryBuildingType): number {
    if (!this.hasBuilding(b)) return 0;
    return this.data.buildingLevels[b] ?? 1;
  }

  public setBuildingLevel(b: TerritoryBuildingType, level: number): void {
    this.data.buildingLevels = { ...this.data.buildingLevels, [b]: level };
    this.data.currentHealth = this.getMaxHealth();
  }

  public upgradeBuildingLevel(b: TerritoryBuildingType): boolean {
    if (!this.hasBuilding(b)) return false;
    const current = this.getBuildingLevel(b);
    if (b === TerritoryBuildingType.WALLS && current >= MAX_WALLS_LEVEL) return false;
    this.data.buildingLevels = { ...this.data.buildingLevels, [b]: current + 1 };
    this.data.currentHealth = this.getMaxHealth();
    return true;
  }

  // ── Health (determined by wall level) ────────────────────────────────────────

  public getMaxHealth(): number {
    const wallLvl = this.getBuildingLevel(TerritoryBuildingType.WALLS);
    return BASE_TERRITORY_HP + wallLvl * WALLS_HP_PER_LEVEL;
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
    const wallLvl = this.getBuildingLevel(TerritoryBuildingType.WALLS);
    if (wallLvl === 0) return BASE_ATTACK_DAMAGE;
    return WALLS_DMG_BASE + (wallLvl - 1) * WALLS_DMG_PER_LEVEL;
  }

  /** Range in tiles from which walls can fire at attackers (1 = adjacent only). */
  public getWallsRange(): number {
    const lvl = this.getBuildingLevel(TerritoryBuildingType.WALLS);
    if (lvl >= 4) return 3;
    if (lvl >= 2) return 2;
    return 1;
  }

  public getData(): Readonly<TerritoryData> {
    return this.data;
  }

  public toJSON(): TerritoryData {
    return {
      ...this.data,
      coordinates:    { ...this.data.coordinates },
      buildings:      [...this.data.buildings],
      buildingLevels: { ...this.data.buildingLevels },
    };
  }
}
