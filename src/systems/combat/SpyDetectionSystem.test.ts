import { describe, it, expect } from '@jest/globals';
import { SpyDetectionSystem, SPY_DETECTION_INTERVAL_TICKS } from './SpyDetectionSystem';
import { GameState } from '@/managers/GameState';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { Nation } from '@/entities/nations/Nation';
import { Scout } from '@/entities/units/Scout';
import { Infantry } from '@/entities/units/Infantry';

const TICK = SPY_DETECTION_INTERVAL_TICKS; // a tick on which detection runs

function setup() {
  const gs = new GameState({ rows: 8, cols: 8 });
  gs.addNation(new Nation('na', 'A', '#f00'));
  gs.addNation(new Nation('nb', 'B', '#00f'));
  return { gs, eb: new GameEventBus() };
}

// Spies are only at risk on enemy-controlled soil, so by default we place the
// spy's tile under the enemy nation ('nb'). Pass `null` for neutral no-man's-land
// or 'na' for the spy's own territory.
function spyAt(
  gs: GameState,
  pos: { row: number; col: number },
  tileOwner: string | null = 'nb',
): Scout {
  const spy = new Scout('spy', 'na', pos);
  spy.setSpy(true);
  gs.addUnit(spy);
  if (tileOwner) gs.getGrid().getTerritory(pos)?.setControllingNation(tileOwner);
  return spy;
}

describe('SpyDetectionSystem', () => {
  it('catches an undercover spy when an enemy is adjacent', () => {
    const { gs, eb } = setup();
    spyAt(gs, { row: 3, col: 3 });
    gs.addUnit(new Infantry('enemy', 'nb', { row: 3, col: 4 })); // Chebyshev 1
    new SpyDetectionSystem(() => 0).tick(gs, eb, TICK);
    expect(gs.getUnit('spy')).toBeFalsy();
  });

  it('leaves a spy alone when no enemy is within range', () => {
    const { gs, eb } = setup();
    spyAt(gs, { row: 0, col: 0 });
    gs.addUnit(new Infantry('enemy', 'nb', { row: 7, col: 7 })); // far away
    new SpyDetectionSystem(() => 0).tick(gs, eb, TICK);
    expect(gs.getUnit('spy')).toBeTruthy();
  });

  it('ignores a Scout that is not undercover', () => {
    const { gs, eb } = setup();
    gs.addUnit(new Scout('scout', 'na', { row: 3, col: 3 })); // not a spy
    gs.addUnit(new Infantry('enemy', 'nb', { row: 3, col: 4 }));
    new SpyDetectionSystem(() => 0).tick(gs, eb, TICK);
    expect(gs.getUnit('scout')).toBeTruthy();
  });

  it('only runs on the detection interval', () => {
    const { gs, eb } = setup();
    spyAt(gs, { row: 3, col: 3 });
    gs.addUnit(new Infantry('enemy', 'nb', { row: 3, col: 4 }));
    new SpyDetectionSystem(() => 0).tick(gs, eb, TICK + 1); // off-interval
    expect(gs.getUnit('spy')).toBeTruthy();
  });

  it('survives a mid roll at distance 2 (diminishing chance)', () => {
    const { gs, eb } = setup();
    spyAt(gs, { row: 3, col: 3 });
    gs.addUnit(new Infantry('enemy', 'nb', { row: 3, col: 5 })); // distance 2, base 0.10
    new SpyDetectionSystem(() => 0.5).tick(gs, eb, TICK); // 0.5 >= 0.10 → not caught
    expect(gs.getUnit('spy')).toBeTruthy();
  });

  it('does not catch a spy in neutral (unowned) territory even with an enemy adjacent', () => {
    const { gs, eb } = setup();
    spyAt(gs, { row: 3, col: 3 }, null); // neutral no-man's-land
    gs.addUnit(new Infantry('enemy', 'nb', { row: 3, col: 4 })); // Chebyshev 1
    new SpyDetectionSystem(() => 0).tick(gs, eb, TICK); // roll 0 would normally catch
    expect(gs.getUnit('spy')).toBeTruthy();
  });

  it('does not catch a spy standing on its own territory', () => {
    const { gs, eb } = setup();
    spyAt(gs, { row: 3, col: 3 }, 'na'); // own soil
    gs.addUnit(new Infantry('enemy', 'nb', { row: 3, col: 4 }));
    new SpyDetectionSystem(() => 0).tick(gs, eb, TICK);
    expect(gs.getUnit('spy')).toBeTruthy();
  });

  it('emits spy:detected when a spy is caught', () => {
    const { gs, eb } = setup();
    spyAt(gs, { row: 3, col: 3 });
    gs.addUnit(new Infantry('enemy', 'nb', { row: 3, col: 3 })); // on the spy's tile
    let detected = false;
    eb.on('spy:detected', () => { detected = true; });
    new SpyDetectionSystem(() => 0).tick(gs, eb, TICK);
    expect(detected).toBe(true);
    expect(gs.getUnit('spy')).toBeFalsy();
  });
});
