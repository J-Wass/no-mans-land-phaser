import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BattleSystem, UNIT_BATTLE_ROUND_TICKS } from './BattleSystem';
import { CitySiegeSystem } from './CitySiegeSystem';
import { GameState } from '@/managers/GameState';
import { MovementSystem } from '@/systems/movement/MovementSystem';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { Infantry } from '@/entities/units/Infantry';
import { Cavalry } from '@/entities/units/Cavalry';
import { HeavyInfantry } from '@/entities/units/HeavyInfantry';
import { Crossbowman } from '@/entities/units/Crossbowman';
import { Catapult } from '@/entities/units/Catapult';
import { Trebuchet } from '@/entities/units/Trebuchet';

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
    for (let i = 0; i < rounds * UNIT_BATTLE_ROUND_TICKS; i++) {
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
    for (let tick = 1; tick <= 25; tick++) {
      movementSystem.tickWithBattles(gameState, eventBus, tick, battleSystem, new CitySiegeSystem(), { startBattle: () => null, tick: () => {}, getBattleAt: () => null, getAllBattles: () => [] } as never);
    }

    expect(handler).toHaveBeenCalledTimes(1);
    expect(attacker.isEngagedInBattle()).toBe(true);
    expect(defender.isEngagedInBattle()).toBe(true);
    expect(battleSystem.getBattleForUnit(attacker.id)).not.toBeNull();
  });

  it('resolves a battle when one unit is eliminated', () => {
    const unitA = new Infantry('unit-a', 'nation-a', { row: 2, col: 2 });
    const unitB = new Infantry('unit-b', 'nation-b', { row: 2, col: 2 });
    unitA.setBattleOrder('ADVANCE');
    unitB.setBattleOrder('ADVANCE');
    gameState.addUnit(unitA);
    gameState.addUnit(unitB);

    battleSystem.startBattle(unitA, unitB, { row: 2, col: 1 }, { row: 2, col: 2 }, 0, movementSystem, eventBus);
    tickRounds(20);

    expect(battleSystem.getBattleForUnit(unitA.id)).toBeNull();
    expect(unitA.isEngagedInBattle() || unitB.isEngagedInBattle()).toBe(false);
  });

  it('gives cavalry a meaningful advance advantage', () => {
    const chargingCavalry = new Cavalry('cav-charge', 'nation-a', { row: 2, col: 2 });
    const defendingInfantry = new Infantry('inf-def', 'nation-b', { row: 2, col: 2 });
    chargingCavalry.setBattleOrder('ADVANCE');
    defendingInfantry.setBattleOrder('HOLD');
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
    normalCavalry.setBattleOrder('HOLD');
    normalInfantry.setBattleOrder('HOLD');
    controlState.addUnit(normalCavalry);
    controlState.addUnit(normalInfantry);
    controlBattleSystem.startBattle(normalCavalry, normalInfantry, { row: 2, col: 1 }, { row: 2, col: 2 }, 0, controlMovement, controlEvents);
    for (let tick = 1; tick <= UNIT_BATTLE_ROUND_TICKS; tick++) {
      controlBattleSystem.tick(controlState, controlMovement, controlEvents, tick);
    }

    expect(chargedHealth).toBeLessThan(normalInfantry.getHealth());
  });

  it('lets fallback units withdraw out of melee', () => {
    battleSystem = new BattleSystem(() => 0.05);
    const withdrawer = new Infantry('fallback', 'nation-a', { row: 3, col: 3 });
    const pursuer = new Infantry('pursuer', 'nation-b', { row: 3, col: 3 });
    withdrawer.setBattleOrder('WITHDRAW');
    pursuer.setBattleOrder('HOLD');
    gameState.addUnit(withdrawer);
    gameState.addUnit(pursuer);
    battleSystem.startBattle(withdrawer, pursuer, { row: 3, col: 1 }, { row: 3, col: 3 }, 0, movementSystem, eventBus);
    tickRounds(1);

    expect(battleSystem.getBattleForUnit(withdrawer.id)).toBeNull();
    expect(withdrawer.isEngagedInBattle()).toBe(false);
    expect(Math.abs(withdrawer.position.row - 3) + Math.abs(withdrawer.position.col - 3)).toBeGreaterThanOrEqual(2);
  });

  it('rewards heavy infantry for holding against cavalry', () => {
    const heavy = new HeavyInfantry('heavy', 'nation-a', { row: 3, col: 3 });
    const cavalry = new Cavalry('cav', 'nation-b', { row: 3, col: 3 });
    heavy.setBattleOrder('HOLD');
    cavalry.setBattleOrder('ADVANCE');
    gameState.addUnit(heavy);
    gameState.addUnit(cavalry);
    battleSystem.startBattle(heavy, cavalry, { row: 3, col: 2 }, { row: 3, col: 3 }, 0, movementSystem, eventBus);
    tickRounds(1);
    const heavyHoldHealth = heavy.getHealth();

    expect(heavyHoldHealth).toBeGreaterThan(170);
  });

  it('heavy infantry on HOLD beats charging cavalry to the death', () => {
    const heavy = new HeavyInfantry('heavy', 'nation-a', { row: 3, col: 3 });
    const cavalry = new Cavalry('cav', 'nation-b', { row: 3, col: 3 });
    heavy.setBattleOrder('HOLD');
    cavalry.setBattleOrder('ADVANCE');
    gameState.addUnit(heavy);
    gameState.addUnit(cavalry);
    battleSystem.startBattle(heavy, cavalry, { row: 3, col: 2 }, { row: 3, col: 3 }, 0, movementSystem, eventBus);

    // Run until the battle resolves (max ~15 rounds is plenty).
    tickRounds(15);

    expect(heavy.isAlive()).toBe(true);
    expect(cavalry.isAlive()).toBe(false);
  });

  it('cavalry beats a holding crossbowman (Crossbow no longer counters Cavalry)', () => {
    // Rock-paper-scissors: Cavalry beats every ranged unit, Crossbow included.
    // (Crossbow's old anti-cavalry bonuses were removed.)
    const crossbow = new Crossbowman('cross', 'nation-a', { row: 3, col: 3 });
    const cavalry = new Cavalry('cav', 'nation-b', { row: 3, col: 3 });
    crossbow.setBattleOrder('HOLD');
    cavalry.setBattleOrder('ADVANCE');
    gameState.addUnit(crossbow);
    gameState.addUnit(cavalry);
    battleSystem.startBattle(cavalry, crossbow, { row: 3, col: 2 }, { row: 3, col: 3 }, 0, movementSystem, eventBus);
    tickRounds(15);

    expect(crossbow.isAlive()).toBe(false);
    expect(cavalry.isAlive()).toBe(true);
    expect(cavalry.getHealth()).toBeGreaterThan(80); // decisive win, not a bloody trade
  });

  it('cavalry beats a trebuchet once it reaches melee (siege is helpless when pinned)', () => {
    // The Cavalry > Ranged leg: a siege unit caught in melee can only fire
    // point-blank and is near-helpless, so Cavalry that reaches it wins.
    const trebuchet = new Trebuchet('treb', 'nation-a', { row: 3, col: 3 });
    const cavalry = new Cavalry('cav', 'nation-b', { row: 3, col: 3 });
    trebuchet.setBattleOrder('HOLD');
    cavalry.setBattleOrder('ADVANCE');
    gameState.addUnit(trebuchet);
    gameState.addUnit(cavalry);
    // Start adjacent (no approach pre-damage) to isolate the melee outcome.
    battleSystem.startBattle(cavalry, trebuchet, { row: 3, col: 2 }, { row: 3, col: 3 }, 0, movementSystem, eventBus);
    tickRounds(15);

    expect(trebuchet.isAlive()).toBe(false);
    expect(cavalry.isAlive()).toBe(true);
  });

  it('cavalry beats a catapult in melee', () => {
    const catapult = new Catapult('cat', 'nation-a', { row: 3, col: 3 });
    const cavalry = new Cavalry('cav', 'nation-b', { row: 3, col: 3 });
    catapult.setBattleOrder('HOLD');
    cavalry.setBattleOrder('ADVANCE');
    gameState.addUnit(catapult);
    gameState.addUnit(cavalry);
    battleSystem.startBattle(cavalry, catapult, { row: 3, col: 2 }, { row: 3, col: 3 }, 0, movementSystem, eventBus);
    tickRounds(15);

    expect(catapult.isAlive()).toBe(false);
    expect(cavalry.isAlive()).toBe(true);
  });

  it('crossbowman beats one Infantry but is left weak enough for a second to finish it', () => {
    // The crossbow's -30% vs light armor means it still wins the 1v1, but the fight
    // drags out and leaves it badly bloodied — so a second cheap Infantry kills it.
    const crossbow = new Crossbowman('xbow', 'nation-a', { row: 3, col: 3 });
    const inf1 = new Infantry('inf1', 'nation-b', { row: 3, col: 3 });
    crossbow.setBattleOrder('HOLD');
    inf1.setBattleOrder('ADVANCE');
    gameState.addUnit(crossbow);
    gameState.addUnit(inf1);

    battleSystem.startBattle(inf1, crossbow, { row: 3, col: 2 }, { row: 3, col: 3 }, 0, movementSystem, eventBus);
    const afterFirst = tickRounds(30);

    expect(inf1.isAlive()).toBe(false);
    expect(crossbow.isAlive()).toBe(true);
    expect(crossbow.getHealth()).toBeLessThan(90); // bloodied (~half of its 150 HP), not unscathed

    // A second fresh Infantry then finishes the wounded crossbow.
    const inf2 = new Infantry('inf2', 'nation-b', { row: 3, col: 4 });
    inf2.setBattleOrder('ADVANCE');
    gameState.addUnit(inf2);
    const start = afterFirst + 25;
    battleSystem.startBattle(inf2, crossbow, { row: 3, col: 4 }, { row: 3, col: 3 }, start, movementSystem, eventBus);
    for (let t = start + 1; t <= start + 30 * UNIT_BATTLE_ROUND_TICKS; t++) {
      battleSystem.tick(gameState, movementSystem, eventBus, t);
      if (!crossbow.isAlive() || !inf2.isAlive()) break;
    }

    expect(crossbow.isAlive()).toBe(false);
  });
});
