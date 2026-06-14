/**
 * Declarative tutorial content — a single linear chain of steps.
 *
 * Each entry names the game event(s) whose firing can complete it, an optional
 * `match` predicate, and what to highlight while it is active. The TutorialManager
 * consumes this data; it holds no game logic itself.
 *
 * Order: mouse-controls primer → combat → conquest → late-game features → bonus.
 */

import type { GameEventMap } from '@/systems/events/GameEventBus';
import type { GameState } from '@/managers/GameState';
import type { GridCoordinates } from '@/types/common';

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
  title: string;
  body: string;
  /** Any of these events firing (and passing `match`) completes the step. */
  events: (keyof GameEventMap)[];
  /** Optional gate; receives the raw event payload and the live context. */
  match?: (payload: unknown, ctx: TutorialResolveCtx) => boolean;
  /** Runs once when the step completes — used to stash state for later steps. */
  onComplete?: (payload: unknown, ctx: TutorialResolveCtx) => void;
  highlight?: TutorialHighlight;
  /** Bonus steps appear after the required chain and don't gate completion. */
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

function enemyUnitTile(ctx: TutorialResolveCtx): GridCoordinates | null {
  for (const u of ctx.gameState.getAllUnits()) {
    if (u.getOwnerId() !== ctx.localNationId && u.isAlive()) return u.position;
  }
  return null;
}

function depositTile(ctx: TutorialResolveCtx): GridCoordinates | null {
  const grid = ctx.gameState.getGrid();
  const { rows, cols } = grid.getSize();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = grid.getTerritory({ row: r, col: c });
      if (t?.getResourceDeposit()) return { row: r, col: c };
    }
  }
  return null;
}

const MINE_BUILDINGS = new Set(['COPPER_MINE', 'IRON_MINE', 'FIRE_GLASS_MINE', 'MANA_MINE']);

// ── Typed payload helpers (the events list guarantees the shape) ────────────

const isModal = (modal: GameEventMap['ui:modal-opened']['modal']) =>
  (payload: unknown) => (payload as GameEventMap['ui:modal-opened']).modal === modal;

// ── Step list ───────────────────────────────────────────────────────────────

export const TUTORIAL_STEPS: TutorialStep[] = [
  // ── Mouse-controls primer ─────────────────────────────────────────────────
  {
    id: 'select-unit',
    title: 'Select a unit',
    body: 'Left-click on your unit (the glowing tile) to select it. Selected units show stats and stance buttons in the bottom bar.',
    events: ['unit:selected'],
    match: (payload, ctx) => {
      const u = (payload as GameEventMap['unit:selected']).unit;
      return !!u && u.getOwnerId() === ctx.localNationId;
    },
    highlight: { tile: firstUnitTile },
  },
  {
    id: 'move-unit',
    title: 'Move it with a left-click',
    body: 'With your unit selected, left-click an empty tile to march there. Tip: left-click and DRAG to paint a custom multi-step path.',
    events: ['unit:move-ordered'],
    highlight: { tile: firstUnitTile },
  },
  {
    id: 'pan-camera',
    title: 'Pan the camera',
    body: 'Hold the RIGHT mouse button and drag to pan around the map. Try it — find the enemy unit to the north.',
    events: ['ui:camera-panned'],
  },

  // ── City management: upgrade barracks, train Longbowman ─────────────────
  {
    id: 'open-city',
    title: 'Open your city',
    body: 'Double-click your city (Rivervale) to open its management menu — that\'s where you train units and construct buildings.',
    events: ['ui:modal-opened'],
    match: isModal('cityMenu'),
    highlight: { tile: playerCityTile },
  },
  {
    id: 'upgrade-barracks',
    title: 'Upgrade the Barracks to Lvl 2',
    body: 'On the Buildings tab, find the Barracks (already built at Lvl 1) and press ▲ UP to upgrade it. Lvl 2 unlocks the Longbowman.',
    events: ['city:building-built'],
    match: (payload, ctx) => {
      const p = payload as GameEventMap['city:building-built'];
      if (String(p.building) !== 'BARRACKS') return false;
      const city = ctx.gameState.getCity(p.cityId);
      if (!city || city.getOwnerId() !== ctx.localNationId) return false;
      return city.getBuildingLevel(p.building) >= 2;
    },
  },
  {
    id: 'train-longbowman',
    title: 'Train a Longbowman',
    body: 'Back on the Units tab, press BUILD next to the Longbowman. They out-range Infantry, so they\'re your edge against the enemy on the road.',
    events: ['city:production-started'],
    match: (payload) =>
      String((payload as GameEventMap['city:production-started']).unitType) === 'LONGBOWMAN',
    highlight: { dom: 'produce-unit' },
  },

  // ── Combat ────────────────────────────────────────────────────────────────
  {
    id: 'defeat-enemy',
    title: 'Defeat the enemy unit',
    body: 'Once your Longbowman musters, march it onto the enemy Infantry. Longbowmen out-range Infantry, so they win on open ground.',
    events: ['unit:destroyed'],
    match: (payload, ctx) => {
      const p = payload as GameEventMap['unit:destroyed'];
      // The killed unit was not ours, and the killer (if any) was ours.
      if (p.ownerNationId === ctx.localNationId) return false;
      if (!p.byUnitId) return false;
      const killer = ctx.gameState.getUnit(p.byUnitId);
      return !!killer && killer.getOwnerId() === ctx.localNationId;
    },
    highlight: { tile: enemyUnitTile },
  },

  // ── Conquest ──────────────────────────────────────────────────────────────
  {
    id: 'train-more',
    title: 'Train more units for the siege',
    body: 'Re-open Rivervale and queue 2 more units. A city is too tough for one unit alone — you\'ll want a small force to take Greyhold.',
    events: ['city:production-started'],
  },
  {
    id: 'conquer-city',
    title: 'Conquer Greyhold',
    body: 'March your units onto the enemy city — multiple attackers will pressure it down. Conquering a city rallies nearby troops with a morale boost.',
    events: ['city:conquered'],
    match: (payload, ctx) =>
      (payload as GameEventMap['city:conquered']).byNationId === ctx.localNationId,
    onComplete: (payload, ctx) => {
      ctx.state['conqueredTick'] = (payload as GameEventMap['city:conquered']).tick;
    },
    highlight: { tile: enemyCityTile },
  },

  // ── Late-game features ────────────────────────────────────────────────────
  {
    id: 'research-tech',
    title: 'Research a technology',
    body: 'Open the Research panel from the bottom bar and pick a tech. Better tech unlocks stronger units, mines, and buildings.',
    events: ['nation:research-started'],
  },
  {
    id: 'open-diplomacy',
    title: 'Review diplomacy',
    body: 'Open the Diplomacy panel from the bottom bar to see relations, declare war, or sue for peace.',
    events: ['ui:modal-opened'],
    match: isModal('diplomacy'),
  },

  // ── Bonus chain (run after the required chain completes) ──────────────────
  {
    id: 'build-mine',
    title: 'Bonus: build a mine on a deposit',
    body: 'A copper deposit sits north of your city. March a unit onto it, build an Outpost, then a Copper Mine to unlock bronze weapons.',
    events: ['territory:building-built'],
    bonus: true,
    match: (payload) =>
      MINE_BUILDINGS.has((payload as GameEventMap['territory:building-built']).building),
    highlight: { tile: depositTile },
  },
  {
    id: 'raze-city',
    title: 'Bonus: raze or downsize a city',
    body: 'In the captured city\'s menu, use RAZE or −1 LVL to tear down its buildings. Useful if you can\'t hold it.',
    events: ['city:buildings-changed'],
    bonus: true,
    match: (payload, ctx) => {
      const conqueredTick = ctx.state['conqueredTick'];
      if (typeof conqueredTick !== 'number') return false;
      return (payload as GameEventMap['city:buildings-changed']).tick > conqueredTick;
    },
  },
];
