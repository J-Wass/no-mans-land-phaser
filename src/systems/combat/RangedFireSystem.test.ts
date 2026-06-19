import { describe, it, expect } from '@jest/globals';
import { RangedFireSystem } from './RangedFireSystem';
import { GameState } from '@/managers/GameState';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { Nation } from '@/entities/nations/Nation';
import { Trebuchet } from '@/entities/units/Trebuchet';
import { Cavalry } from '@/entities/units/Cavalry';
import { Infantry } from '@/entities/units/Infantry';
import { HeavyInfantry } from '@/entities/units/HeavyInfantry';

/**
 * Cavalry's anti-ranged identity: it shrugs off standalone ranged fire while it
 * charges (CAVALRY_RANGED_RESIST), which is what lets it close on and counter
 * ranged/siege units. A non-cavalry unit takes the full volley.
 */
describe('RangedFireSystem — cavalry ranged resistance', () => {
  function damageDealtTo(makeTarget: (id: string) => { id: string; getStats(): { maxHealth: number } }): number {
    const gs = new GameState({ rows: 8, cols: 8 });
    gs.addNation(new Nation('na', 'A', '#f00'));
    gs.addNation(new Nation('nb', 'B', '#00f'));
    const eb = new GameEventBus();
    const rf = new RangedFireSystem(() => 0.5); // variance = 1.0
    const treb = new Trebuchet('t', 'na', { row: 1, col: 1 });
    const target = makeTarget('tgt') as never;
    gs.addUnit(treb);
    gs.addUnit(target);
    rf.tick(gs, eb, 0);
    const after = gs.getUnit('tgt');
    const maxHp = (target as { getStats(): { maxHealth: number } }).getStats().maxHealth;
    return maxHp - (after?.getHealth() ?? 0);
  }

  it('a full-HP Infantry takes the full trebuchet volley (50)', () => {
    expect(damageDealtTo(() => new Infantry('tgt', 'nb', { row: 1, col: 3 }))).toBe(50);
  });

  it('a full-HP Cavalry takes half the volley (25)', () => {
    expect(damageDealtTo(() => new Cavalry('tgt', 'nb', { row: 1, col: 3 }))).toBe(25);
  });

  it('resistance is cavalry-specific — Heavy Infantry takes full damage', () => {
    expect(damageDealtTo(() => new HeavyInfantry('tgt', 'nb', { row: 1, col: 3 }))).toBe(50);
  });
});
