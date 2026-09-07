import { describe, it, expect } from '@jest/globals';
import { NoobProfile } from './NoobProfile';
import { AIController } from '../AIController';
import type { AIContext } from '../AITypes';
import { GameState } from '@/managers/GameState';
import { Nation } from '@/entities/nations/Nation';
import { Player } from '@/entities/players/Player';
import { City } from '@/entities/cities/City';
import { CommandProcessor } from '@/commands/CommandProcessor';
import { MovementSystem } from '@/systems/movement/MovementSystem';
import { Pathfinder } from '@/systems/pathfinding/Pathfinder';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { ResourceType } from '@/systems/resources/ResourceType';
import { CityBuildingType } from '@/systems/territory/CityBuilding';

describe('NoobProfile', () => {
  it('researches Masonry and builds a Barracks so it can eventually produce Infantry on an ordinary start', () => {
    const gameState = new GameState({ rows: 5, cols: 5 });
    const movementSystem = new MovementSystem();
    const eventBus = new GameEventBus();
    const commandProcessor = new CommandProcessor(gameState, movementSystem, eventBus);
    const pathfinder = new Pathfinder(gameState.getGrid());

    const nation = new Nation('nation-a', 'A', '#f00', true);
    gameState.addNation(nation);
    const player = new Player('player-a', 'AI', 'nation-a', false);
    nation.setControlledBy('player-a');
    gameState.addPlayer(player);

    // Starts with only CITY_HALL — no Barracks, no Masonry, matching a fresh
    // skirmish/scenario boot most of the time (masonry is only a ~20% random
    // starting tech).
    const city = new City('city-a', 'Alpha', 'nation-a', { row: 2, col: 2 });
    gameState.addCity(city);

    // Enough resources to afford Masonry, a Barracks, and an Infantry without
    // the test needing to also simulate passive income.
    nation.getTreasury().addResource(ResourceType.RESEARCH, 100);
    nation.getTreasury().addResource(ResourceType.GOLD, 200);
    nation.getTreasury().addResource(ResourceType.RAW_MATERIAL, 500);
    nation.getTreasury().addResource(ResourceType.FOOD, 500);

    const profile = new NoobProfile();
    const controller = new AIController(profile);

    let tick = 0;
    const ctxAt = (t: number): AIContext => ({
      nationId: 'nation-a', playerId: 'player-a', gameState, commandProcessor,
      movementSystem, pathfinder, currentTick: t,
    });

    for (let i = 0; i < 40 && !city.hasBuilding(CityBuildingType.BARRACKS); i++) {
      tick += profile.tickInterval;
      controller.tick(ctxAt(tick));
      // Instantly finish whatever research the AI just started so the test
      // doesn't need to simulate hundreds of ticks of passive research income.
      if (nation.getCurrentResearch()) nation.tickResearch(999999);
      // Instantly finish whatever the city is building, mirroring
      // ProductionSystem.tick()'s completion path.
      if (city.getCurrentOrder()) {
        const order = city.getCurrentOrder()!;
        order.ticksRemaining = 0;
        if (city.tickProduction() && order.kind === 'building') {
          city.completeCurrentOrder();
          city.addBuilding(order.buildingType);
        }
      }
    }

    expect(nation.hasResearched('masonry')).toBe(true);
    expect(city.hasBuilding(CityBuildingType.BARRACKS)).toBe(true);

    // Now that the prerequisite exists, the profile's production goal must
    // actually be feasible (this is the defect: previously it never was).
    const goals = profile.generateGoals(ctxAt(tick));
    const produceGoal = goals.find(g => g.id === 'produce-unit');
    expect(produceGoal?.isFeasible(ctxAt(tick))).toBe(true);
  });
});
