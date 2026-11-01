/**
 * playerView — compact, fog-respecting text renderings of the game for an
 * automated (LLM) player: a JSON state snapshot and an ASCII map.
 *
 * Only what the local player could see on screen is included, so an agent
 * playing through this view gets no information a human wouldn't have.
 * Pure (no Phaser/DOM), so it is unit-testable.
 */

import type { GameState } from '@/managers/GameState';
import type { MovementSystem } from '@/systems/movement/MovementSystem';
import type { DiplomacySystem } from '@/systems/diplomacy/DiplomacySystem';
import type { VisionSystem, VisionResult } from '@/systems/vision/VisionSystem';
import type {
  SavedBattleState, SavedSiegeState, SavedTerritoryBattleState,
} from '@/types/gameSetup';
import type { GridCoordinates } from '@/types/common';
import type { Unit } from '@/entities/units/Unit';
import { TerrainType } from '@/systems/grid/Territory';
import { ResourceType } from '@/systems/resources/ResourceType';
import { getMoraleBand } from '@/systems/morale/moraleRules';
import { TECH_MAP } from '@/systems/research/TechTree';
import type { TechId } from '@/systems/research/TechTree';

export interface ViewContext {
  gameState:        GameState;
  tick:             number;
  viewerNationId:   string;
  /** null when the viewer sees the whole map (sandbox, tutorial). */
  vision:           VisionResult | null;
  visionSystem:     VisionSystem;
  movementSystem:   MovementSystem;
  diplomacySystem:  DiplomacySystem;
  battles:          readonly SavedBattleState[];
  sieges:           readonly SavedSiegeState[];
  territoryBattles: readonly SavedTerritoryBattleState[];
}

type Pos = [number, number];
const pos = (p: GridCoordinates): Pos => [p.row, p.col];
const key = (p: GridCoordinates): string => `${p.row},${p.col}`;

/** Stable per-game digit for each other nation, shared by the ASCII map and the nations list. */
function nationDigits(ctx: ViewContext): Map<string, string> {
  const digits = new Map<string, string>();
  ctx.gameState.getAllNations()
    .map(n => n.getId())
    .filter(id => id !== ctx.viewerNationId)
    .forEach((id, i) => digits.set(id, String((i + 1) % 10)));
  return digits;
}

function isTileVisible(ctx: ViewContext, p: GridCoordinates): boolean {
  return ctx.vision === null || ctx.vision.visible.has(key(p));
}

/** Seen at some point (the game keeps drawing terrain, borders and city sprites there). */
function isTileDiscovered(ctx: ViewContext, p: GridCoordinates): boolean {
  return ctx.vision === null || ctx.vision.discovered.has(key(p)) || ctx.vision.visible.has(key(p));
}

/**
 * Whole ticks left, rounded up. Speed bonuses make tick counters fractional
 * (e.g. 335.99999999999454); the epsilon keeps such float noise from rounding
 * up to an extra tick.
 */
export function ticksLeft(n: number): number {
  return Math.max(0, Math.ceil(n - 1e-6));
}

/** `"the_wheel — The Wheel"`: the id (what commands take) plus the display name. */
export function techLabel(id: TechId): string {
  const name = TECH_MAP.get(id)?.name;
  return name && name !== id ? `${id} — ${name}` : id;
}

function unitVisibility(ctx: ViewContext, unit: Unit): 'visible' | 'near' | 'hidden' {
  if (unit.getOwnerId() === ctx.viewerNationId) return 'visible';
  if (ctx.vision === null) return unit.isSpy() ? 'hidden' : 'visible';
  return ctx.visionSystem.unitVisibility(
    unit, ctx.vision.visible, ctx.vision.nearVisible, ctx.gameState, ctx.viewerNationId,
  );
}

/** JSON-serializable snapshot of what the local player can currently see. */
export function buildPlayerView(ctx: ViewContext) {
  const gs = ctx.gameState;
  const me = gs.getNation(ctx.viewerNationId);
  const grid = gs.getGrid();

  const resources: Record<string, number> = {};
  if (me) for (const t of Object.values(ResourceType)) resources[t] = Math.floor(me.getTreasury().getAmount(t));

  const myUnitIds = new Set(gs.getUnitsByNation(ctx.viewerNationId).map(u => u.id));

  const units = gs.getUnitsByNation(ctx.viewerNationId).map(u => {
    const move = ctx.movementSystem.getState(u.id);
    const dest = move && move.path.length > 0 ? move.path[move.path.length - 1] : undefined;
    return {
      id:     u.id,
      name:   u.getFullName(),
      type:   u.getUnitType(),
      at:     pos(u.position),
      hp:     `${Math.ceil(u.getHealth())}/${u.getMaxHealth()}`,
      morale: `${getMoraleBand(u.getMorale())} ${Math.round(u.getMorale())}`,
      stance: u.getBattleOrder(),
      rank:   u.getRankLabel(),
      ...(dest ? { movingTo: pos(dest), stepsLeft: move!.path.length } : {}),
      ...(u.isEngagedInBattle() ? { inCombat: true } : {}),
      ...(u.isSpy() ? { spy: true } : {}),
    };
  });

  const cities = gs.getCitiesByNation(ctx.viewerNationId).map(c => {
    const order = c.getCurrentOrder();
    return {
      id:        c.id,
      name:      c.getName(),
      at:        pos(c.position),
      hp:        `${Math.ceil(c.getHealth())}/${c.getMaxHealth()}`,
      buildings: c.getBuildings().map(b => `${b}:${c.getBuildingLevel(b)}`),
      producing: order ? `${order.label} (${ticksLeft(order.ticksRemaining)}/${ticksLeft(order.ticksTotal)}t left)` : null,
      queue:     c.getQueue().map(o => o.label),
      ...(c.isRazing() ? { razing: true } : {}),
    };
  });

  const myTiles = grid.getTerritoriesByNation(ctx.viewerNationId);
  const constructing = myTiles
    .filter(t => t.getCurrentConstruction())
    .map(t => {
      const c = t.getCurrentConstruction()!;
      return { at: pos(t.getCoordinates()), building: c.label, ticksLeft: ticksLeft(c.ticksRemaining) };
    });

  const visibleEnemies: Array<Record<string, unknown>> = [];
  const contacts: Pos[] = [];
  for (const u of gs.getAllUnits()) {
    if (myUnitIds.has(u.id)) continue;
    const vis = unitVisibility(ctx, u);
    if (vis === 'visible') {
      visibleEnemies.push({
        id: u.id, owner: u.getOwnerId(), type: u.getUnitType(), at: pos(u.position),
        hp: `${Math.ceil(u.getHealth())}/${u.getMaxHealth()}`,
        ...(u.isEngagedInBattle() ? { inCombat: true } : {}),
      });
    } else if (vis === 'near') {
      contacts.push(pos(u.position));
    }
  }

  // Like the game, foreign cities stay on the map once their tile is discovered.
  // Out of sight the game draws only the sprite and name, so owner/hp are left out.
  const foreignCities = gs.getAllCities()
    .filter(c => c.getOwnerId() !== ctx.viewerNationId && isTileDiscovered(ctx, c.position))
    .map(c => isTileVisible(ctx, c.position)
      ? {
        id: c.id, name: c.getName(), at: pos(c.position), visible: true as const,
        owner: c.getOwnerId(), hp: `${Math.ceil(c.getHealth())}/${c.getMaxHealth()}`,
      }
      : { id: c.id, name: c.getName(), at: pos(c.position), visible: false as const });

  const digits = nationDigits(ctx);
  const nations = (me ? gs.getKnownNationIds(ctx.viewerNationId) : [])
    .filter(id => id !== ctx.viewerNationId)
    .map(id => {
      const n = gs.getNation(id);
      const cooldown = ctx.diplomacySystem.getPeaceCooldownRemaining(ctx.viewerNationId, id, ctx.tick);
      return {
        id, name: n?.getName() ?? id, mapDigit: digits.get(id) ?? '*',
        relation: me?.getRelation(id) ?? 'UNKNOWN',
        ...(cooldown > 0 ? { peaceCooldownTicks: cooldown } : {}),
      };
    });

  const involvesMe = (...unitIds: string[]): boolean => unitIds.some(id => myUnitIds.has(id));
  const combat = {
    battles: ctx.battles
      .filter(b => involvesMe(b.unitAId, b.unitBId) || isTileVisible(ctx, b.position))
      .map(b => ({ at: pos(b.position), units: [b.unitAId, b.unitBId], rounds: b.roundsElapsed })),
    sieges: ctx.sieges
      .filter(s => involvesMe(s.unitId) || gs.getCity(s.cityId)?.getOwnerId() === ctx.viewerNationId || isTileVisible(ctx, s.position))
      .map(s => ({ at: pos(s.position), unit: s.unitId, city: s.cityId, rounds: s.roundsElapsed })),
    territoryBattles: ctx.territoryBattles
      .filter(t => involvesMe(t.unitId) || isTileVisible(ctx, t.position))
      .map(t => ({ at: pos(t.position), unit: t.unitId, rounds: t.roundsElapsed })),
  };

  const current = me?.getCurrentResearch() ?? null;
  return {
    tick:     ctx.tick,
    me: {
      nationId:  ctx.viewerNationId,
      name:      me?.getName() ?? '(defeated)',
      resources,
      research: {
        current:    current ? `${techLabel(current.techId)} (${ticksLeft(current.ticksRemaining)}t left)` : null,
        queue:      me ? [...me.getResearchQueue()] : [],
        researched: me ? [...me.getResearchedTechs()] : [],
      },
      territoryTiles: myTiles.length,
    },
    cities,
    units,
    constructing,
    visibleEnemies,
    contacts,
    foreignCities,
    nations,
    combat,
    defeatedNations: gs.getDefeatedNations().map(d => d.name),
  };
}

const TERRAIN_CHAR: Record<TerrainType, string> = {
  [TerrainType.PLAINS]:      '.',
  [TerrainType.FOREST]:      'f',
  [TerrainType.SNOW_FOREST]: 's',
  [TerrainType.MOUNTAIN]:    '^',
  [TerrainType.WATER]:       '~',
  [TerrainType.DESERT]:      'd',
};

export const MAP_LEGEND = [
  'Each tile is 2 chars: [owner][content]. Rows top→bottom, cols left→right; labels are row/col indices.',
  'owner: @ = mine, 1-9 = other nation (its mapDigit in state().nations), space = unowned, ` = not currently visible',
  'content: terrain . plains  f forest  s snow forest  ^ mountain  ~ water  d desert',
  '         C my city  K foreign city (also out of sight, once discovered)  U my unit  E foreign unit',
  '         ? unidentified contact  # never seen',
].join('\n');

/**
 * ASCII map of the area around `center` (default: whole map), fog applied.
 * Units draw over cities, which draw over terrain.
 */
export function renderAsciiMap(ctx: ViewContext, opts: { center?: GridCoordinates; radius?: number } = {}): string {
  const gs = ctx.gameState;
  const grid = gs.getGrid();
  const { rows, cols } = grid.getSize();
  const r0 = opts.center && opts.radius !== undefined ? Math.max(0, opts.center.row - opts.radius) : 0;
  const r1 = opts.center && opts.radius !== undefined ? Math.min(rows - 1, opts.center.row + opts.radius) : rows - 1;
  const c0 = opts.center && opts.radius !== undefined ? Math.max(0, opts.center.col - opts.radius) : 0;
  const c1 = opts.center && opts.radius !== undefined ? Math.min(cols - 1, opts.center.col + opts.radius) : cols - 1;

  const nationIndex = nationDigits(ctx);

  const unitAt = new Map<string, string>();
  for (const u of gs.getAllUnits()) {
    const vis = unitVisibility(ctx, u);
    const k = key(u.position);
    if (vis === 'visible') unitAt.set(k, u.getOwnerId() === ctx.viewerNationId ? 'U' : 'E');
    else if (vis === 'near' && !unitAt.has(k)) unitAt.set(k, '?');
  }

  const lines: string[] = [];
  const colLabel = (c: number): string => String(c % 100).padStart(2, ' ');
  let header = '    ';
  for (let c = c0; c <= c1; c++) header += colLabel(c);
  lines.push(header);

  for (let r = r0; r <= r1; r++) {
    let line = String(r).padStart(3, ' ') + ' ';
    for (let c = c0; c <= c1; c++) {
      const p = { row: r, col: c };
      const k = key(p);
      const visible = isTileVisible(ctx, p);
      const discovered = ctx.vision === null || ctx.vision.discovered.has(k) || visible;
      const t = grid.getTerritory(p);
      if (!t || !discovered) {
        line += unitAt.get(k) === '?' ? ' ?' : ' #';
        continue;
      }
      let owner = '`';
      if (visible) {
        const holder = t.getControllingNation();
        owner = holder === null ? ' ' : holder === ctx.viewerNationId ? '@' : (nationIndex.get(holder) ?? '*');
      }
      let content = TERRAIN_CHAR[t.getTerrainType()];
      const cityId = t.getCityId();
      if (cityId) {
        // Discovered here, and the game draws city sprites on every discovered tile.
        const city = gs.getCity(cityId);
        if (city) content = city.getOwnerId() === ctx.viewerNationId ? 'C' : 'K';
      }
      const u = unitAt.get(k);
      if (u) content = u;
      line += owner + content;
    }
    lines.push(line);
  }
  return lines.join('\n');
}
