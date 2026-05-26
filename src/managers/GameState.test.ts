import { describe, it, expect } from '@jest/globals';
import { GameState } from './GameState';
import { Nation } from '@/entities/nations';
import { City } from '@/entities/cities';
import { Infantry } from '@/entities/units/Infantry';
import { Player } from '@/entities/players';
import { DiplomaticStatus } from '@/types/diplomacy';
import { ResourceType } from '@/systems/resources/ResourceType';
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import { CityBuildingType } from '@/systems/territory/CityBuilding';

function createNation(id: string, isAI = false): Nation {
  return new Nation(id, id.toUpperCase(), `#${id}`, isAI);
}

describe('GameState', () => {
  it('increments unit serials independently per unit type', () => {
    const state = new GameState({ rows: 4, cols: 4 });

    expect(state.nextUnitSerial('INFANTRY')).toBe(101);
    expect(state.nextUnitSerial('INFANTRY')).toBe(102);
    expect(state.nextUnitSerial('CAVALRY')).toBe(101);
    expect(state.nextUnitSerial('INFANTRY')).toBe(103);
  });

  it('keeps the nation->units index consistent across add and remove', () => {
    const state = new GameState({ rows: 4, cols: 4 });
    const a = new Infantry('u-a', 'nation-1', { row: 0, col: 0 });
    const b = new Infantry('u-b', 'nation-1', { row: 0, col: 1 });
    const c = new Infantry('u-c', 'nation-2', { row: 1, col: 0 });
    state.addUnit(a);
    state.addUnit(b);
    state.addUnit(c);

    expect(state.getUnitsByNation('nation-1').map(u => u.id).sort()).toEqual(['u-a', 'u-b']);
    expect(state.getUnitsByNation('nation-2').map(u => u.id)).toEqual(['u-c']);

    state.removeUnit('u-a');
    expect(state.getUnitsByNation('nation-1').map(u => u.id)).toEqual(['u-b']);
    expect(state.getUnitsByNation('nation-3')).toEqual([]);
  });

  it('round-trips the deterministic RNG state through save/load', () => {
    const state = new GameState({ rows: 4, cols: 4 }, 13579);
    // Advance the stream a bit, then snapshot.
    for (let i = 0; i < 5; i++) state.getRng().next();
    const snapshot = state.toJSON();

    const restored = GameState.fromJSON(snapshot);
    // Both generators must now yield the identical continuation.
    const original = Array.from({ length: 10 }, () => state.getRng().next());
    const reloaded = Array.from({ length: 10 }, () => restored.getRng().next());
    expect(reloaded).toEqual(original);
  });

  it('tracks known nations from discovered land, cities, and diplomacy', () => {
    const state = new GameState({ rows: 4, cols: 4 });
    const observer = createNation('nation-a');
    const borderNation = createNation('nation-b');
    const cityNation = createNation('nation-c');
    const diplomaticNation = createNation('nation-d');

    observer.setRelation(diplomaticNation.getId(), DiplomaticStatus.WAR);

    state.addNation(observer);
    state.addNation(borderNation);
    state.addNation(cityNation);
    state.addNation(diplomaticNation);

    state.getGrid().getTerritory({ row: 1, col: 1 })?.setControllingNation(borderNation.getId());
    state.addCity(new City('city-c', 'Capital', cityNation.getId(), { row: 2, col: 2 }));

    state.markDiscovered(observer.getId(), ['1,1', '2,2', 'bad-key']);

    expect(new Set(state.getKnownNationIds(observer.getId()))).toEqual(
      new Set([borderNation.getId(), cityNation.getId(), diplomaticNation.getId()]),
    );
  });

  it('counts active deposits only when the right mines exist', () => {
    const state = new GameState({ rows: 4, cols: 4 });
    const nation = createNation('nation-a');
    state.addNation(nation);

    const copperTile = state.getGrid().getTerritory({ row: 0, col: 0 });
    copperTile?.setControllingNation(nation.getId());
    copperTile?.setResourceDeposit(TerritoryResourceType.COPPER);
    copperTile?.setBuildings([TerritoryBuildingType.COPPER_MINE]);

    const silverTile = state.getGrid().getTerritory({ row: 0, col: 1 });
    silverTile?.setControllingNation(nation.getId());
    silverTile?.setResourceDeposit(TerritoryResourceType.SILVER);
    silverTile?.setBuildings([TerritoryBuildingType.IRON_MINE]);

    const airTile = state.getGrid().getTerritory({ row: 0, col: 2 });
    airTile?.setControllingNation(nation.getId());
    airTile?.setResourceDeposit(TerritoryResourceType.AIR_MANA);
    airTile?.setBuildings([TerritoryBuildingType.MANA_MINE]);

    const dormantIronTile = state.getGrid().getTerritory({ row: 0, col: 3 });
    dormantIronTile?.setControllingNation(nation.getId());
    dormantIronTile?.setResourceDeposit(TerritoryResourceType.IRON);
    dormantIronTile?.setBuildings([TerritoryBuildingType.OUTPOST]);

    expect(state.getNationActiveDeposits(nation.getId())).toEqual(
      new Set([
        TerritoryResourceType.COPPER,
        TerritoryResourceType.SILVER,
        TerritoryResourceType.AIR_MANA,
      ]),
    );
    expect(state.getNationActiveDepositCounts(nation.getId())).toEqual(
      new Map([
        [TerritoryResourceType.COPPER, 1],
        [TerritoryResourceType.SILVER, 1],
        [TerritoryResourceType.AIR_MANA, 1],
      ]),
    );
  });

  it('rotates turns and resets only the next active nation units', () => {
    const state = new GameState({ rows: 4, cols: 4 });
    const nationA = createNation('nation-a');
    const nationB = createNation('nation-b');
    state.addNation(nationA);
    state.addNation(nationB);

    const unitA = new Infantry('unit-a', nationA.getId(), { row: 0, col: 0 });
    const unitB = new Infantry('unit-b', nationB.getId(), { row: 1, col: 1 });
    unitA.moveTo({ row: 0, col: 1 });
    unitA.markAttacked();
    unitB.moveTo({ row: 1, col: 2 });
    unitB.markAttacked();
    state.addUnit(unitA);
    state.addUnit(unitB);

    state.setActiveNation(nationA.getId());
    state.nextTurn();

    expect(state.getActiveNationId()).toBe(nationB.getId());
    expect(state.getCurrentTurn()).toBe(1);
    expect(unitA.canMove()).toBe(false);
    expect(unitB.canMove()).toBe(true);
    expect(unitB.canAttack()).toBe(true);

    state.nextTurn();

    expect(state.getActiveNationId()).toBe(nationA.getId());
    expect(state.getCurrentTurn()).toBe(2);
    expect(unitA.canMove()).toBe(true);
    expect(unitA.canAttack()).toBe(true);
  });

  it('defeats a nation, tombstones it, removes diplomacy, and neutralizes its land', () => {
    const state = new GameState({ rows: 4, cols: 4 });
    const victor = createNation('nation-a');
    const defeated = createNation('nation-b');
    victor.declareWar(defeated.getId());
    defeated.declareWar(victor.getId());
    state.addNation(victor);
    state.addNation(defeated);

    const tile = state.getGrid().getTerritory({ row: 1, col: 1 });
    tile?.setControllingNation(defeated.getId());
    tile?.setBuildings([TerritoryBuildingType.OUTPOST]);
    tile?.startConstruction({
      building: TerritoryBuildingType.WALLS,
      nationId: defeated.getId(),
      label: 'Walls',
      ticksTotal: 10,
      ticksRemaining: 5,
    });

    const tombstone = state.defeatNation(defeated.getId(), 42);

    expect(tombstone).toEqual(expect.objectContaining({ id: defeated.getId(), name: defeated.getName(), defeatedAtTick: 42 }));
    expect(state.getNation(defeated.getId())).toBeNull();
    expect(state.getDefeatedNation(defeated.getId())?.name).toBe(defeated.getName());
    expect(victor.getRelation(defeated.getId())).toBe(DiplomaticStatus.NEUTRAL);
    expect(tile?.getControllingNation()).toBeNull();
    expect(tile?.getBuildings()).toEqual([]);
    expect(tile?.getCurrentConstruction()).toBeNull();
  });

  it('round-trips state through serialization with saves-related metadata intact', () => {
    const state = new GameState({ rows: 4, cols: 4 });
    const nationA = createNation('nation-a');
    const nationB = createNation('nation-b', true);
    nationA.setControlledBy('player-1');
    nationA.getTreasury().addResource(ResourceType.GOLD, 12);
    nationA.getTreasury().addResource(ResourceType.FOOD, 7);
    nationA.setRelation(nationB.getId(), DiplomaticStatus.ALLY);
    nationA.setResearchedTechs(['writing']);
    nationA.restoreCurrentResearch({ techId: 'trade', ticksTotal: 15, ticksRemaining: 6 });
    nationA.queueResearch('mathematics');
    state.addNation(nationA);
    state.addNation(nationB);

    state.addPlayer(new Player('player-1', 'Local', nationA.getId(), true));
    state.addPlayer(new Player('player-2', 'Remote', nationB.getId(), false));

    const city = new City('city-a', 'Alpha', nationA.getId(), { row: 1, col: 1 });
    city.addBuilding(CityBuildingType.FARMS);
    city.addBuilding(CityBuildingType.WALLS);
    city.setBuildingLevel(CityBuildingType.WALLS, 3);
    city.setHealth(150);
    city.startOrder({
      kind: 'building',
      buildingType: CityBuildingType.MARKET,
      label: 'Market',
      ticksTotal: 10,
      ticksRemaining: 4,
    });
    state.addCity(city);

    const territory = state.getGrid().getTerritory({ row: 2, col: 2 });
    territory?.setControllingNation(nationA.getId());
    territory?.setResourceDeposit(TerritoryResourceType.FIRE_MANA);
    territory?.setBuildings([TerritoryBuildingType.MANA_MINE, TerritoryBuildingType.WALLS]);
    territory?.setBuildingLevel(TerritoryBuildingType.WALLS, 3);
    territory?.setHealth(90);

    const unit = new Infantry('unit-a', nationA.getId(), { row: 1, col: 2 });
    unit.setHealth(60);
    unit.setHomeCityId(city.id);
    unit.setPreferredTargetId('unit-b');
    unit.setXP(8);
    unit.setVeteranLevel(1);
    unit.setUnitSerial(144);
    unit.setRetreatCooldownUntilTick(33);
    state.addUnit(unit);

    state.nextUnitSerial('INFANTRY');
    state.nextUnitSerial('INFANTRY');
    state.markDiscovered(nationA.getId(), ['1,1', '2,2']);
    state.setActiveNation(nationB.getId());
    state.nextTurn();

    const restored = GameState.fromJSON(state.toJSON());

    expect(restored.getCurrentTurn()).toBe(2);
    expect(restored.getActiveNationId()).toBe(nationA.getId());
    expect(restored.getLocalPlayer()?.getId()).toBe('player-1');
    expect(restored.getNation(nationA.getId())?.getControlledBy()).toBe('player-1');
    expect(restored.getNation(nationA.getId())?.getRelation(nationB.getId())).toBe(DiplomaticStatus.ALLY);
    expect(restored.getNation(nationA.getId())?.getTreasury().getAmount(ResourceType.GOLD)).toBe(12);
    expect(Array.from(restored.getNation(nationA.getId())?.getResearchedTechs() ?? [])).toEqual(['writing']);
    expect(restored.getNation(nationA.getId())?.getCurrentResearch()).toEqual({
      techId: 'trade',
      ticksTotal: 15,
      ticksRemaining: 6,
    });
    expect(restored.getNation(nationA.getId())?.getResearchQueue()).toEqual(['mathematics']);
    expect(restored.getCity(city.id)?.getCurrentOrder()).toEqual(city.getCurrentOrder());
    expect(restored.getCity(city.id)?.getBuildings()).toContain(CityBuildingType.FARMS);
    expect(restored.getCity(city.id)?.getBuildingLevel(CityBuildingType.WALLS)).toBe(3);
    expect(restored.getCity(city.id)?.getHealth()).toBe(150);
    expect(restored.getUnit(unit.id)?.getHealth()).toBe(60);
    expect(restored.getUnit(unit.id)?.getHomeCityId()).toBe(city.id);
    expect(restored.getUnit(unit.id)?.getPreferredTargetId()).toBe('unit-b');
    expect(restored.getUnit(unit.id)?.getUnitSerial()).toBe(144);
    expect(restored.getGrid().getTerritory({ row: 2, col: 2 })?.getBuildingLevel(TerritoryBuildingType.WALLS)).toBe(3);
    expect(restored.getGrid().getTerritory({ row: 2, col: 2 })?.getHealth()).toBe(90);
    expect(restored.getDiscoveredTiles(nationA.getId())).toEqual(new Set(['1,1', '2,2']));
    expect(restored.nextUnitSerial('INFANTRY')).toBe(103);
  });
});
