import { describe, it, expect, beforeEach } from '@jest/globals';
import { buildPlayerView, renderAsciiMap, ticksLeft, techLabel } from './playerView';
import type { ViewContext } from './playerView';
import { GameState } from '@/managers/GameState';
import { Nation } from '@/entities/nations/Nation';
import { City } from '@/entities/cities/City';
import { Infantry } from '@/entities/units/Infantry';
import { Scout } from '@/entities/units/Scout';
import { MovementSystem } from '@/systems/movement/MovementSystem';
import { DiplomacySystem } from '@/systems/diplomacy/DiplomacySystem';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { VisionSystem } from '@/systems/vision/VisionSystem';

describe('playerView', () => {
  let gameState: GameState;
  let visionSystem: VisionSystem;

  const ctx = (fog = true): ViewContext => ({
    gameState,
    tick: 0,
    viewerNationId: 'n1',
    vision: fog ? visionSystem.compute(gameState, 'n1') : null,
    visionSystem,
    movementSystem: new MovementSystem(),
    diplomacySystem: new DiplomacySystem(gameState, new GameEventBus()),
    battles: [], sieges: [], territoryBattles: [],
  });

  beforeEach(() => {
    gameState = new GameState({ rows: 20, cols: 20 }, 1);
    visionSystem = new VisionSystem();
    gameState.addNation(new Nation('n1', 'Red', '#f00'));
    gameState.addNation(new Nation('n2', 'Blue', '#00f'));
    gameState.addCity(new City('c1', 'Redville', 'n1', { row: 2, col: 2 }));
    gameState.addUnit(new Scout('u1', 'n1', { row: 3, col: 3 }));
    gameState.addCity(new City('c2', 'Bluetown', 'n2', { row: 17, col: 17 }));
    gameState.addUnit(new Infantry('u2', 'n2', { row: 17, col: 16 }));
  });

  it('lists own units and cities but hides enemies under fog', () => {
    const view = buildPlayerView(ctx());
    expect(view.units.map(u => u.id)).toEqual(['u1']);
    expect(view.cities.map(c => c.id)).toEqual(['c1']);
    expect(view.visibleEnemies).toEqual([]);
    expect(view.foreignCities).toEqual([]);
  });

  it('shows enemies once they are within sight', () => {
    gameState.getUnit('u2')!.moveTo({ row: 4, col: 3 });
    const view = buildPlayerView(ctx());
    expect(view.visibleEnemies.map(e => e['id'])).toEqual(['u2']);
  });

  it('shows everything when fog is disabled', () => {
    const view = buildPlayerView(ctx(false));
    expect(view.visibleEnemies.map(e => e['id'])).toEqual(['u2']);
    expect(view.foreignCities.map(c => c.id)).toEqual(['c2']);
  });

  it('renders an ASCII map that marks own city and unit, and leaves unseen tiles blank', () => {
    const map = renderAsciiMap(ctx(), { center: { row: 3, col: 3 }, radius: 2 });
    const lines = map.split('\n');
    expect(lines).toHaveLength(6); // header + 5 rows
    expect(map).toContain('@C');
    expect(map).toMatch(/[ @`]U/);
    const full = renderAsciiMap(ctx());
    expect(full).not.toContain('K'); // the enemy city is not visible
    expect(full).toContain(' #');
  });

  it('keeps a discovered foreign city listed (without owner/hp) once it drops out of sight', () => {
    const scout = gameState.getUnit('u1')!;
    scout.moveTo({ row: 16, col: 16 });
    const seen = buildPlayerView(ctx());
    expect(seen.foreignCities).toEqual([
      { id: 'c2', name: 'Bluetown', at: [17, 17], visible: true, owner: 'n2', hp: expect.any(String) },
    ]);

    scout.moveTo({ row: 3, col: 3 });
    const view = buildPlayerView(ctx());
    expect(view.foreignCities).toEqual([{ id: 'c2', name: 'Bluetown', at: [17, 17], visible: false }]);
    expect(view.visibleEnemies).toEqual([]); // the garrison next to it is not leaked

    const map = renderAsciiMap(ctx(), { center: { row: 17, col: 17 }, radius: 0 });
    expect(map.split('\n')[1]).toMatch(/`K$/); // city drawn, owner hidden
    expect(renderAsciiMap(ctx(), { center: { row: 17, col: 16 }, radius: 0 })).not.toMatch(/E$/m);
  });

  it('rounds fractional tick counts up and names the current research', () => {
    expect(ticksLeft(335.99999999999454)).toBe(336);
    expect(ticksLeft(12.2)).toBe(13);
    expect(ticksLeft(40)).toBe(40);
    expect(ticksLeft(-3)).toBe(0);
    expect(techLabel('the_wheel')).toMatch(/^the_wheel — \S/);

    gameState.getNation('n1')!.startResearch('the_wheel', 335.99999999999454);
    const current = buildPlayerView(ctx()).me.research.current;
    expect(current).toMatch(/^the_wheel — .+ \(336t left\)$/);
  });
});
