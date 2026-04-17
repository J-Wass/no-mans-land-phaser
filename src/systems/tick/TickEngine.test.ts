import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TickEngine } from './TickEngine';
import { GameState } from '@/managers/GameState';
import { MovementSystem } from '@/systems/movement/MovementSystem';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { Nation } from '@/entities/nations/Nation';
import { City } from '@/entities/cities/City';
import { Infantry } from '@/entities/units/Infantry';
import { TICK_RATE } from '@/config/constants';

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

  it('emits game:tick event on each advance', () => {
    const ticks: number[] = [];
    eventBus.on('game:tick', ({ tick }: { tick: number }) => ticks.push(tick));
    tickEngine.advance();
    tickEngine.advance();
    tickEngine.advance();
    expect(ticks).toEqual([1, 2, 3]);
  });

  it('heals damaged units inside a friendly city every TICK_RATE ticks', () => {
    const nation = new Nation('nation-1', 'Rome', '#FF0000');
    gameState.addNation(nation);

    const city = new City('city-1', 'Rome City', 'nation-1', { row: 0, col: 0 });
    gameState.addCity(city); // also sets territory.cityId and controllingNation

    const unit = new Infantry('unit-1', 'nation-1', { row: 0, col: 0 });
    unit.takeDamage(40); // bring down to 60 HP
    gameState.addUnit(unit);

    // Advance TICK_RATE ticks to trigger the heal pulse
    for (let i = 0; i < TICK_RATE; i++) tickEngine.advance();

    // 5% of 100 maxHP = 5; ceil(5) = 5; 60 + 5 = 65
    expect(unit.getHealth()).toBeGreaterThan(60);
  });

  it('does not heal units that are engaged in battle', () => {
    const nation = new Nation('nation-1', 'Rome', '#FF0000');
    gameState.addNation(nation);

    const city = new City('city-1', 'Rome City', 'nation-1', { row: 0, col: 0 });
    gameState.addCity(city);

    const unit = new Infantry('unit-1', 'nation-1', { row: 0, col: 0 });
    unit.takeDamage(40);
    unit.setEngagedInBattle(true);
    gameState.addUnit(unit);

    for (let i = 0; i < TICK_RATE; i++) tickEngine.advance();

    expect(unit.getHealth()).toBe(60);
  });
});
