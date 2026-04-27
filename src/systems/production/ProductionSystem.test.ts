import { describe, it, expect, beforeEach } from '@jest/globals';
import { ProductionSystem } from './ProductionSystem';
import { GameState } from '@/managers/GameState';
import { Nation } from '@/entities/nations';
import { City } from '@/entities/cities';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { ResourceType } from '@/systems/resources/ResourceType';
import { CityBuildingType } from '@/systems/territory/CityBuilding';
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import { TerrainType } from '@/systems/grid/Territory';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import { UnitType } from '@/entities/units/Unit';
import { Infantry } from '@/entities/units/Infantry';

function createNation(id: string): Nation {
  return new Nation(id, id.toUpperCase(), `#${id}`);
}

describe('ProductionSystem', () => {
  let state: GameState;
  let eventBus: GameEventBus;
  let system: ProductionSystem;
  let nation: Nation;

  beforeEach(() => {
    state = new GameState({ rows: 5, cols: 5 });
    eventBus = new GameEventBus();
    system = new ProductionSystem();
    nation = createNation('nation-a');
    state.addNation(nation);
  });

  it('applies passive city, terrain, and deposit income at the right intervals', () => {
    const city = new City('city-a', 'Alpha', nation.getId(), { row: 2, col: 2 });
    city.addBuilding(CityBuildingType.FARMS);
    city.addBuilding(CityBuildingType.WORKSHOP);
    city.addBuilding(CityBuildingType.SCHOOL);
    city.addBuilding(CityBuildingType.MARKET);
    state.addCity(city);

    const farmTile = state.getGrid().getTerritory({ row: 0, col: 0 });
    farmTile?.setControllingNation(nation.getId());
    farmTile?.setTerrainType(TerrainType.PLAINS);
    farmTile?.setBuildings([TerritoryBuildingType.FARMS]);

    const workshopTile = state.getGrid().getTerritory({ row: 0, col: 1 });
    workshopTile?.setControllingNation(nation.getId());
    workshopTile?.setTerrainType(TerrainType.FOREST);
    workshopTile?.setBuildings([TerritoryBuildingType.WORKSHOP]);

    const silverTile = state.getGrid().getTerritory({ row: 0, col: 2 });
    silverTile?.setControllingNation(nation.getId());
    silverTile?.setResourceDeposit(TerritoryResourceType.SILVER);
    silverTile?.setBuildings([TerritoryBuildingType.COPPER_MINE]);

    const goldTile = state.getGrid().getTerritory({ row: 0, col: 3 });
    goldTile?.setControllingNation(nation.getId());
    goldTile?.setResourceDeposit(TerritoryResourceType.GOLD_DEPOSIT);
    goldTile?.setBuildings([TerritoryBuildingType.IRON_MINE]);

    // tick 300: all intervals fire (food@5, material@10, gold@10, research@10 with 30s delay guard, terrain@50)
    system.tick(state, eventBus, 300);

    // FOOD: city base+FARMS(2) + territory FARMS bldg(1) + PLAINS terrain on (0,0)/(0,2)/(0,3)/(2,2)=4 tiles(4) = 7
    expect(nation.getTreasury().getAmount(ResourceType.FOOD)).toBe(7);
    // RAW: city base+WORKSHOP(2) + territory WORKSHOP bldg(1) + FOREST terrain(1) = 4
    expect(nation.getTreasury().getAmount(ResourceType.RAW_MATERIAL)).toBe(4);
    // RESEARCH: city base+SCHOOL (delayed until tick 300) = 2
    expect(nation.getTreasury().getAmount(ResourceType.RESEARCH)).toBe(2);
    // GOLD: city base+MARKET(2) + silver+gold deposit bonus(6) = 8
    expect(nation.getTreasury().getAmount(ResourceType.GOLD)).toBe(8);
  });

  it('applies terrain-only yields on the longer intervals', () => {
    const plains = state.getGrid().getTerritory({ row: 1, col: 1 });
    plains?.setControllingNation(nation.getId());
    plains?.setTerrainType(TerrainType.PLAINS);

    const forest = state.getGrid().getTerritory({ row: 1, col: 2 });
    forest?.setControllingNation(nation.getId());
    forest?.setTerrainType(TerrainType.FOREST);

    const desert = state.getGrid().getTerritory({ row: 1, col: 3 });
    desert?.setControllingNation(nation.getId());
    desert?.setTerrainType(TerrainType.DESERT);

    system.tick(state, eventBus, 50);
    expect(nation.getTreasury().getAmount(ResourceType.FOOD)).toBe(1);
    expect(nation.getTreasury().getAmount(ResourceType.RAW_MATERIAL)).toBe(1);
    expect(nation.getTreasury().getAmount(ResourceType.GOLD)).toBe(0);

    system.tick(state, eventBus, 80);
    expect(nation.getTreasury().getAmount(ResourceType.GOLD)).toBe(1);
  });

  it('completes unit, building, and resource orders with real game state updates', () => {
    const unitCity = new City('city-unit', 'Forge', nation.getId(), { row: 2, col: 2 });
    unitCity.startOrder({
      kind: 'unit',
      unitType: UnitType.INFANTRY,
      label: 'Train Infantry',
      ticksTotal: 1,
      ticksRemaining: 1,
    });
    state.addCity(unitCity);

    const buildingCity = new City('city-building', 'Brick', nation.getId(), { row: 1, col: 1 });
    buildingCity.startOrder({
      kind: 'building',
      buildingType: CityBuildingType.MARKET,
      label: 'Build Market',
      ticksTotal: 1,
      ticksRemaining: 1,
    });
    state.addCity(buildingCity);

    const wallCity = new City('city-wall', 'Gate', nation.getId(), { row: 0, col: 0 });
    wallCity.addBuilding(CityBuildingType.WALLS);
    wallCity.startOrder({
      kind: 'building',
      buildingType: CityBuildingType.WALLS,
      label: 'Walls Lvl 2',
      ticksTotal: 1,
      ticksRemaining: 1,
    });
    state.addCity(wallCity);

    const resourceCity = new City('city-resource', 'Mint', nation.getId(), { row: 3, col: 3 });
    resourceCity.startOrder({
      kind: 'resource',
      resourceType: ResourceType.GOLD,
      resourceAmount: 9,
      label: 'Mint Gold',
      ticksTotal: 1,
      ticksRemaining: 1,
    });
    state.addCity(resourceCity);

    system.tick(state, eventBus, 1);

    const spawnedUnits = state.getUnitsByNation(nation.getId());
    expect(spawnedUnits).toHaveLength(1);
    expect(spawnedUnits[0]?.getHomeCityId()).toBe(unitCity.id);
    expect(spawnedUnits[0]?.getUnitSerial()).toBe(101);
    expect(buildingCity.hasBuilding(CityBuildingType.MARKET)).toBe(true);
    expect(wallCity.getBuildingLevel(CityBuildingType.WALLS)).toBe(2);
    expect(nation.getTreasury().getAmount(ResourceType.GOLD)).toBe(9);
  });

  it('drains upkeep and completes research on tick boundaries', () => {
    const unit = new Infantry('unit-a', nation.getId(), { row: 0, col: 0 });
    state.addUnit(unit);
    nation.getTreasury().addResource(ResourceType.FOOD, 5);
    nation.getTreasury().addResource(ResourceType.RAW_MATERIAL, 5);
    nation.startResearch('writing', 1);

    system.tick(state, eventBus, 30);

    expect(nation.getTreasury().getAmount(ResourceType.FOOD)).toBe(4);
    expect(nation.getTreasury().getAmount(ResourceType.RAW_MATERIAL)).toBe(4);
    expect(nation.hasResearched('writing')).toBe(true);
    expect(nation.getCurrentResearch()).toBeNull();
  });
});
