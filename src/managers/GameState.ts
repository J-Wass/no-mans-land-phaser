/**
 * Game State Manager - central state management for the game
 */

import type { EntityId } from '@/types/common';
import { Grid } from '@/systems/grid';
import type { GridConfig } from '@/systems/grid';
import { Nation } from '@/entities/nations';
import { City } from '@/entities/cities';
import { Unit } from '@/entities/units';

export class GameState {
  private grid: Grid;
  private nations: Map<EntityId, Nation>;
  private cities: Map<EntityId, City>;
  private units: Map<EntityId, Unit>;
  private currentTurn: number;
  private activeNationId: EntityId | null;

  constructor(gridConfig: GridConfig) {
    this.grid = new Grid(gridConfig);
    this.nations = new Map();
    this.cities = new Map();
    this.units = new Map();
    this.currentTurn = 1;
    this.activeNationId = null;
  }

  // Grid access
  public getGrid(): Grid {
    return this.grid;
  }

  // Nation management
  public addNation(nation: Nation): void {
    this.nations.set(nation.getId(), nation);
  }

  public getNation(id: EntityId): Nation | null {
    return this.nations.get(id) ?? null;
  }

  public getAllNations(): Nation[] {
    return Array.from(this.nations.values());
  }

  public removeNation(id: EntityId): boolean {
    return this.nations.delete(id);
  }

  // City management
  public addCity(city: City): void {
    this.cities.set(city.id, city);
    const territory = this.grid.getTerritory(city.position);
    if (territory) {
      territory.setCityId(city.id);
      territory.setControllingNation(city.getOwnerId());
    }
  }

  public getCity(id: EntityId): City | null {
    return this.cities.get(id) ?? null;
  }

  public getAllCities(): City[] {
    return Array.from(this.cities.values());
  }

  public getCitiesByNation(nationId: EntityId): City[] {
    return this.getAllCities().filter(city => city.getOwnerId() === nationId);
  }

  public removeCity(id: EntityId): boolean {
    const city = this.cities.get(id);
    if (city) {
      const territory = this.grid.getTerritory(city.position);
      if (territory) {
        territory.setCityId(null);
      }
      return this.cities.delete(id);
    }
    return false;
  }

  // Unit management
  public addUnit(unit: Unit): void {
    this.units.set(unit.id, unit);
  }

  public getUnit(id: EntityId): Unit | null {
    return this.units.get(id) ?? null;
  }

  public getAllUnits(): Unit[] {
    return Array.from(this.units.values());
  }

  public getUnitsByNation(nationId: EntityId): Unit[] {
    return this.getAllUnits().filter(unit => unit.getOwnerId() === nationId);
  }

  public removeUnit(id: EntityId): boolean {
    return this.units.delete(id);
  }

  // Turn management
  public getCurrentTurn(): number {
    return this.currentTurn;
  }

  public getActiveNationId(): EntityId | null {
    return this.activeNationId;
  }

  public setActiveNation(nationId: EntityId): void {
    this.activeNationId = nationId;
  }

  public nextTurn(): void {
    // Reset all units for the next nation's turn
    const nations = Array.from(this.nations.keys());
    if (nations.length === 0) return;

    const currentIndex = this.activeNationId
      ? nations.indexOf(this.activeNationId)
      : -1;

    const nextIndex = (currentIndex + 1) % nations.length;
    this.activeNationId = nations[nextIndex] ?? null;

    // If we've cycled back to the first nation, increment turn
    if (nextIndex === 0) {
      this.currentTurn++;
    }

    // Reset units for the active nation
    if (this.activeNationId) {
      this.getUnitsByNation(this.activeNationId).forEach(unit => {
        unit.resetTurn();
      });
    }
  }
}
