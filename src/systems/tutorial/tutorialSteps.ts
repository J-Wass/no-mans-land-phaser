/**
 * Declarative tutorial content — the guided steps and the free-phase objectives.
 *
 * Each entry names the game event(s) whose firing can complete it, an optional
 * `match` predicate, and what to highlight while it is active. The TutorialManager
 * consumes this data; it holds no game logic itself.
 */

import type { GameEventMap } from '@/systems/events/GameEventBus';
import type { GameState } from '@/managers/GameState';
import type { GridCoordinates } from '@/types/common';

export type TutorialPhase = 'guided' | 'objective';

/** Context handed to resolvers / predicates so they can read live game state. */
export interface TutorialResolveCtx {
  gameState: GameState;
  localNationId: string | null;
  /** Scratch space shared across steps (e.g. recording the conquest tick). */
  state: Record<string, unknown>;
}

/** What to visually emphasise while a step is active. */
export interface TutorialHighlight {
  /** A `[data-tutorial="..."]` DOM element to ring (in an open modal/menu). */
  dom?: string;
  /** A map tile to ring, resolved from game state when the step activates. */
  tile?: (ctx: TutorialResolveCtx) => GridCoordinates | null;
}

export interface TutorialStep {
  id: string;
  phase: TutorialPhase;
  title: string;
  body: string;
  /** Any of these events firing (and passing `match`) completes the step. */
  events: (keyof GameEventMap)[];
  /** Optional gate; receives the raw event payload and the live context. */
  match?: (payload: unknown, ctx: TutorialResolveCtx) => boolean;
  /** Runs once when the step completes — used to stash state for later steps. */
  onComplete?: (payload: unknown, ctx: TutorialResolveCtx) => void;
  highlight?: TutorialHighlight;
  /** Bonus objectives do not gate overall tutorial completion. */
  bonus?: boolean;
}

// ── Tile resolvers ─────────────────────────────────────────────────────────

function firstUnitTile(ctx: TutorialResolveCtx): GridCoordinates | null {
  if (!ctx.localNationId) return null;
  return ctx.gameState.getUnitsByNation(ctx.localNationId)[0]?.position ?? null;
}

function playerCityTile(ctx: TutorialResolveCtx): GridCoordinates | null {
  if (!ctx.localNationId) return null;
  return ctx.gameState.getCitiesByNation(ctx.localNationId)[0]?.position ?? null;
}

function enemyCityTile(ctx: TutorialResolveCtx): GridCoordinates | null {
  const enemy = ctx.gameState
    .getAllCities()
    .find(c => c.getOwnerId() !== ctx.localNationId);
  return enemy?.position ?? null;
}

// ── Typed payload helpers (the events list guarantees the shape) ────────────

const isModal = (modal: GameEventMap['ui:modal-opened']['modal']) =>
  (payload: unknown) => (payload as GameEventMap['ui:modal-opened']).modal === modal;

// ── Step list ───────────────────────────────────────────────────────────────

export const TUTORIAL_STEPS: TutorialStep[] = [
  // ── Guided phase ──────────────────────────────────────────────────────────
  {
    id: 'move-unit',
    phase: 'guided',
    title: 'Move a unit',
    body: 'Left-click your unit to select it, then left-click a nearby tile to march there. Try moving it now.',
    events: ['unit:move-ordered'],
    highlight: { tile: firstUnitTile },
  },
  {
    id: 'open-city',
    phase: 'guided',
    title: 'Open your city',
    body: 'Double-click your city to open its management menu, where you train units and construct buildings.',
    events: ['ui:modal-opened'],
    match: isModal('cityMenu'),
    highlight: { tile: playerCityTile },
  },
  {
    id: 'train-unit',
    phase: 'guided',
    title: 'Train a unit',
    body: 'On the Units tab, press BUILD next to a unit to add it to the production queue.',
    events: ['city:production-started'],
    highlight: { dom: 'produce-unit' },
  },

  // ── Objective phase (any order) ─────────────────────────────────────────────
  {
    id: 'build-building',
    phase: 'objective',
    title: 'Construct a building',
    body: 'In a city menu, switch to the Buildings tab and build or upgrade a building.',
    events: ['city:building-built', 'territory:building-built', 'territory:building-upgraded'],
  },
  {
    id: 'research-tech',
    phase: 'objective',
    title: 'Research a technology',
    body: 'Open the Research panel from the bottom bar and start researching a tech.',
    events: ['nation:research-started'],
  },
  {
    id: 'set-stance',
    phase: 'objective',
    title: 'Set a battle stance',
    body: 'Select a unit, then use the stance buttons (Advance / Hold / Fall back) in the bottom bar.',
    events: ['unit:battle-order-changed'],
  },
  {
    id: 'conquer-city',
    phase: 'objective',
    title: 'Conquer Greyhold',
    body: 'March your units onto the enemy city to lay siege and capture it.',
    events: ['city:conquered'],
    match: (payload, ctx) =>
      (payload as GameEventMap['city:conquered']).byNationId === ctx.localNationId,
    onComplete: (payload, ctx) => {
      ctx.state['conqueredTick'] = (payload as GameEventMap['city:conquered']).tick;
    },
    highlight: { tile: enemyCityTile },
  },
  {
    id: 'open-diplomacy',
    phase: 'objective',
    title: 'Review diplomacy',
    body: 'Open the Diplomacy panel from the bottom bar to see relations, declare war, or sue for peace.',
    events: ['ui:modal-opened'],
    match: isModal('diplomacy'),
  },
  {
    id: 'raze-city',
    phase: 'objective',
    title: 'Bonus: raze or downsize a city',
    body: 'After capturing a city, open it and use RAZE or −1 LVL to tear down its buildings.',
    events: ['city:buildings-changed'],
    bonus: true,
    // Ignore the automatic down-level that fires on the same tick as conquest;
    // only a later, player-initiated raze/removal counts.
    match: (payload, ctx) => {
      const conqueredTick = ctx.state['conqueredTick'];
      if (typeof conqueredTick !== 'number') return false;
      return (payload as GameEventMap['city:buildings-changed']).tick > conqueredTick;
    },
  },
];
