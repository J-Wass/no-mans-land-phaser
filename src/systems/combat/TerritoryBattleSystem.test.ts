import { beforeEach, describe, expect, it } from '@jest/globals';
import { GameState } from '@/managers/GameState';
import { Nation } from '@/entities/nations/Nation';
import { Infantry } from '@/entities/units/Infantry';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { MovementSystem } from '@/systems/movement/MovementSystem';
import { BattleSystem, BATTLE_ROUND_TICKS } from '@/systems/combat/BattleSystem';
import { CitySiegeSystem } from '@/systems/combat/CitySiegeSystem';
import { TerritoryBattleSystem } from '@/systems/combat/TerritoryBattleSystem';

describe('TerritoryBattleSystem', () => {
  let gameState: GameState;
  let eventBus: GameEventBus;
  let movementSystem: MovementSystem;
  let battleSystem: BattleSystem;
  let citySiegeSystem: CitySiegeSystem;
  let territoryBattleSystem: TerritoryBattleSystem;

  beforeEach(() => {
    gameState = new GameState({ rows: 5, cols: 5 });
    eventBus = new GameEventBus();
    movementSystem = new MovementSystem();
    battleSystem = new BattleSystem(() => 0.5);
    citySiegeSystem = new CitySiegeSystem(() => 0.5);
    territoryBattleSystem = new TerritoryBattleSystem(() => 0.5);
  });

  function advanceTicks(startTick: number, ticks: number): number {
    let tick = startTick;
    for (let i = 0; i < ticks; i++) {
      tick++;
      movementSystem.tickWithBattles(
        gameState,
        eventBus,
        tick,
        battleSystem,
        citySiegeSystem,
        territoryBattleSystem,
      );
      battleSystem.tick(gameState, movementSystem, eventBus, tick);
      citySiegeSystem.tick(gameState, movementSystem, eventBus, tick);
      territoryBattleSystem.tick(gameState, movementSystem, eventBus, tick);
    }
    return tick;
  }

  it('resumes an invasion order after each conquered hostile tile', () => {
    const attackerNation = new Nation('nation-a', 'Alpha', '#ff0000');
    const defenderNation = new Nation('nation-b', 'Bravo', '#00ff00');
    attackerNation.declareWar(defenderNation.getId());
    defenderNation.declareWar(attackerNation.getId());
    gameState.addNation(attackerNation);
    gameState.addNation(defenderNation);

    gameState.getGrid().getTerritory({ row: 0, col: 1 })?.setControllingNation(defenderNation.getId());
    gameState.getGrid().getTerritory({ row: 0, col: 2 })?.setControllingNation(defenderNation.getId());

    const attacker = new Infantry('unit-a', attackerNation.getId(), { row: 0, col: 0 });
    gameState.addUnit(attacker);

    movementSystem.issueOrder(attacker, [
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ]);

    let tick = 0;
    tick = advanceTicks(tick, 5);

    expect(attacker.position).toEqual({ row: 0, col: 1 });
    expect(territoryBattleSystem.getBattleAt({ row: 0, col: 1 })).not.toBeNull();
    expect(movementSystem.isMoving(attacker.id)).toBe(false);

    tick = advanceTicks(tick, BATTLE_ROUND_TICKS * 3);

    expect(gameState.getGrid().getTerritory({ row: 0, col: 1 })?.getControllingNation()).toBe(attackerNation.getId());
    expect(movementSystem.isMoving(attacker.id)).toBe(true);

    advanceTicks(tick, 5);

    expect(attacker.position).toEqual({ row: 0, col: 2 });
    expect(territoryBattleSystem.getBattleAt({ row: 0, col: 2 })).not.toBeNull();
  });
});
