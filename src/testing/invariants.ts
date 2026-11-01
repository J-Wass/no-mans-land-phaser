/**
 * invariants — rules that must hold between any two ticks of a game.
 *
 * Pure functions over the simulation (no Phaser, no DOM) so they run both in
 * the browser test harness after every advance and in Jest. A violation is
 * strong evidence of a bug; `warn` marks rules with known legitimate
 * exceptions that still deserve a look.
 */

import type { GameState } from '@/managers/GameState';
import type {
  SavedBattleState, SavedSiegeState, SavedTerritoryBattleState,
} from '@/types/gameSetup';
import { TerrainType } from '@/systems/grid/Territory';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import { ResourceType } from '@/systems/resources/ResourceType';
import { TECH_MAP } from '@/systems/research/TechTree';
import type { TechId } from '@/systems/research/TechTree';

export interface Violation {
  /** Stable rule id, e.g. `engaged-without-battle`. */
  rule:     string;
  severity: 'error' | 'warn';
  message:  string;
  /** Entity ids involved, for cross-referencing with state(). */
  entities: string[];
}

export interface InvariantContext {
  gameState:        GameState;
  battles:          readonly SavedBattleState[];
  sieges:           readonly SavedSiegeState[];
  territoryBattles: readonly SavedTerritoryBattleState[];
  /** Unit ids that currently hold a movement order. */
  movingUnitIds:    Iterable<string>;
}

const at = (p: { row: number; col: number }): string => `(${p.row},${p.col})`;

export function checkInvariants(ctx: InvariantContext): Violation[] {
  const out: Violation[] = [];
  const add = (rule: string, severity: Violation['severity'], message: string, entities: string[] = []): void => {
    out.push({ rule, severity, message, entities });
  };

  const gs = ctx.gameState;
  const grid = gs.getGrid();
  const nationIds = new Set(gs.getAllNations().map(n => n.getId()));
  const defeatedIds = new Set(gs.getDefeatedNations().map(d => d.id));

  // ── Non-finite numbers anywhere in the serialized state ───────────────────
  scanNonFinite(gs.toJSON(), 'state', (path) =>
    add('non-finite-number', 'error', `Non-finite number at ${path}`));

  // ── Units ─────────────────────────────────────────────────────────────────
  const engagedIds = new Set<string>();
  for (const b of ctx.battles) { engagedIds.add(b.unitAId); engagedIds.add(b.unitBId); }
  for (const s of ctx.sieges) engagedIds.add(s.unitId);
  for (const t of ctx.territoryBattles) engagedIds.add(t.unitId);

  const tileOccupants = new Map<string, string[]>();
  for (const unit of gs.getAllUnits()) {
    const id = unit.id;
    const pos = unit.position;
    const owner = unit.getOwnerId();

    if (!nationIds.has(owner)) {
      add('orphan-unit', 'error',
        `Unit ${id} belongs to ${defeatedIds.has(owner) ? 'defeated' : 'unknown'} nation ${owner}`, [id, owner]);
    }
    if (!grid.isValidCoordinate(pos)) {
      add('unit-out-of-bounds', 'error', `Unit ${id} is outside the grid at ${at(pos)}`, [id]);
      continue;
    }
    const hp = unit.getHealth();
    if (hp <= 0 || hp > unit.getMaxHealth()) {
      add('unit-hp-range', 'error', `Unit ${id} has HP ${hp}/${unit.getMaxHealth()} but is still on the map`, [id]);
    }

    const terrain = grid.getTerritory(pos)?.getTerrainType();
    if (terrain === TerrainType.WATER || terrain === TerrainType.MOUNTAIN) {
      const mana = terrain === TerrainType.WATER ? TerritoryResourceType.WATER_MANA : TerritoryResourceType.EARTH_MANA;
      if (!gs.getNationActiveDeposits(owner).has(mana)) {
        // Legitimate if the nation lost its mana mine while the unit stood there.
        add('unit-on-impassable', 'warn',
          `Unit ${id} stands on ${terrain} at ${at(pos)} without an active ${mana} mine`, [id]);
      }
    }

    if (unit.isEngagedInBattle() && !engagedIds.has(id)) {
      add('engaged-without-battle', 'error',
        `Unit ${id} is flagged engagedInBattle but no battle, siege or territory battle references it (it can never act again)`, [id]);
    }
    if (!unit.isEngagedInBattle() && engagedIds.has(id)) {
      add('battle-without-engaged', 'warn', `Unit ${id} is in a combat record but not flagged engagedInBattle`, [id]);
    }

    const key = `${owner}@${pos.row},${pos.col}`;
    const list = tileOccupants.get(key) ?? [];
    list.push(id);
    tileOccupants.set(key, list);
  }
  for (const [key, ids] of tileOccupants) {
    if (ids.length > 1) {
      add('friendly-stack', 'warn', `${ids.length} units of one nation share a tile (${key}): ${ids.join(', ')}`, ids);
    }
  }

  for (const id of ctx.movingUnitIds) {
    if (!gs.getUnit(id)) add('movement-for-missing-unit', 'error', `Movement order exists for missing unit ${id}`, [id]);
  }

  // ── Combat records ────────────────────────────────────────────────────────
  const atWar = (a: string, b: string): boolean => gs.getNation(a)?.isAtWar(b) ?? false;

  for (const b of ctx.battles) {
    const ua = gs.getUnit(b.unitAId);
    const ub = gs.getUnit(b.unitBId);
    if (!ua || !ub) {
      add('battle-missing-unit', 'error', `Battle ${b.id} references a missing unit (${b.unitAId} vs ${b.unitBId})`, [b.unitAId, b.unitBId]);
      continue;
    }
    if (ua.getOwnerId() === ub.getOwnerId()) {
      add('battle-same-nation', 'error', `Battle ${b.id} is between two units of ${ua.getOwnerId()}`, [ua.id, ub.id]);
    } else if (!atWar(ua.getOwnerId(), ub.getOwnerId())) {
      add('battle-without-war', 'error',
        `Battle ${b.id} at ${at(b.position)} between ${ua.getOwnerId()} and ${ub.getOwnerId()}, who are not at war`, [ua.id, ub.id]);
    }
  }
  for (const s of ctx.sieges) {
    const unit = gs.getUnit(s.unitId);
    const city = gs.getCity(s.cityId);
    if (!unit || !city) {
      add('siege-missing-entity', 'error', `Siege ${s.id} references a missing unit or city (${s.unitId} → ${s.cityId})`, [s.unitId, s.cityId]);
      continue;
    }
    if (unit.getOwnerId() === city.getOwnerId()) {
      add('siege-own-city', 'error', `Unit ${unit.id} is besieging its own nation's city ${city.id}`, [unit.id, city.id]);
    } else if (!atWar(unit.getOwnerId(), city.getOwnerId())) {
      add('siege-without-war', 'error',
        `Siege ${s.id}: ${unit.getOwnerId()} besieges ${city.getOwnerId()}'s city without being at war`, [unit.id, city.id]);
    }
  }
  for (const t of ctx.territoryBattles) {
    const unit = gs.getUnit(t.unitId);
    if (!unit) {
      add('territory-battle-missing-unit', 'error', `Territory battle ${t.id} references missing unit ${t.unitId}`, [t.unitId]);
      continue;
    }
    const holder = grid.getTerritory(t.position)?.getControllingNation() ?? null;
    if (holder && holder !== unit.getOwnerId() && !atWar(unit.getOwnerId(), holder)) {
      add('territory-battle-without-war', 'error',
        `Territory battle ${t.id} at ${at(t.position)}: ${unit.getOwnerId()} fights ${holder}'s tile without being at war`, [unit.id]);
    }
  }

  // ── Cities ────────────────────────────────────────────────────────────────
  for (const city of gs.getAllCities()) {
    const owner = city.getOwnerId();
    if (!nationIds.has(owner)) add('orphan-city', 'error', `City ${city.id} belongs to missing nation ${owner}`, [city.id, owner]);
    const hp = city.getHealth();
    if (hp < 0 || hp > city.getMaxHealth()) {
      add('city-hp-range', 'error', `City ${city.id} has HP ${hp}/${city.getMaxHealth()}`, [city.id]);
    }
    const tile = grid.getTerritory(city.position);
    if (!tile) {
      add('city-out-of-bounds', 'error', `City ${city.id} is outside the grid at ${at(city.position)}`, [city.id]);
      continue;
    }
    if (tile.getCityId() !== city.id) {
      add('city-tile-mismatch', 'error', `Tile ${at(city.position)} points at city ${tile.getCityId()} instead of ${city.id}`, [city.id]);
    }
    if (tile.getControllingNation() !== owner) {
      add('city-tile-owner', 'error',
        `City ${city.id} is owned by ${owner} but its tile ${at(city.position)} is controlled by ${tile.getControllingNation()}`, [city.id]);
    }
  }

  // ── Territory ─────────────────────────────────────────────────────────────
  for (const territory of grid.getAllTerritories()) {
    const holder = territory.getControllingNation();
    if (holder && !nationIds.has(holder)) {
      add('orphan-territory', 'error',
        `Tile ${at(territory.getCoordinates())} is controlled by ${defeatedIds.has(holder) ? 'defeated' : 'unknown'} nation ${holder}`, [holder]);
    }
    const cityId = territory.getCityId();
    if (cityId && !gs.getCity(cityId)) {
      add('tile-missing-city', 'error', `Tile ${at(territory.getCoordinates())} points at missing city ${cityId}`, [cityId]);
    }
  }

  // ── Nations ───────────────────────────────────────────────────────────────
  for (const nation of gs.getAllNations()) {
    const id = nation.getId();
    const treasury = nation.getTreasury();
    for (const type of Object.values(ResourceType)) {
      const amount = treasury.getAmount(type);
      if (amount < 0) add('negative-resource', 'error', `${id} has ${amount} ${type}`, [id]);
    }
    const current = nation.getCurrentResearch();
    if (current) {
      if (!TECH_MAP.has(current.techId)) add('unknown-tech', 'error', `${id} is researching unknown tech ${current.techId}`, [id]);
      if (nation.hasResearched(current.techId)) {
        add('research-repeat', 'error', `${id} is researching ${current.techId}, which it already has`, [id]);
      }
      if (current.ticksRemaining < 0 || current.ticksRemaining > current.ticksTotal) {
        add('research-progress', 'error',
          `${id} research ${current.techId} has ${current.ticksRemaining}/${current.ticksTotal} ticks remaining`, [id]);
      }
    }
    const queue = nation.getResearchQueue();
    for (const techId of queue) {
      if (!TECH_MAP.has(techId)) add('unknown-tech', 'error', `${id} has unknown tech ${techId} queued`, [id]);
    }
    if (new Set<TechId>(queue).size !== queue.length) {
      add('research-queue-duplicate', 'warn', `${id} has duplicate entries in its research queue`, [id]);
    }
    for (const [otherId, status] of nation.getAllRelations()) {
      const other = gs.getNation(otherId);
      if (other && other.getRelation(id) !== status) {
        add('asymmetric-relation', 'error',
          `${id} sees ${otherId} as ${status} but ${otherId} sees ${id} as ${other.getRelation(id)}`, [id, otherId]);
      }
    }
  }

  return out;
}

/** Deduplicate a list of violations by rule + message (the same bug repeats every tick). */
export function violationKey(v: Violation): string {
  return `${v.rule}|${v.message}`;
}

function scanNonFinite(value: unknown, path: string, report: (path: string) => void): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) report(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanNonFinite(v, `${path}[${i}]`, report));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) scanNonFinite(v, `${path}.${k}`, report);
  }
}
