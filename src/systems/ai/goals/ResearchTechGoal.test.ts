import { describe, it, expect } from '@jest/globals';
import { ResearchTechGoal } from './ResearchTechGoal';
import type { AIContext } from '../AITypes';
import { GameState } from '@/managers/GameState';
import { Nation } from '@/entities/nations/Nation';
import { Player } from '@/entities/players/Player';
import { CommandProcessor } from '@/commands/CommandProcessor';
import { MovementSystem } from '@/systems/movement/MovementSystem';
import { Pathfinder } from '@/systems/pathfinding/Pathfinder';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { ResourceType } from '@/systems/resources/ResourceType';

describe('ResearchTechGoal', () => {
  function makeCtx(researchPoints: number): { ctx: AIContext; nation: Nation } {
    const gameState = new GameState({ rows: 4, cols: 4 });
    const movementSystem = new MovementSystem();
    const nation = new Nation('nation-a', 'A', '#f00', true);
    nation.setControlledBy('player-a');
    gameState.addNation(nation);
    gameState.addPlayer(new Player('player-a', 'AI', 'nation-a', false));
    nation.getTreasury().addResource(ResourceType.RESEARCH, researchPoints);
    const ctx: AIContext = {
      nationId: 'nation-a',
      playerId: 'player-a',
      gameState,
      commandProcessor: new CommandProcessor(gameState, movementSystem, new GameEventBus()),
      movementSystem,
      pathfinder: new Pathfinder(gameState.getGrid()),
      currentTick: 0,
    };
    return { ctx, nation };
  }

  it('is not feasible while the nation cannot afford any startable tech', () => {
    const { ctx } = makeCtx(24); // root techs cost 25 RP
    expect(new ResearchTechGoal().isFeasible(ctx)).toBe(false);
  });

  it('starts the first affordable tech on its list once it has the points', () => {
    const { ctx, nation } = makeCtx(25);
    const goal = new ResearchTechGoal(['masonry']);
    expect(goal.isFeasible(ctx)).toBe(true);
    goal.execute(ctx);
    expect(nation.getCurrentResearch()?.techId).toBe('masonry');
  });
});
