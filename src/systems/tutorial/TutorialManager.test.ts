import { GameEventBus, type GameEventMap } from '@/systems/events/GameEventBus';
import type { GameState } from '@/managers/GameState';
import { TutorialManager, type TutorialUI, type TutorialViewModel } from './TutorialManager';
import type { TutorialStep } from './tutorialSteps';

/** Minimal GameState stub — resolvers only need these methods. */
function stubGameState(): GameState {
  return {
    getLocalPlayer: () => ({ getControlledNationId: () => 'nation-1' }),
    getUnitsByNation: () => [],
    getCitiesByNation: () => [],
    getAllCities: () => [],
    getAllUnits: () => [],
    getGrid: () => ({ getSize: () => ({ rows: 0, cols: 0 }), getTerritory: () => null }),
    getUnit: () => null,
  } as unknown as GameState;
}

/** UI stub that records the most recent view. */
class StubUI implements TutorialUI {
  view: TutorialViewModel | null = null;
  disposed = false;
  setView(view: TutorialViewModel): void { this.view = view; }
  dispose(): void { this.disposed = true; }
}

function setup(steps?: TutorialStep[]) {
  const bus = new GameEventBus();
  const ui = new StubUI();
  let backToMenu = 0;
  const manager = new TutorialManager({
    eventBus: bus,
    gameState: stubGameState(),
    ui,
    highlightTile: () => {},
    onBackToMenu: () => { backToMenu++; },
    ...(steps ? { steps } : {}),
  });
  return { bus, ui, manager, getBackToMenu: () => backToMenu };
}

function emit<K extends keyof GameEventMap>(bus: GameEventBus, event: K, payload: GameEventMap[K]) {
  bus.emit(event, payload);
}

describe('TutorialManager (linear flow)', () => {
  it('starts in guided phase on the first required step', () => {
    const { ui } = setup();
    expect(ui.view?.phase).toBe('guided');
    expect(ui.view?.step?.index).toBe(0);
    expect(ui.view?.step?.total).toBeGreaterThan(0);
  });

  it('advances strictly one step at a time, ignoring out-of-order events', () => {
    // Custom 2-step list to make the test independent of the live step content.
    const steps: TutorialStep[] = [
      { id: 'a', title: 'A', body: 'a', events: ['ui:camera-panned'] },
      { id: 'b', title: 'B', body: 'b', events: ['ui:modal-opened'] },
    ];
    const { bus, ui } = setup(steps);
    expect(ui.view?.step?.index).toBe(0);

    // Wrong event first → no advance.
    emit(bus, 'ui:modal-opened', { modal: 'cityMenu' });
    expect(ui.view?.step?.index).toBe(0);

    emit(bus, 'ui:camera-panned', {});
    expect(ui.view?.step?.index).toBe(1);

    emit(bus, 'ui:modal-opened', { modal: 'cityMenu' });
    expect(ui.view?.phase).toBe('complete');
  });

  it('enters bonus phase when required steps finish but bonuses remain', () => {
    const steps: TutorialStep[] = [
      { id: 'req', title: 'Req', body: '', events: ['ui:camera-panned'] },
      { id: 'bo',  title: 'Bo',  body: '', events: ['ui:modal-opened'], bonus: true },
    ];
    const { bus, ui } = setup(steps);
    emit(bus, 'ui:camera-panned', {});
    expect(ui.view?.phase).toBe('bonus');
    expect(ui.view?.bonus?.items.length).toBe(1);
    expect(ui.view?.bonus?.items[0]?.done).toBe(false);

    emit(bus, 'ui:modal-opened', { modal: 'cityMenu' });
    expect(ui.view?.bonus?.items[0]?.done).toBe(true);
  });

  it('does not require bonus steps to reach completion', () => {
    const steps: TutorialStep[] = [
      { id: 'req', title: 'Req', body: '', events: ['ui:camera-panned'] },
      { id: 'bo',  title: 'Bo',  body: '', events: ['ui:modal-opened'], bonus: true },
    ];
    const { bus, ui } = setup(steps);
    emit(bus, 'ui:camera-panned', {});
    // Required chain done → in bonus phase, but not 'complete' until UI dismiss.
    expect(ui.view?.phase).toBe('bonus');
  });

  it('match predicates filter events', () => {
    const steps: TutorialStep[] = [
      {
        id: 'a', title: 'A', body: '', events: ['ui:modal-opened'],
        match: (p) => (p as GameEventMap['ui:modal-opened']).modal === 'diplomacy',
      },
    ];
    const { bus, ui } = setup(steps);
    emit(bus, 'ui:modal-opened', { modal: 'cityMenu' });
    expect(ui.view?.phase).toBe('guided');
    emit(bus, 'ui:modal-opened', { modal: 'diplomacy' });
    expect(ui.view?.phase).toBe('complete');
  });

  it('dispose() unsubscribes and tears down the UI', () => {
    const steps: TutorialStep[] = [
      { id: 'a', title: 'A', body: '', events: ['ui:camera-panned'] },
    ];
    const { bus, ui, manager } = setup(steps);
    manager.dispose();
    expect(ui.disposed).toBe(true);

    const before = ui.view;
    emit(bus, 'ui:camera-panned', {});
    expect(ui.view).toBe(before);
  });
});
