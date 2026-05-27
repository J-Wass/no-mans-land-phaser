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
      // OUTPOST costs GOLD:15, RAW_MATERIAL:30, FOOD:10 and now builds over time.
      nation.getTreasury().addResource(ResourceType.GOLD, 30);
      nation.getTreasury().addResource(ResourceType.RAW_MATERIAL, 60);
      nation.getTreasury().addResource(ResourceType.FOOD, 20);
      // Pre-own an adjacent tile so the adjacency check passes.
      gameState.getGrid().getTerritory({ row: 0, col: 1 })?.setControllingNation('nation-1');
    });

    it('starts outpost construction without requiring a friendly unit on the tile', () => {
      unit.moveTo({ row: 1, col: 0 });

      const result = processor.dispatch({
        type: 'BUILD_TERRITORY',
        playerId: 'player-1',
        position: { row: 0, col: 0 },
        building: TerritoryBuildingType.OUTPOST,
        issuedAtTick: 1,
      });

      expect(result.success).toBe(true);
      const territory = gameState.getGrid().getTerritory({ row: 0, col: 0 });
      expect(territory?.getControllingNation()).toBeNull();
      expect(territory?.hasBuilding(TerritoryBuildingType.OUTPOST)).toBe(false);
      expect(territory?.getCurrentConstruction()?.building).toBe(TerritoryBuildingType.OUTPOST);
    });

    it('consumes resources on success', () => {
      processor.dispatch({
        type: 'BUILD_TERRITORY',
        playerId: 'player-1',
        position: { row: 0, col: 0 },
        building: TerritoryBuildingType.OUTPOST,
        issuedAtTick: 1,
      });

      expect(nation.getTreasury().getAmount(ResourceType.GOLD)).toBe(15);
      expect(nation.getTreasury().getAmount(ResourceType.RAW_MATERIAL)).toBe(30);
      expect(nation.getTreasury().getAmount(ResourceType.FOOD)).toBe(10);
    });

    it('rejects when the tile is not adjacent to owned territory', () => {
      const result = processor.dispatch({
        type: 'BUILD_TERRITORY',
        playerId: 'player-1',
        position: { row: 4, col: 4 },
        building: TerritoryBuildingType.OUTPOST,
        issuedAtTick: 1,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toMatch(/adjacent/i);
    });

    it('rejects when territory is already claimed', () => {
      gameState.getGrid().getTerritory({ row: 0, col: 0 })?.setControllingNation('nation-1');

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
      nation.getTreasury().consumeResources({
        [ResourceType.GOLD]: 30,
        [ResourceType.RAW_MATERIAL]: 60,
        [ResourceType.FOOD]: 20,
      });

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

    it('emits territory:building-started event on success', () => {
      const events: unknown[] = [];
      eventBus.on('territory:building-started', e => events.push(e));

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

  describe('research queue commands', () => {
    it('queues missing prerequisites before an advanced technology', () => {
      const result = processor.dispatch({
        type: 'QUEUE_RESEARCH',
        playerId: 'player-1',
        techId: 'iron_working',
        issuedAtTick: 1,
      });

      expect(result.success).toBe(true);
      expect(nation.getResearchQueue()).toEqual([
        'scientific_method',
        'chemistry',
        'mathematics',
        'physics',
        'iron_working',
      ]);
    });

    it('does not duplicate researched, active, or already queued prerequisites', () => {
      nation.setResearchedTechs(['scientific_method']);
      nation.startResearch('mathematics', 10);
      nation.queueResearch('chemistry');

      const result = processor.dispatch({
        type: 'QUEUE_RESEARCH',
        playerId: 'player-1',
        techId: 'iron_working',
        issuedAtTick: 1,
      });

      expect(result.success).toBe(true);
      expect(nation.getResearchQueue()).toEqual(['chemistry', 'physics', 'iron_working']);
    });

    it('queues, reorders, and removes technologies', () => {
      const updates: unknown[] = [];
      eventBus.on('nation:research-queue-updated', e => updates.push(e));

      expect(processor.dispatch({
        type: 'QUEUE_RESEARCH',
        playerId: 'player-1',
        techId: 'writing',
        issuedAtTick: 1,
      }).success).toBe(true);
      expect(processor.dispatch({
        type: 'QUEUE_RESEARCH',
        playerId: 'player-1',
        techId: 'masonry',
        issuedAtTick: 2,
      }).success).toBe(true);
      expect(nation.getResearchQueue()).toEqual(['writing', 'masonry']);

      expect(processor.dispatch({
        type: 'MOVE_QUEUED_RESEARCH',
        playerId: 'player-1',
        techId: 'masonry',
        direction: 'up',
        issuedAtTick: 3,
      }).success).toBe(true);
      expect(nation.getResearchQueue()).toEqual(['masonry', 'writing']);

      expect(processor.dispatch({
        type: 'REMOVE_QUEUED_RESEARCH',
        playerId: 'player-1',
        techId: 'masonry',
        issuedAtTick: 4,
      }).success).toBe(true);
      expect(nation.getResearchQueue()).toEqual(['writing']);
      expect(updates).toHaveLength(4);
    });
  });

  describe('START_CITY_PRODUCTION', () => {
    let city: City;

    beforeEach(() => {
      city = new City('city-1', 'Rome City', 'nation-1', { row: 2, col: 2 });
      city.addBuilding(CityBuildingType.BARRACKS); // Infantry requires BARRACKS
      gameState.addCity(city);
      // Infantry costs GOLD:30, FOOD:400, RAW_MATERIAL:300. Grant enough to fill the queue.
      nation.getTreasury().addResource(ResourceType.GOLD, 1000);
      nation.getTreasury().addResource(ResourceType.FOOD, 5000);
      nation.getTreasury().addResource(ResourceType.RAW_MATERIAL, 5000);
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

    it('queues additional orders behind the active one until the queue is full', () => {
      // 1 active order + CITY_QUEUE_MAX (5) queued = 6 accepted, the 7th is rejected.
      for (let i = 0; i < 6; i++) {
        const r = processor.dispatch({
          type: 'START_CITY_PRODUCTION',
          playerId: 'player-1',
          cityId: 'city-1',
          unitType: UnitType.INFANTRY,
          issuedAtTick: i + 1,
        });
        expect(r.success).toBe(true);
      }

      const overflow = processor.dispatch({
        type: 'START_CITY_PRODUCTION',
        playerId: 'player-1',
        cityId: 'city-1',
        unitType: UnitType.INFANTRY,
        issuedAtTick: 7,
      });

      expect(overflow.success).toBe(false);
      expect(overflow.reason).toMatch(/full/i);
    });

    it('rejects when nation cannot afford the unit', () => {
      nation.getTreasury().consumeResources({
        [ResourceType.GOLD]: 1000,
        [ResourceType.FOOD]: 5000,
        [ResourceType.RAW_MATERIAL]: 5000,
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

  describe('CANCEL_CITY_PRODUCTION', () => {
    let city: City;

    beforeEach(() => {
      city = new City('city-1', 'Rome City', 'nation-1', { row: 2, col: 2 });
      city.addBuilding(CityBuildingType.BARRACKS);
      gameState.addCity(city);
      nation.getTreasury().addResource(ResourceType.GOLD, 1000);
      nation.getTreasury().addResource(ResourceType.FOOD, 5000);
      nation.getTreasury().addResource(ResourceType.RAW_MATERIAL, 5000);
      // One active order + one queued order.
      for (let i = 0; i < 2; i++) {
        processor.dispatch({
          type: 'START_CITY_PRODUCTION', playerId: 'player-1', cityId: 'city-1',
          unitType: UnitType.INFANTRY, issuedAtTick: i + 1,
        });
      }
    });

    it('cancels the active order when no queue index is given', () => {
      expect(city.getCurrentOrder()).not.toBeNull();
      const result = processor.dispatch({
        type: 'CANCEL_CITY_PRODUCTION', playerId: 'player-1', cityId: 'city-1', issuedAtTick: 3,
      });
      expect(result.success).toBe(true);
      expect(city.getCurrentOrder()).toBeNull();
    });

    it('cancels a specific queued item by index', () => {
      expect(city.getQueue()).toHaveLength(1);
      const result = processor.dispatch({
        type: 'CANCEL_CITY_PRODUCTION', playerId: 'player-1', cityId: 'city-1',
        queueIndex: 0, issuedAtTick: 3,
      });
      expect(result.success).toBe(true);
      expect(city.getQueue()).toHaveLength(0);
    });

    it('rejects an out-of-range queue index', () => {
      const result = processor.dispatch({
        type: 'CANCEL_CITY_PRODUCTION', playerId: 'player-1', cityId: 'city-1',
        queueIndex: 99, issuedAtTick: 3,
      });
      expect(result.success).toBe(false);
    });

    it('rejects cancelling production in a city the player does not own', () => {
      const other = new City('city-2', 'Foe', 'nation-2', { row: 4, col: 4 });
      gameState.addCity(other);
      const result = processor.dispatch({
        type: 'CANCEL_CITY_PRODUCTION', playerId: 'player-1', cityId: 'city-2', issuedAtTick: 3,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('BUILD_CITY_BUILDING wall upgrades', () => {
    let city: City;

    beforeEach(() => {
      city = new City('city-walls', 'Fort', 'nation-1', { row: 2, col: 2 });
      city.addBuilding(CityBuildingType.WALLS);
      gameState.addCity(city);
      nation.setResearchedTechs(['masonry']);
      nation.getTreasury().addResource(ResourceType.GOLD, 100);
      nation.getTreasury().addResource(ResourceType.RAW_MATERIAL, 100);
    });

    it('queues a wall upgrade when walls are already built below max level', () => {
      const result = processor.dispatch({
        type: 'BUILD_CITY_BUILDING',
        playerId: 'player-1',
        cityId: city.id,
        building: CityBuildingType.WALLS,
        issuedAtTick: 1,
      });

      expect(result.success).toBe(true);
      expect(city.getCurrentOrder()?.label).toBe('Walls Lvl 2');
      expect(nation.getTreasury().getAmount(ResourceType.GOLD)).toBe(85);
      expect(nation.getTreasury().getAmount(ResourceType.RAW_MATERIAL)).toBe(65);
    });

    it('rejects wall upgrades at maximum level', () => {
      city.setBuildingLevel(CityBuildingType.WALLS, 5);

      const result = processor.dispatch({
        type: 'BUILD_CITY_BUILDING',
        playerId: 'player-1',
        cityId: city.id,
        building: CityBuildingType.WALLS,
        issuedAtTick: 1,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toMatch(/already at max level/i);
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
