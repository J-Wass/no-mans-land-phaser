import { GameEventBus, type GameEventMap } from '@/systems/events/GameEventBus';
import type { GameState } from '@/managers/GameState';
import { TutorialManager, type TutorialUI, type TutorialViewModel } from './TutorialManager';

/** Minimal GameState stub — resolvers only need these four methods. */
function stubGameState(): GameState {
  return {
    getLocalPlayer: () => ({ getControlledNationId: () => 'nation-1' }),
    getUnitsByNation: () => [],
    getCitiesByNation: () => [],
    getAllCities: () => [],
  } as unknown as GameState;
}

/** UI stub that records the most recent view. */
class StubUI implements TutorialUI {
  view: TutorialViewModel | null = null;
  disposed = false;
  setView(view: TutorialViewModel): void { this.view = view; }
  dispose(): void { this.disposed = true; }
}

function setup() {
  const bus = new GameEventBus();
  const ui = new StubUI();
  const highlighted: Array<{ row: number; col: number } | null> = [];
  let backToMenu = 0;
  const manager = new TutorialManager({
    eventBus: bus,
    gameState: stubGameState(),
    ui,
    highlightTile: (c) => highlighted.push(c),
    onBackToMenu: () => { backToMenu++; },
  });
  return { bus, ui, manager, highlighted, getBackToMenu: () => backToMenu };
}

// Helper that emits with the event-map type relaxed (payload shapes are valid).
function emit<K extends keyof GameEventMap>(bus: GameEventBus, event: K, payload: GameEventMap[K]) {
  bus.emit(event, payload);
}

describe('TutorialManager', () => {
  it('starts in the guided phase on the first step', () => {
    const { ui } = setup();
    expect(ui.view?.phase).toBe('guided');
    expect(ui.view?.guided?.index).toBe(0);
    expect(ui.view?.guided?.total).toBe(3);
  });

  it('advances guided steps only in order, ignoring non-matching events', () => {
    const { bus, ui } = setup();

    // Wrong modal during the "open city" step must not advance past move first.
    emit(bus, 'unit:move-ordered', { unitId: 'u1', path: [], playerId: 'player-1' });
    expect(ui.view?.guided?.index).toBe(1); // now on "open city"

    // A research modal is not a city menu → no advance.
    emit(bus, 'ui:modal-opened', { modal: 'research' });
    expect(ui.view?.guided?.index).toBe(1);

    emit(bus, 'ui:modal-opened', { modal: 'cityMenu' });
    expect(ui.view?.guided?.index).toBe(2); // now on "train unit"

    emit(bus, 'city:production-started', { cityId: 'c1', unitType: 'INFANTRY' as never, tick: 1 });
    expect(ui.view?.phase).toBe('objective');
  });

  it('completes objectives in any order and finishes when all required are done', () => {
    const { bus, ui } = setup();
    // Burn through the guided phase.
    emit(bus, 'unit:move-ordered', { unitId: 'u1', path: [], playerId: 'player-1' });
    emit(bus, 'ui:modal-opened', { modal: 'cityMenu' });
    emit(bus, 'city:production-started', { cityId: 'c1', unitType: 'INFANTRY' as never, tick: 1 });
    expect(ui.view?.phase).toBe('objective');

    // Out-of-order completion.
    emit(bus, 'unit:battle-order-changed', { unitId: 'u1', battleOrder: 'HOLD' as never, tick: 2 });
    emit(bus, 'nation:research-started', { nationId: 'nation-1', techId: 'writing' as never });
    emit(bus, 'ui:modal-opened', { modal: 'diplomacy' });
    emit(bus, 'city:building-built', { cityId: 'c1', building: 'BARRACKS' as never, tick: 3 });
    expect(ui.view?.phase).toBe('objective'); // conquer still outstanding

    emit(bus, 'city:conquered', {
      cityId: 'enemy', byUnitId: 'u1', byNationId: 'nation-1', fromNationId: 'nation-2', position: { row: 8, col: 14 }, tick: 10,
    });
    expect(ui.view?.phase).toBe('complete');
  });

  it('does not complete conquer for another nation', () => {
    const { bus, ui } = setup();
    emit(bus, 'unit:move-ordered', { unitId: 'u1', path: [], playerId: 'player-1' });
    emit(bus, 'ui:modal-opened', { modal: 'cityMenu' });
    emit(bus, 'city:production-started', { cityId: 'c1', unitType: 'INFANTRY' as never, tick: 1 });

    emit(bus, 'city:conquered', {
      cityId: 'enemy', byUnitId: 'x', byNationId: 'nation-2', fromNationId: 'nation-1', position: { row: 8, col: 14 }, tick: 10,
    });
    const conquer = ui.view?.objectives?.items.find(i => i.id === 'conquer-city');
    expect(conquer?.done).toBe(false);
  });

  it('treats raze as bonus: completion does not require it', () => {
    const { bus, ui } = setup();
    emit(bus, 'unit:move-ordered', { unitId: 'u1', path: [], playerId: 'player-1' });
    emit(bus, 'ui:modal-opened', { modal: 'cityMenu' });
    emit(bus, 'city:production-started', { cityId: 'c1', unitType: 'INFANTRY' as never, tick: 1 });
    emit(bus, 'unit:battle-order-changed', { unitId: 'u1', battleOrder: 'HOLD' as never, tick: 2 });
    emit(bus, 'nation:research-started', { nationId: 'nation-1', techId: 'writing' as never });
    emit(bus, 'ui:modal-opened', { modal: 'diplomacy' });
    emit(bus, 'city:building-built', { cityId: 'c1', building: 'BARRACKS' as never, tick: 3 });
    emit(bus, 'city:conquered', {
      cityId: 'enemy', byUnitId: 'u1', byNationId: 'nation-1', fromNationId: 'nation-2', position: { row: 8, col: 14 }, tick: 10,
    });
    expect(ui.view?.phase).toBe('complete'); // finished without razing
  });

  it('dispose() unsubscribes and tears down the UI', () => {
    const { bus, ui, manager } = setup();
    manager.dispose();
    expect(ui.disposed).toBe(true);

    const before = ui.view;
    emit(bus, 'unit:move-ordered', { unitId: 'u1', path: [], playerId: 'player-1' });
    expect(ui.view).toBe(before); // no further updates after dispose
  });
});
