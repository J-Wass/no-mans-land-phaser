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
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';

export class GameState implements Serializable<ReturnType<GameState['toJSON']>> {
  private grid:             Grid;
  private nations:          Map<EntityId, Nation>;
  private cities:           Map<EntityId, City>;
  private units:            Map<EntityId, Unit>;
  private players:          Map<PlayerId, Player>;
  private currentTurn:      number;
  private activeNationId:   EntityId | null;
  /** Next serial number to assign per unit type (starts at 100 → first serial = 101). */
  private unitTypeCounters: Map<string, number>;
  /** Tiles each nation has ever had line-of-sight on. */
  private discoveredTiles:  Map<EntityId, Set<string>>;

  constructor(gridConfig: GridConfig) {
    this.grid             = new Grid(gridConfig);
    this.nations          = new Map();
    this.cities           = new Map();
    this.units            = new Map();
    this.players          = new Map();
    this.currentTurn      = 1;
    this.activeNationId   = null;
    this.unitTypeCounters = new Map();
    this.discoveredTiles  = new Map();
  }

  /** Increment and return the next ordinal serial number for a unit type. */
  public nextUnitSerial(type: string): number {
    const current = this.unitTypeCounters.get(type) ?? 100;
    const next = current + 1;
    this.unitTypeCounters.set(type, next);
    return next;
  }

  // ── Discovered tiles (fog of war) ─────────────────────────────────────────
  public getDiscoveredTiles(nationId: EntityId): Set<string> {
    let set = this.discoveredTiles.get(nationId);
    if (!set) { set = new Set(); this.discoveredTiles.set(nationId, set); }
    return set;
  }

  public markDiscovered(nationId: EntityId, tiles: Iterable<string>): void {
    const set = this.getDiscoveredTiles(nationId);
    for (const key of tiles) set.add(key);
  }

  /** Nations the observer has encountered via discovered territory/cities or diplomacy. */
  public getKnownNationIds(observerNationId: EntityId): EntityId[] {
    const known = new Set<EntityId>();
    const discovered = this.getDiscoveredTiles(observerNationId);

    for (const key of discovered) {
      const [rowStr, colStr] = key.split(',');
      const row = Number.parseInt(rowStr ?? '', 10);
      const col = Number.parseInt(colStr ?? '', 10);
      if (!Number.isFinite(row) || !Number.isFinite(col)) continue;

      const territory = this.grid.getTerritory({ row, col });
      const ownerId = territory?.getControllingNation();
      if (ownerId && ownerId !== observerNationId) known.add(ownerId);

      const cityId = territory?.getCityId();
      const cityOwner = cityId ? this.cities.get(cityId)?.getOwnerId() : null;
      if (cityOwner && cityOwner !== observerNationId) known.add(cityOwner);
    }

    const observer = this.getNation(observerNationId);
    if (observer) {
      for (const nation of this.nations.values()) {
        if (nation.getId() === observerNationId) continue;
        if (observer.getRelation(nation.getId()) !== DiplomaticStatus.NEUTRAL) {
          known.add(nation.getId());
        }
      }
    }

    return Array.from(known);
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

  // ── Resource deposits ─────────────────────────────────────────────────────

  /**
   * Returns the set of TerritoryResourceTypes that are "active" for a nation —
   * i.e. the nation controls the territory AND has built the matching mine.
   *
   * Material deposits (Copper/Iron/FireGlass) need their specific mine building.
   * Mana deposits need a MANA_MINE building.
   * Silver/GoldDeposit need a SILVER_MINE/GOLD_MINE — treated the same as copper mine for now.
   */
  public getNationActiveDeposits(nationId: EntityId): Set<TerritoryResourceType> {
    const result = new Set<TerritoryResourceType>();
    for (const territory of this.grid.getTerritoriesByNation(nationId)) {
      const deposit = territory.getResourceDeposit();
      if (!deposit) continue;
      const buildings = territory.getBuildings();
      const isMana = (
        deposit === TerritoryResourceType.WATER_MANA ||
        deposit === TerritoryResourceType.FIRE_MANA ||
        deposit === TerritoryResourceType.LIGHTNING_MANA ||
        deposit === TerritoryResourceType.EARTH_MANA ||
        deposit === TerritoryResourceType.AIR_MANA ||
        deposit === TerritoryResourceType.SHADOW_MANA
      );
      if (isMana && buildings.includes(TerritoryBuildingType.MANA_MINE)) {
        result.add(deposit);
      } else if (deposit === TerritoryResourceType.COPPER && buildings.includes(TerritoryBuildingType.COPPER_MINE)) {
        result.add(deposit);
      } else if (deposit === TerritoryResourceType.IRON && buildings.includes(TerritoryBuildingType.IRON_MINE)) {
        result.add(deposit);
      } else if (deposit === TerritoryResourceType.FIRE_GLASS && buildings.includes(TerritoryBuildingType.FIRE_GLASS_MINE)) {
        result.add(deposit);
      } else if (
        (deposit === TerritoryResourceType.SILVER || deposit === TerritoryResourceType.GOLD_DEPOSIT) &&
        (buildings.includes(TerritoryBuildingType.COPPER_MINE) || buildings.includes(TerritoryBuildingType.IRON_MINE))
      ) {
        // Silver/gold deposits activated by any ore mine (placeholder until dedicated buildings exist)
        result.add(deposit);
      }
    }
    return result;
  }

  /**
   * Like getNationActiveDeposits but returns a count of active mines per deposit type.
   * Useful for "further advantage" scaling where two mines of the same type give extra bonuses.
   */
  public getNationActiveDepositCounts(nationId: EntityId): Map<TerritoryResourceType, number> {
    const result = new Map<TerritoryResourceType, number>();
    const deposits = this.getNationActiveDeposits(nationId);
    // Count active mines by iterating controlled territories again
    for (const territory of this.grid.getTerritoriesByNation(nationId)) {
      const deposit = territory.getResourceDeposit();
      if (!deposit || !deposits.has(deposit)) continue;
      result.set(deposit, (result.get(deposit) ?? 0) + 1);
    }
    return result;
  }

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
      currentTurn:      this.currentTurn,
      activeNationId:   this.activeNationId,
      grid:             this.grid.toJSON(),
      nations:          Array.from(this.nations.values()).map(n => n.toJSON()),
      cities:           Array.from(this.cities.values()).map(c => c.toJSON()),
      units:            Array.from(this.units.values()).map(u => u.toJSON()),
      players:          Array.from(this.players.values()).map(p => p.toJSON()),
      unitTypeCounters: Object.fromEntries(this.unitTypeCounters),
      discoveredTiles:  Array.from(this.discoveredTiles.entries()).map(([nationId, tiles]) => ({
        nationId,
        tiles: Array.from(tiles),
      })),
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
      // Restore building levels (may be missing in old saves — setBuildings defaults to level 1)
      const savedLevels = (td as { buildingLevels?: Partial<Record<TerritoryBuildingType, number>> }).buildingLevels;
      if (savedLevels) {
        for (const [building, level] of Object.entries(savedLevels)) {
          territory.setBuildingLevel(building as TerritoryBuildingType, level as number);
        }
      }
      // Restore health (may be missing in old saves — setBuildings already set it to max)
      const savedHp = (td as { currentHealth?: number }).currentHealth;
      if (savedHp !== undefined) territory.setHealth(savedHp);
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
      const cdAny = cd as {
        buildings?: CityBuildingType[];
        buildingLevels?: Partial<Record<CityBuildingType, number>>;
        currentHealth?: number;
      };
      if (cdAny.buildings) city.setBuildings(cdAny.buildings);
      if (cdAny.buildingLevels) {
        for (const [building, level] of Object.entries(cdAny.buildingLevels)) {
          city.setBuildingLevel(building as CityBuildingType, level as number);
        }
      }
      if (typeof cdAny.currentHealth === 'number') city.setHealth(cdAny.currentHealth);
      state.addCity(city);
    }

    state.currentTurn    = data.currentTurn;
    state.activeNationId = data.activeNationId;

    // Restore unit type serial counters (may be absent in old saves)
    const dataAny = data as { unitTypeCounters?: Record<string, number>; discoveredTiles?: Array<{ nationId: string; tiles: string[] }> };
    if (dataAny.unitTypeCounters) {
      for (const [type, count] of Object.entries(dataAny.unitTypeCounters)) {
        state.unitTypeCounters.set(type, count);
      }
    } else {
      // Derive counters from max serial on existing units
      for (const unit of state.units.values()) {
        const s = unit.getUnitSerial();
        if (s > 0) {
          const cur = state.unitTypeCounters.get(unit.getUnitType()) ?? 100;
          if (s > cur) state.unitTypeCounters.set(unit.getUnitType(), s);
        }
      }
    }

    // Restore discovered tiles per nation
    if (dataAny.discoveredTiles) {
      for (const { nationId, tiles } of dataAny.discoveredTiles) {
        state.discoveredTiles.set(nationId, new Set(tiles));
      }
    }

    return state;
  }
}
