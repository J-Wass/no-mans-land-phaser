/**
 * TutorialManager — drives the hybrid tutorial: 3 guided steps, then a free-form
 * objective checklist.
 *
 * It is **listen-only over the simulation**: it subscribes to GameEventBus, tracks
 * progress, and pushes a view-model to an injected UI + a map-tile highlight callback.
 * It never dispatches commands or mutates GameState, so it cannot affect determinism.
 */

import type { GameEventBus, GameEventMap } from '@/systems/events/GameEventBus';
import type { GameState } from '@/managers/GameState';
import type { GridCoordinates } from '@/types/common';
import {
  TUTORIAL_STEPS,
  type TutorialResolveCtx,
  type TutorialStep,
} from './tutorialSteps';

/** A single checklist entry the overlay renders. */
export interface TutorialObjectiveView {
  id: string;
  label: string;
  done: boolean;
  bonus: boolean;
}

/** The full state the overlay needs to render. Callbacks are bound by the manager. */
export interface TutorialViewModel {
  phase: 'guided' | 'objective' | 'complete';
  /** Active guided step (phase === 'guided'). */
  guided?: { index: number; total: number; title: string; body: string };
  /** Objective checklist (phase === 'objective'). */
  objectives?: { title: string; body: string; items: TutorialObjectiveView[] };
  /** `[data-tutorial]` key to ring, if any. */
  domHighlight: string | null;
  onSkip: () => void;
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
  private readonly guided: TutorialStep[];
  private readonly objectives: TutorialStep[];
  private readonly completed = new Set<string>();

  private guidedIndex = 0;
  private phase: 'guided' | 'objective' | 'complete' = 'guided';
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
    this.guided = steps.filter(s => s.phase === 'guided');
    this.objectives = steps.filter(s => s.phase === 'objective');

    this.subscribe(steps);
    this.activateCurrent();
  }

  /** Tear down subscriptions, clear highlights, and remove the overlay. */
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
      const current = this.guided[this.guidedIndex];
      return current ? [current] : [];
    }
    return this.objectives.filter(o => !this.completed.has(o.id));
  }

  // ── Progression ───────────────────────────────────────────────────────────

  private complete(step: TutorialStep, payload: unknown): void {
    step.onComplete?.(payload, this.ctx);

    if (step.phase === 'guided') {
      this.guidedIndex++;
      if (this.guidedIndex >= this.guided.length) this.phase = 'objective';
      this.activateCurrent();
      return;
    }

    this.completed.add(step.id);
    const required = this.objectives.filter(o => !o.bonus);
    if (required.every(o => this.completed.has(o.id))) {
      this.finish();
      return;
    }
    // Recompute the map highlight (e.g. drop the enemy-city ring once captured).
    this.activateCurrent();
  }

  /** Push highlight + view for whatever is now active. */
  private activateCurrent(): void {
    if (this.phase === 'guided') {
      const step = this.guided[this.guidedIndex];
      this.highlightTile(step?.highlight?.tile?.(this.ctx) ?? null);
    } else {
      // Objective phase: point at the enemy city until it's captured.
      const conquer = this.objectives.find(o => o.id === 'conquer-city');
      const tile =
        conquer && !this.completed.has(conquer.id)
          ? conquer.highlight?.tile?.(this.ctx) ?? null
          : null;
      this.highlightTile(tile);
    }
    this.render();
  }

  private finish(): void {
    this.phase = 'complete';
    this.highlightTile(null);
    this.render();
  }

  // ── View ────────────────────────────────────────────────────────────────────

  private render(): void {
    this.ui.setView(this.buildView());
  }

  private buildView(): TutorialViewModel {
    const base = {
      domHighlight: null as string | null,
      onSkip: () => this.dispose(),
      onDismiss: () => this.dispose(),
      onBackToMenu: () => { this.dispose(); this.onBackToMenu(); },
    };

    if (this.phase === 'guided') {
      const step = this.guided[this.guidedIndex];
      if (step) {
        return {
          ...base,
          phase: 'guided',
          domHighlight: step.highlight?.dom ?? null,
          guided: { index: this.guidedIndex, total: this.guided.length, title: step.title, body: step.body },
        };
      }
    }

    if (this.phase === 'objective') {
      const items: TutorialObjectiveView[] = this.objectives.map(o => ({
        id: o.id,
        label: o.title,
        done: this.completed.has(o.id),
        bonus: !!o.bonus,
      }));
      const active = this.objectives.find(o => !o.bonus && !this.completed.has(o.id));
      return {
        ...base,
        phase: 'objective',
        objectives: {
          title: 'Objectives',
          body: active?.body ?? 'Complete the remaining objectives.',
          items,
        },
      };
    }

    return { ...base, phase: 'complete' };
  }
}
