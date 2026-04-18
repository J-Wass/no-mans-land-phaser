import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BattleSystem, BATTLE_ROUND_TICKS, MAX_BATTLE_ROUNDS } from './BattleSystem';
import { CitySiegeSystem } from './CitySiegeSystem';
import { GameState } from '@/managers/GameState';
import { MovementSystem } from '@/systems/movement/MovementSystem';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { Infantry } from '@/entities/units/Infantry';
import { Cavalry } from '@/entities/units/Cavalry';
import { HeavyInfantry } from '@/entities/units/HeavyInfantry';
import { Crossbowman } from '@/entities/units/Crossbowman';

describe('BattleSystem', () => {
  let gameState: GameState;
  let movementSystem: MovementSystem;
  let eventBus: GameEventBus;
  let battleSystem: BattleSystem;

  beforeEach(() => {
    gameState = new GameState({ rows: 6, cols: 6 });
    movementSystem = new MovementSystem();
    eventBus = new GameEventBus();
    battleSystem = new BattleSystem(() => 0.5);
  });

  function tickRounds(rounds: number, startTick = 0): number {
    let tick = startTick;
    for (let i = 0; i < rounds * BATTLE_ROUND_TICKS; i++) {
      tick++;
      battleSystem.tick(gameState, movementSystem, eventBus, tick);
    }
    return tick;
  }

  it('starts a battle when a moving unit enters an enemy tile', () => {
    const attacker = new Infantry('unit-a', 'nation-a', { row: 0, col: 0 });
    const defender = new Infantry('unit-d', 'nation-b', { row: 0, col: 1 });
    gameState.addUnit(attacker);
    gameState.addUnit(defender);

    const handler = jest.fn();
    eventBus.on('battle:started', handler);

    movementSystem.issueOrder(attacker, [{ row: 0, col: 1 }]);
    for (let tick = 1; tick <= 5; tick++) {
      movementSystem.tickWithBattles(gameState, eventBus, tick, battleSystem, new CitySiegeSystem(), { startBattle: () => null, tick: () => {}, getBattleAt: () => null, getAllBattles: () => [] } as never);
    }

    expect(handler).toHaveBeenCalledTimes(1);
    expect(attacker.isEngagedInBattle()).toBe(true);
    expect(defender.isEngagedInBattle()).toBe(true);
    expect(battleSystem.getBattleForUnit(attacker.id)).not.toBeNull();
  });

  it('resolves a battle within the configured maximum round window', () => {
    const unitA = new Infantry('unit-a', 'nation-a', { row: 2, col: 2 });
    const unitB = new Infantry('unit-b', 'nation-b', { row: 2, col: 2 });
    gameState.addUnit(unitA);
    gameState.addUnit(unitB);

    battleSystem.startBattle(unitA, unitB, { row: 2, col: 1 }, { row: 2, col: 2 }, 0, movementSystem, eventBus);
    tickRounds(MAX_BATTLE_ROUNDS);

    expect(battleSystem.getBattleForUnit(unitA.id)).toBeNull();
    expect(unitA.isEngagedInBattle()).toBe(false);
    expect(unitB.isEngagedInBattle()).toBe(false);
  });

  it('gives cavalry a meaningful charge advantage', () => {
    const chargingCavalry = new Cavalry('cav-charge', 'nation-a', { row: 2, col: 2 });
    const defendingInfantry = new Infantry('inf-def', 'nation-b', { row: 2, col: 2 });
    chargingCavalry.setBattleOrder('CHARGE');
    defendingInfantry.setBattleOrder('ADVANCE');
    gameState.addUnit(chargingCavalry);
    gameState.addUnit(defendingInfantry);

    battleSystem.startBattle(chargingCavalry, defendingInfantry, { row: 2, col: 1 }, { row: 2, col: 2 }, 0, movementSystem, eventBus);
    tickRounds(1);
    const chargedHealth = defendingInfantry.getHealth();

    const controlState = new GameState({ rows: 6, cols: 6 });
    const controlMovement = new MovementSystem();
    const controlEvents = new GameEventBus();
    const controlBattleSystem = new BattleSystem(() => 0.5);
    const normalCavalry = new Cavalry('cav-adv', 'nation-a', { row: 2, col: 2 });
    const normalInfantry = new Infantry('inf-adv', 'nation-b', { row: 2, col: 2 });
    normalCavalry.setBattleOrder('ADVANCE');
    normalInfantry.setBattleOrder('ADVANCE');
    controlState.addUnit(normalCavalry);
    controlState.addUnit(normalInfantry);
    controlBattleSystem.startBattle(normalCavalry, normalInfantry, { row: 2, col: 1 }, { row: 2, col: 2 }, 0, controlMovement, controlEvents);
    for (let tick = 1; tick <= BATTLE_ROUND_TICKS; tick++) {
      controlBattleSystem.tick(controlState, controlMovement, controlEvents, tick);
    }

    expect(chargedHealth).toBeLessThan(normalInfantry.getHealth());
  });

  it('rewards heavy infantry for holding and crossbowmen for falling back', () => {
    const heavy = new HeavyInfantry('heavy', 'nation-a', { row: 3, col: 3 });
    const cavalry = new Cavalry('cav', 'nation-b', { row: 3, col: 3 });
    heavy.setBattleOrder('HOLD');
    cavalry.setBattleOrder('CHARGE');
    gameState.addUnit(heavy);
    gameState.addUnit(cavalry);
    battleSystem.startBattle(heavy, cavalry, { row: 3, col: 2 }, { row: 3, col: 3 }, 0, movementSystem, eventBus);
    tickRounds(1);
    const heavyHoldHealth = heavy.getHealth();

    const skirmishState = new GameState({ rows: 6, cols: 6 });
    const skirmishMovement = new MovementSystem();
    const skirmishEvents = new GameEventBus();
    const skirmishBattle = new BattleSystem(() => 0.5);
    const crossbow = new Crossbowman('xbow', 'nation-a', { row: 1, col: 1 });
    const infantry = new Infantry('inf', 'nation-b', { row: 1, col: 1 });
    crossbow.setBattleOrder('FALL_BACK');
    infantry.setBattleOrder('ADVANCE');
    skirmishState.addUnit(crossbow);
    skirmishState.addUnit(infantry);
    skirmishBattle.startBattle(crossbow, infantry, { row: 1, col: 0 }, { row: 1, col: 1 }, 0, skirmishMovement, skirmishEvents);
    for (let tick = 1; tick <= BATTLE_ROUND_TICKS; tick++) {
      skirmishBattle.tick(skirmishState, skirmishMovement, skirmishEvents, tick);
    }

    expect(heavyHoldHealth).toBeGreaterThan(180);
    expect(infantry.getHealth()).toBeLessThan(100);
    expect(crossbow.getHealth()).toBeGreaterThan(100);
  });
});
