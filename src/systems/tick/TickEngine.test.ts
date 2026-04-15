import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TickEngine } from './TickEngine';
import { GameState } from '@/managers/GameState';
import { MovementSystem } from '@/systems/movement/MovementSystem';
import { GameEventBus } from '@/systems/events/GameEventBus';

describe('TickEngine', () => {
  let gameState: GameState;
  let movementSystem: MovementSystem;
  let eventBus: GameEventBus;
  let tickEngine: TickEngine;

  beforeEach(() => {
    gameState = new GameState({ rows: 5, cols: 5 });
    movementSystem = new MovementSystem();
    eventBus = new GameEventBus();
    tickEngine = new TickEngine(gameState, movementSystem, eventBus);
  });

  it('starts at tick 0', () => {
    expect(tickEngine.getCurrentTick()).toBe(0);
  });

  it('increments tick on each advance', () => {
    expect(tickEngine.advance()).toBe(1);
    expect(tickEngine.advance()).toBe(2);
    expect(tickEngine.advance()).toBe(3);
    expect(tickEngine.getCurrentTick()).toBe(3);
  });

  it('calls movementSystem.tick on each advance', () => {
    const spy = jest.spyOn(movementSystem, 'tickWithBattles');
    tickEngine.advance();
    tickEngine.advance();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('passes correct tick number to movementSystem.tick', () => {
    const spy = jest.spyOn(movementSystem, 'tickWithBattles');
    tickEngine.advance(); // tick 1
    expect(spy).toHaveBeenLastCalledWith(gameState, eventBus, 1, expect.anything(), expect.anything());
    tickEngine.advance(); // tick 2
    expect(spy).toHaveBeenLastCalledWith(gameState, eventBus, 2, expect.anything(), expect.anything());
  });

  it('resets tick counter', () => {
    tickEngine.advance();
    tickEngine.advance();
    tickEngine.reset();
    expect(tickEngine.getCurrentTick()).toBe(0);
  });
});
