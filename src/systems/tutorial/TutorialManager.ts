/**
 * TutorialManager — drives the tutorial as a single linear chain of steps.
 *
 * **Listen-only over the simulation**: subscribes to GameEventBus, tracks
 * progress, and pushes a view-model to an injected UI + a map-tile highlight
 * callback. Never dispatches commands or mutates GameState, so it cannot
 * affect determinism.
 *
 * Required steps advance one at a time; bonus steps are armed all at once
 * after the required chain completes and don't gate completion.
 */

import type { GameEventBus, GameEventMap } from '@/systems/events/GameEventBus';
import type { GameState } from '@/managers/GameState';
import type { GridCoordinates } from '@/types/common';
import {
  TUTORIAL_STEPS,
  type TutorialResolveCtx,
  type TutorialStep,
} from './tutorialSteps';

export interface TutorialBonusView {
  id: string;
  label: string;
  done: boolean;
}

/** The full state the overlay needs to render. Callbacks are bound by the manager. */
export interface TutorialViewModel {
  phase: 'guided' | 'bonus' | 'complete';
  /** Current required step (phase === 'guided'). */
  step?: { index: number; total: number; title: string; body: string };
  /** Bonus checklist (phase === 'bonus' or 'complete'). */
  bonus?: { title: string; body: string; items: TutorialBonusView[] };
  /** `[data-tutorial]` key to ring, if any. */
  domHighlight: string | null;
  onDismiss: () => void;
  onBackToMenu: () => void;
}

/** UI surface the manager talks to (real overlay or a test stub). */
export interface TutorialUI {
  setView(view: TutorialViewModel): void;
  dispose(): void;
}

export interface TutorialManagerOptions {
  eventBus: GameEventBus;
  gameState: GameState;
  ui: TutorialUI;
  highlightTile: (coords: GridCoordinates | null) => void;
  onBackToMenu: () => void;
  /** Override the step list (tests). Defaults to TUTORIAL_STEPS. */
  steps?: TutorialStep[];
}

export class TutorialManager {
  private readonly eventBus: GameEventBus;
  private readonly ui: TutorialUI;
  private readonly highlightTile: (coords: GridCoordinates | null) => void;
  private readonly onBackToMenu: () => void;

  private readonly ctx: TutorialResolveCtx;
  private readonly required: TutorialStep[];
  private readonly bonus: TutorialStep[];
  private readonly completed = new Set<string>();

  private requiredIndex = 0;
  private phase: 'guided' | 'bonus' | 'complete' = 'guided';
  private disposed = false;

  /** event name → bound handler, so we can unsubscribe exactly what we added. */
  private readonly handlers = new Map<keyof GameEventMap, (payload: unknown) => void>();

  constructor(opts: TutorialManagerOptions) {
    this.eventBus = opts.eventBus;
    this.ui = opts.ui;
    this.highlightTile = opts.highlightTile;
    this.onBackToMenu = opts.onBackToMenu;

    const localNationId = opts.gameState.getLocalPlayer()?.getControlledNationId() ?? null;
    this.ctx = { gameState: opts.gameState, localNationId, state: {} };

    const steps = opts.steps ?? TUTORIAL_STEPS;
    this.required = steps.filter(s => !s.bonus);
    this.bonus    = steps.filter(s =>  s.bonus);
    if (this.required.length === 0) this.phase = this.bonus.length === 0 ? 'complete' : 'bonus';

    this.subscribe(steps);
    this.activateCurrent();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const [event, handler] of this.handlers) this.eventBus.off(event, handler);
    this.handlers.clear();
    this.highlightTile(null);
    this.ui.dispose();
  }

  // ── Subscriptions ───────────────────────────────────────────────────────────

  private subscribe(steps: TutorialStep[]): void {
    const events = new Set<keyof GameEventMap>();
    for (const step of steps) for (const e of step.events) events.add(e);

    for (const event of events) {
      const handler = (payload: unknown) => this.onEvent(event, payload);
      this.handlers.set(event, handler);
      this.eventBus.on(event, handler as (p: GameEventMap[typeof event]) => void);
    }
  }

  private onEvent(event: keyof GameEventMap, payload: unknown): void {
    if (this.disposed || this.phase === 'complete') return;

    for (const step of this.armedSteps()) {
      if (!step.events.includes(event)) continue;
      if (step.match && !step.match(payload, this.ctx)) continue;
      this.complete(step, payload);
      return; // one completion per event keeps things predictable
    }
  }

  /** Steps currently eligible to complete. */
  private armedSteps(): TutorialStep[] {
    if (this.phase === 'guided') {
      const current = this.required[this.requiredIndex];
      return current ? [current] : [];
    }
    if (this.phase === 'bonus') {
      return this.bonus.filter(b => !this.completed.has(b.id));
    }
    return [];
  }

  // ── Progression ───────────────────────────────────────────────────────────

  private complete(step: TutorialStep, payload: unknown): void {
    step.onComplete?.(payload, this.ctx);
    this.completed.add(step.id);

    if (!step.bonus) {
      this.requiredIndex++;
      if (this.requiredIndex >= this.required.length) {
        this.phase = this.bonus.length === 0 ? 'complete' : 'bonus';
      }
    }
    this.activateCurrent();
  }

  /** Push highlight + view for whatever is now active. */
  private activateCurrent(): void {
    if (this.phase === 'guided') {
      const step = this.required[this.requiredIndex];
      this.highlightTile(step?.highlight?.tile?.(this.ctx) ?? null);
    } else if (this.phase === 'bonus') {
      // In bonus mode, highlight the first incomplete bonus that resolves to a tile.
      const first = this.bonus.find(b => !this.completed.has(b.id) && !!b.highlight?.tile);
      this.highlightTile(first?.highlight?.tile?.(this.ctx) ?? null);
    } else {
      this.highlightTile(null);
    }
    this.render();
  }

  // ── View ────────────────────────────────────────────────────────────────────

  private render(): void {
    this.ui.setView(this.buildView());
  }

  private buildView(): TutorialViewModel {
    const base = {
      domHighlight: null as string | null,
      onDismiss: () => this.dispose(),
      onBackToMenu: () => { this.dispose(); this.onBackToMenu(); },
    };

    if (this.phase === 'guided') {
      const step = this.required[this.requiredIndex];
      if (step) {
        return {
          ...base,
          phase: 'guided',
          domHighlight: step.highlight?.dom ?? null,
          step: {
            index: this.requiredIndex,
            total: this.required.length,
            title: step.title,
            body: step.body,
          },
        };
      }
    }

    if (this.phase === 'bonus') {
      const items = this.bonus.map(b => ({
        id: b.id,
        label: b.title.replace(/^Bonus:\s*/i, ''),
        done: this.completed.has(b.id),
      }));
      const active = this.bonus.find(b => !this.completed.has(b.id));
      return {
        ...base,
        phase: 'bonus',
        domHighlight: active?.highlight?.dom ?? null,
        bonus: {
          title: 'Tutorial Complete — Optional Extras',
          body: active?.body ?? 'You can also keep playing freely.',
          items,
        },
      };
    }

    return { ...base, phase: 'complete' };
  }
}
