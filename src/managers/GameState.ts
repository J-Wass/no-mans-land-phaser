/**
 * Game State Manager - central state management for the game
 */

import type { EntityId } from '@/types/common';
import type { Serializable } from '@/types/serializable';
import { Grid } from '@/systems/grid';
import type { GridConfig } from '@/systems/grid';
import { Nation } from '@/entities/nations';
import { City } from '@/entities/cities';
import type { CityData } from '@/entities/cities/City';
import { Unit } from '@/entities/units';
import type { UnitData } from '@/entities/units/Unit';
import { Player } from '@/entities/players';
import type { PlayerId } from '@/entities/players';
import { ResourceType } from '@/systems/resources/ResourceType';
import { DiplomaticStatus } from '@/types/diplomacy';
import { createUnitFromData } from '@/entities/units/unitFactory';
import type { ProductionOrder } from '@/systems/production/ProductionOrder';
import { CityBuildingType } from '@/systems/territory/CityBuilding';
import type { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';

export class GameState implements Serializable<ReturnType<GameState['toJSON']>> {
  private grid:          Grid;
  private nations:       Map<EntityId, Nation>;
  private cities:        Map<EntityId, City>;
  private units:         Map<EntityId, Unit>;
  private players:       Map<PlayerId, Player>;
  private currentTurn:   number;
  private activeNationId: EntityId | null;

  constructor(gridConfig: GridConfig) {
    this.grid          = new Grid(gridConfig);
    this.nations       = new Map();
    this.cities        = new Map();
    this.units         = new Map();
    this.players       = new Map();
    this.currentTurn   = 1;
    this.activeNationId = null;
  }

  public getGrid(): Grid { return this.grid; }

  // ── Player management ─────────────────────────────────────────────────────
  public addPlayer(player: Player): void  { this.players.set(player.getId(), player); }
  public getPlayer(id: PlayerId): Player | null { return this.players.get(id) ?? null; }
  public getLocalPlayer(): Player | null {
    for (const player of this.players.values()) {
      if (player.isLocalPlayer()) return player;
    }
    return null;
  }
  public getAllPlayers(): Player[] { return Array.from(this.players.values()); }

  // ── Nation management ─────────────────────────────────────────────────────
  public addNation(nation: Nation): void  { this.nations.set(nation.getId(), nation); }
  public getNation(id: EntityId): Nation | null { return this.nations.get(id) ?? null; }
  public getAllNations(): Nation[] { return Array.from(this.nations.values()); }
  public removeNation(id: EntityId): boolean { return this.nations.delete(id); }

  // ── City management ───────────────────────────────────────────────────────
  public addCity(city: City): void {
    this.cities.set(city.id, city);
    const territory = this.grid.getTerritory(city.position);
    if (territory) {
      territory.setCityId(city.id);
      territory.setControllingNation(city.getOwnerId());
    }
  }
  public getCity(id: EntityId): City | null { return this.cities.get(id) ?? null; }
  public getAllCities(): City[] { return Array.from(this.cities.values()); }
  public getCitiesByNation(nationId: EntityId): City[] {
    return this.getAllCities().filter(c => c.getOwnerId() === nationId);
  }
  public removeCity(id: EntityId): boolean {
    const city = this.cities.get(id);
    if (city) {
      const territory = this.grid.getTerritory(city.position);
      if (territory) territory.setCityId(null);
      return this.cities.delete(id);
    }
    return false;
  }

  // ── Unit management ───────────────────────────────────────────────────────
  public addUnit(unit: Unit): void  { this.units.set(unit.id, unit); }
  public getUnit(id: EntityId): Unit | null { return this.units.get(id) ?? null; }
  public getAllUnits(): Unit[] { return Array.from(this.units.values()); }
  public getUnitsByNation(nationId: EntityId): Unit[] {
    return this.getAllUnits().filter(u => u.getOwnerId() === nationId);
  }
  public removeUnit(id: EntityId): boolean { return this.units.delete(id); }

  // ── Turn management ───────────────────────────────────────────────────────
  public getCurrentTurn(): number        { return this.currentTurn; }
  public getActiveNationId(): EntityId | null { return this.activeNationId; }
  public setActiveNation(nationId: EntityId): void { this.activeNationId = nationId; }
  public nextTurn(): void {
    const nations = Array.from(this.nations.keys());
    if (nations.length === 0) return;
    const currentIndex = this.activeNationId ? nations.indexOf(this.activeNationId) : -1;
    const nextIndex    = (currentIndex + 1) % nations.length;
    this.activeNationId = nations[nextIndex] ?? null;
    if (nextIndex === 0) this.currentTurn++;
    if (this.activeNationId) {
      this.getUnitsByNation(this.activeNationId).forEach(u => u.resetTurn());
    }
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  public toJSON() {
    return {
      currentTurn:   this.currentTurn,
      activeNationId: this.activeNationId,
      grid:          this.grid.toJSON(),
      nations:       Array.from(this.nations.values()).map(n => n.toJSON()),
      cities:        Array.from(this.cities.values()).map(c => c.toJSON()),
      units:         Array.from(this.units.values()).map(u => u.toJSON()),
      players:       Array.from(this.players.values()).map(p => p.toJSON()),
    };
  }

  /** Reconstruct a GameState from a toJSON() snapshot. Used by the save/load system. */
  public static fromJSON(data: ReturnType<GameState['toJSON']>): GameState {
    const state = new GameState({ rows: data.grid.rows, cols: data.grid.cols });

    // Restore terrain and territory metadata
    for (const td of data.grid.territories) {
      const territory = state.grid.getTerritory(td.coordinates);
      if (!territory) continue;
      territory.setTerrainType(td.terrainType);
      territory.setControllingNation(td.controlledBy);
      if (td.cityId !== null) territory.setCityId(td.cityId);
      if (td.resourceDeposit !== null) territory.setResourceDeposit(td.resourceDeposit);
      // Restore buildings (may be missing in old saves — default to empty)
      territory.setBuildings((td as { buildings?: TerritoryBuildingType[] }).buildings ?? []);
    }

    // Restore nations
    for (const nd of data.nations) {
      const nation = new Nation(nd.id, nd.name, nd.color, nd.isAI);
      nation.setControlledBy(nd.controlledBy);
      Object.entries(nd.treasury).forEach(([type, amount]) => {
        nation.getTreasury().addResource(type as ResourceType, amount as number);
      });
      Object.entries(nd.relations).forEach(([otherId, status]) => {
        nation.setRelation(otherId, status as DiplomaticStatus);
      });
      // Restore research (may be absent in older saves)
      const nAny = nd as { researchedTechs?: string[]; currentResearch?: { techId: string; ticksTotal: number; ticksRemaining: number } | null };
      if (nAny.researchedTechs) nation.setResearchedTechs(nAny.researchedTechs as Parameters<Nation['setResearchedTechs']>[0]);
      if (nAny.currentResearch) nation.restoreCurrentResearch(nAny.currentResearch as Parameters<Nation['restoreCurrentResearch']>[0]);
      state.addNation(nation);
    }

    // Restore players
    for (const pd of data.players) {
      state.addPlayer(new Player(pd.id, pd.displayName, pd.controlledNationId, pd.isLocal));
    }

    // Restore units
    for (const ud of data.units) {
      state.addUnit(createUnitFromData(ud as UnitData));
    }

    // Restore cities
    for (const cd of data.cities) {
      const cityData = cd as CityData;
      const city     = new City(cityData.id, cityData.name, cityData.ownerId, cityData.position);
      if (cityData.currentOrder) city.startOrder(cityData.currentOrder as ProductionOrder);
      // Restore buildings (may be missing in old saves)
      const cdAny = cd as { buildings?: CityBuildingType[]; currentHealth?: number };
      if (cdAny.buildings) city.setBuildings(cdAny.buildings);
      if (typeof cdAny.currentHealth === 'number') city.setHealth(cdAny.currentHealth);
      state.addCity(city);
    }

    state.currentTurn   = data.currentTurn;
    state.activeNationId = data.activeNationId;
    return state;
  }
}
