import { describe, it, expect, beforeEach } from '@jest/globals';
import { CommandProcessor } from './CommandProcessor';
import { GameState } from '@/managers/GameState';
import { MovementSystem } from '@/systems/movement/MovementSystem';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { Nation } from '@/entities/nations/Nation';
import { Player } from '@/entities/players/Player';
import { Infantry } from '@/entities/units/Infantry';
import { City } from '@/entities/cities/City';
import { ResourceType } from '@/systems/resources/ResourceType';
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import { CityBuildingType } from '@/systems/territory/CityBuilding';
import { UnitType } from '@/entities/units/Unit';

describe('CommandProcessor', () => {
  let gameState: GameState;
  let movementSystem: MovementSystem;
  let eventBus: GameEventBus;
  let processor: CommandProcessor;
  let nation: Nation;
  let player: Player;
  let unit: Infantry;

  beforeEach(() => {
    gameState = new GameState({ rows: 5, cols: 5 });
    movementSystem = new MovementSystem();
    eventBus = new GameEventBus();
    processor = new CommandProcessor(gameState, movementSystem, eventBus);

    nation = new Nation('nation-1', 'Rome', '#FF0000');
    gameState.addNation(nation);

    player = new Player('player-1', 'Player One', 'nation-1', true);
    nation.setControlledBy('player-1');
    gameState.addPlayer(player);

    unit = new Infantry('unit-1', 'nation-1', { row: 0, col: 0 });
    gameState.addUnit(unit);
  });

  it('dispatches a valid MOVE_UNIT command successfully', () => {
    const result = processor.dispatch({
      type: 'MOVE_UNIT',
      playerId: 'player-1',
      unitId: 'unit-1',
      path: [{ row: 0, col: 1 }],
      issuedAtTick: 1,
    });

    expect(result.success).toBe(true);
    expect(movementSystem.isMoving('unit-1')).toBe(true);
  });

  it('rejects command when player not found', () => {
    const result = processor.dispatch({
      type: 'MOVE_UNIT',
      playerId: 'nonexistent-player',
      unitId: 'unit-1',
      path: [{ row: 0, col: 1 }],
      issuedAtTick: 1,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/player not found/i);
  });

  it('rejects command when unit not found', () => {
    const result = processor.dispatch({
      type: 'MOVE_UNIT',
      playerId: 'player-1',
      unitId: 'nonexistent-unit',
      path: [{ row: 0, col: 1 }],
      issuedAtTick: 1,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/unit not found/i);
  });

  it('rejects command when player does not own the unit', () => {
    // Create a second nation/player that doesn't own unit-1
    const nation2 = new Nation('nation-2', 'Persia', '#0000FF');
    gameState.addNation(nation2);
    const player2 = new Player('player-2', 'Player Two', 'nation-2', false);
    nation2.setControlledBy('player-2');
    gameState.addPlayer(player2);

    const result = processor.dispatch({
      type: 'MOVE_UNIT',
      playerId: 'player-2',
      unitId: 'unit-1', // owned by nation-1, not nation-2
      path: [{ row: 0, col: 1 }],
      issuedAtTick: 1,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/does not belong/i);
  });

  it('rejects command with empty path', () => {
    const result = processor.dispatch({
      type: 'MOVE_UNIT',
      playerId: 'player-1',
      unitId: 'unit-1',
      path: [],
      issuedAtTick: 1,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/path is empty/i);
  });

  it('rejects command for a dead unit', () => {
    unit.takeDamage(100);

    const result = processor.dispatch({
      type: 'MOVE_UNIT',
      playerId: 'player-1',
      unitId: 'unit-1',
      path: [{ row: 0, col: 1 }],
      issuedAtTick: 1,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/dead/i);
  });

  it('rejects move commands for units already engaged in battle', () => {
    unit.setEngagedInBattle(true);

    const result = processor.dispatch({
      type: 'MOVE_UNIT',
      playerId: 'player-1',
      unitId: 'unit-1',
      path: [{ row: 0, col: 1 }],
      issuedAtTick: 1,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/engaged in battle/i);
  });

  it('emits unit:move-ordered event on success', () => {
    const events: unknown[] = [];
    eventBus.on('unit:move-ordered', e => events.push(e));

    processor.dispatch({
      type: 'MOVE_UNIT',
      playerId: 'player-1',
      unitId: 'unit-1',
      path: [{ row: 0, col: 1 }],
      issuedAtTick: 1,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ unitId: 'unit-1', playerId: 'player-1' });
  });

  it('updates a unit battle order through the command processor', () => {
    const result = processor.dispatch({
      type: 'SET_UNIT_BATTLE_ORDER',
      playerId: 'player-1',
      unitId: 'unit-1',
      battleOrder: 'ADVANCE',
      issuedAtTick: 3,
    });

    expect(result.success).toBe(true);
    expect(unit.getBattleOrder()).toBe('ADVANCE');
  });

  describe('BUILD_TERRITORY (OUTPOST)', () => {
    beforeEach(() => {
      // OUTPOST costs GOLD:5, RAW_MATERIAL:10, FOOD:5
      nation.getTreasury().addResource(ResourceType.GOLD, 10);
      nation.getTreasury().addResource(ResourceType.RAW_MATERIAL, 20);
      nation.getTreasury().addResource(ResourceType.FOOD, 10);
      // unit-1 is already at (0,0) from the outer beforeEach
    });

    it('claims unclaimed territory when a friendly unit is present', () => {
      const result = processor.dispatch({
        type: 'BUILD_TERRITORY',
        playerId: 'player-1',
        position: { row: 0, col: 0 },
        building: TerritoryBuildingType.OUTPOST,
        issuedAtTick: 1,
      });

      expect(result.success).toBe(true);
      const territory = gameState.getGrid().getTerritory({ row: 0, col: 0 });
      expect(territory?.getControllingNation()).toBe('nation-1');
      expect(territory?.hasBuilding(TerritoryBuildingType.OUTPOST)).toBe(true);
    });

    it('consumes resources on success', () => {
      processor.dispatch({
        type: 'BUILD_TERRITORY',
        playerId: 'player-1',
        position: { row: 0, col: 0 },
        building: TerritoryBuildingType.OUTPOST,
        issuedAtTick: 1,
      });

      expect(nation.getTreasury().getAmount(ResourceType.RAW_MATERIAL)).toBe(10);
      expect(nation.getTreasury().getAmount(ResourceType.FOOD)).toBe(5);
    });

    it('rejects when no friendly unit is on the tile', () => {
      // Move the unit off the tile
      unit.moveTo({ row: 1, col: 0 });

      const result = processor.dispatch({
        type: 'BUILD_TERRITORY',
        playerId: 'player-1',
        position: { row: 0, col: 0 },
        building: TerritoryBuildingType.OUTPOST,
        issuedAtTick: 1,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toMatch(/no friendly unit/i);
    });

    it('rejects when territory is already claimed', () => {
      // Claim the tile first
      processor.dispatch({
        type: 'BUILD_TERRITORY',
        playerId: 'player-1',
        position: { row: 0, col: 0 },
        building: TerritoryBuildingType.OUTPOST,
        issuedAtTick: 1,
      });

      const result = processor.dispatch({
        type: 'BUILD_TERRITORY',
        playerId: 'player-1',
        position: { row: 0, col: 0 },
        building: TerritoryBuildingType.OUTPOST,
        issuedAtTick: 2,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toMatch(/already claimed/i);
    });

    it('rejects when nation cannot afford the cost', () => {
      nation.getTreasury().consumeResources({ [ResourceType.RAW_MATERIAL]: 20, [ResourceType.FOOD]: 10 });

      const result = processor.dispatch({
        type: 'BUILD_TERRITORY',
        playerId: 'player-1',
        position: { row: 0, col: 0 },
        building: TerritoryBuildingType.OUTPOST,
        issuedAtTick: 1,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toMatch(/insufficient/i);
    });

    it('emits territory:claimed event on success', () => {
      const events: unknown[] = [];
      eventBus.on('territory:claimed', e => events.push(e));

      processor.dispatch({
        type: 'BUILD_TERRITORY',
        playerId: 'player-1',
        position: { row: 0, col: 0 },
        building: TerritoryBuildingType.OUTPOST,
        issuedAtTick: 1,
      });

      expect(events).toHaveLength(1);
    });
  });

  describe('START_RESEARCH', () => {
    beforeEach(() => {
      nation.getTreasury().addResource(ResourceType.RESEARCH, 100);
    });

    it('starts research on a root tech', () => {
      const result = processor.dispatch({
        type: 'START_RESEARCH',
        playerId: 'player-1',
        techId: 'masonry',
        issuedAtTick: 1,
      });

      expect(result.success).toBe(true);
      expect(nation.getCurrentResearch()?.techId).toBe('masonry');
    });

    it('rejects when already researching', () => {
      processor.dispatch({
        type: 'START_RESEARCH',
        playerId: 'player-1',
        techId: 'masonry',
        issuedAtTick: 1,
      });

      const result = processor.dispatch({
        type: 'START_RESEARCH',
        playerId: 'player-1',
        techId: 'writing',
        issuedAtTick: 2,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toMatch(/already researching/i);
    });

    it('rejects when prerequisites are not met', () => {
      // 'trade' requires 'writing'
      const result = processor.dispatch({
        type: 'START_RESEARCH',
        playerId: 'player-1',
        techId: 'trade',
        issuedAtTick: 1,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toMatch(/prerequisites/i);
    });

    it('rejects an unknown tech id', () => {
      const result = processor.dispatch({
        type: 'START_RESEARCH',
        playerId: 'player-1',
        techId: 'NONEXISTENT_TECH' as never,
        issuedAtTick: 1,
      });

      expect(result.success).toBe(false);
    });

    it('emits nation:research-started event', () => {
      const events: unknown[] = [];
      eventBus.on('nation:research-started', e => events.push(e));

      processor.dispatch({
        type: 'START_RESEARCH',
        playerId: 'player-1',
        techId: 'masonry',
        issuedAtTick: 1,
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ nationId: 'nation-1', techId: 'masonry' });
    });
  });

  describe('START_CITY_PRODUCTION', () => {
    let city: City;

    beforeEach(() => {
      city = new City('city-1', 'Rome City', 'nation-1', { row: 2, col: 2 });
      city.addBuilding(CityBuildingType.BARRACKS); // Infantry requires BARRACKS
      gameState.addCity(city);
      // Infantry costs GOLD:5, FOOD:20, RAW_MATERIAL:10
      nation.getTreasury().addResource(ResourceType.GOLD, 20);
      nation.getTreasury().addResource(ResourceType.FOOD, 50);
      nation.getTreasury().addResource(ResourceType.RAW_MATERIAL, 30);
    });

    it('queues infantry production when city has a barracks', () => {
      const result = processor.dispatch({
        type: 'START_CITY_PRODUCTION',
        playerId: 'player-1',
        cityId: 'city-1',
        unitType: UnitType.INFANTRY,
        issuedAtTick: 1,
      });

      expect(result.success).toBe(true);
      expect(city.getCurrentOrder()).not.toBeNull();
    });

    it('rejects when city production queue is busy', () => {
      processor.dispatch({
        type: 'START_CITY_PRODUCTION',
        playerId: 'player-1',
        cityId: 'city-1',
        unitType: UnitType.INFANTRY,
        issuedAtTick: 1,
      });

      const result = processor.dispatch({
        type: 'START_CITY_PRODUCTION',
        playerId: 'player-1',
        cityId: 'city-1',
        unitType: UnitType.INFANTRY,
        issuedAtTick: 2,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toMatch(/busy/i);
    });

    it('rejects when nation cannot afford the unit', () => {
      nation.getTreasury().consumeResources({
        [ResourceType.GOLD]: 20,
        [ResourceType.FOOD]: 50,
        [ResourceType.RAW_MATERIAL]: 30,
      });

      const result = processor.dispatch({
        type: 'START_CITY_PRODUCTION',
        playerId: 'player-1',
        cityId: 'city-1',
        unitType: UnitType.INFANTRY,
        issuedAtTick: 1,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toMatch(/insufficient/i);
    });
  });

  describe('OFFER_TRADE', () => {
    let nation2: Nation;
    let player2: Player;

    beforeEach(() => {
      nation2 = new Nation('nation-2', 'Persia', '#0000FF');
      gameState.addNation(nation2);
      player2 = new Player('player-2', 'Player Two', 'nation-2', false);
      nation2.setControlledBy('player-2');
      gameState.addPlayer(player2);

      nation.getTreasury().addResource(ResourceType.GOLD, 100);
      nation2.getTreasury().addResource(ResourceType.FOOD, 100);
    });

    it('transfers resources between nations', () => {
      const result = processor.dispatch({
        type: 'OFFER_TRADE',
        playerId: 'player-1',
        targetNationId: 'nation-2',
        offer: { [ResourceType.GOLD]: 20 },
        request: { [ResourceType.FOOD]: 30 },
        issuedAtTick: 1,
      });

      expect(result.success).toBe(true);
      expect(nation.getTreasury().getAmount(ResourceType.GOLD)).toBe(80);
      expect(nation.getTreasury().getAmount(ResourceType.FOOD)).toBe(30);
      expect(nation2.getTreasury().getAmount(ResourceType.GOLD)).toBe(20);
      expect(nation2.getTreasury().getAmount(ResourceType.FOOD)).toBe(70);
    });

    it('rejects when offering nation lacks resources', () => {
      const result = processor.dispatch({
        type: 'OFFER_TRADE',
        playerId: 'player-1',
        targetNationId: 'nation-2',
        offer: { [ResourceType.GOLD]: 200 },
        request: {},
        issuedAtTick: 1,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toMatch(/insufficient/i);
    });

    it('rejects when target nation lacks requested resources', () => {
      const result = processor.dispatch({
        type: 'OFFER_TRADE',
        playerId: 'player-1',
        targetNationId: 'nation-2',
        offer: {},
        request: { [ResourceType.FOOD]: 200 },
        issuedAtTick: 1,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toMatch(/lacks/i);
    });
  });
});
