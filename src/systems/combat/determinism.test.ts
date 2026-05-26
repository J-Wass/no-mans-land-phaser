import { describe, it, expect } from '@jest/globals';
import { BattleSystem } from './BattleSystem';
import { GameState } from '@/managers/GameState';
import { MovementSystem } from '@/systems/movement/MovementSystem';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { Nation } from '@/entities/nations/Nation';
import { Infantry } from '@/entities/units/Infantry';

/**
 * These tests guard the lockstep-multiplayer invariant: given identical state
 * and an identical seed, the simulation must produce identical results, and a
 * different seed must be able to diverge.
 */
function runBattle(seed: number): number[] {
  const gameState = new GameState({ rows: 5, cols: 5 }, seed);
  const movement = new MovementSystem();
  const bus = new GameEventBus();

  const attackerNation = new Nation('n-a', 'A', '#f00');
  const defenderNation = new Nation('n-b', 'B', '#00f');
  gameState.addNation(attackerNation);
  gameState.addNation(defenderNation);

  const attacker = new Infantry('u-a', 'n-a', { row: 2, col: 2 });
  const defender = new Infantry('u-b', 'n-b', { row: 2, col: 3 });
  gameState.addUnit(attacker);
  gameState.addUnit(defender);

  const battle = new BattleSystem(gameState.getRng().fn());
  battle.startBattle(attacker, defender, { row: 2, col: 1 }, { row: 2, col: 3 }, 0, movement, bus);

  // Record the combined HP of both units after each tick until the battle ends.
  const trajectory: number[] = [];
  for (let tick = 1; tick <= 400; tick++) {
    battle.tick(gameState, movement, bus, tick);
    const a = gameState.getUnit('u-a');
    const b = gameState.getUnit('u-b');
    trajectory.push((a?.getHealth() ?? -1) * 1000 + (b?.getHealth() ?? -1));
    if (!a || !b || !a.isAlive() || !b.isAlive()) break;
  }
  return trajectory;
}

describe('combat determinism', () => {
  it('produces an identical battle for the same seed', () => {
    expect(runBattle(424242)).toEqual(runBattle(424242));
  });

  it('can produce a different battle for a different seed', () => {
    // Not guaranteed for every pair, but these two seeds diverge.
    expect(runBattle(1)).not.toEqual(runBattle(98765));
  });
});
