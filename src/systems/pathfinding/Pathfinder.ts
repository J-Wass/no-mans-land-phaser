/**
 * A* pathfinder over the game grid.
 * Cost = terrain-weighted ticks (stepCost). Heuristic = Manhattan distance.
 * Returns the path as steps from (exclusive of) start to (inclusive of) dest.
 * Returns null if the destination is unreachable or impassable.
 */

import type { EntityId, GridCoordinates } from '@/types/common';
import type { Grid } from '@/systems/grid/Grid';
import { coordsToKey } from '@/systems/grid/Grid';
import type { UnitType, UnitStats } from '@/entities/units/Unit';
import { stepCost, WHEEL_SPEED_MULTIPLIER } from '@/systems/movement/MovementCosts';
import type { GameState } from '@/managers/GameState';

/** Extra cost added per tile when entering another (non-allied) nation's territory. */
const ENEMY_TERRITORY_PENALTY = 12;

/**
 * Entering a tile held by a friendly unit that won't make way (fighting, or
 * stuck mid-order) costs this many extra steps' worth of that tile. Idle
 * friendlies aren't penalised: the mover swaps places with them. Detours of up
 * to ~3 extra steps are preferred over the blocked tile.
 */
const STATIONARY_FRIENDLY_STEP_PENALTY = 3;

/** What the pathfinder needs to know about in-flight movement (MovementSystem implements it). */
export interface MovementLookup {
  /** True while the unit is following a path and not stuck waiting behind a friendly. */
  isAdvancing(unitId: EntityId): boolean;
  /** True while the unit has a movement order at all (advancing or stuck). */
  isMoving(unitId: EntityId): boolean;
}

export interface FindPathOptions {
  /**
   * Treat tiles held by the owner's stationary units as impassable instead of
   * merely expensive (the destination excepted). Used to re-path a unit that is
   * already stuck behind one.
   */
  avoidParkedFriendlies?: boolean;
}

interface AStarNode {
  coords: GridCoordinates;
  g: number;        // cost from start
  f: number;        // g + heuristic
  parent: AStarNode | null;
}

function heuristic(a: GridCoordinates, b: GridCoordinates): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

export class Pathfinder {
  /**
   * @param movement Optional in-flight movement lookup. With it, friendly units that are
   *   on the move are pathed through freely (they'll clear); without it every friendly
   *   unit counts as stationary.
   */
  constructor(private grid: Grid, private readonly movement?: MovementLookup) {}

  /**
   * Find the lowest-cost path from `from` to `to` for a unit with the given type and stats.
   *
   * If `ownerNationId` and `gameState` are provided, entering enemy-controlled tiles
   * carries an extra penalty so the path naturally avoids them when a detour is reasonable.
   * Likewise, tiles held by the owner's own *stationary* units (parked, fighting, or
   * stuck) are penalised so the path goes around them when it reasonably can. The
   * destination itself is never penalised.
   *
   * @returns Array of GridCoordinates (excluding start, including dest),
   *          or null if no path exists.
   */
  public findPath(
    from: GridCoordinates,
    to: GridCoordinates,
    unitType: UnitType,
    stats: UnitStats,
    ownerNationId?: string,
    gameState?: GameState,
    options: FindPathOptions = {},
  ): GridCoordinates[] | null {
    const destTerritory = this.grid.getTerritory(to);
    if (!destTerritory) return null;

    const ownerDeposits = ownerNationId && gameState
      ? gameState.getNationActiveDeposits(ownerNationId)
      : undefined;
    const ownerCounts = ownerNationId && gameState
      ? gameState.getNationActiveDepositCounts(ownerNationId)
      : undefined;
    const ownerNation = ownerNationId && gameState ? gameState.getNation(ownerNationId) : null;
    const hasWheel = !!ownerNationId && !!gameState
      && (gameState.getNation(ownerNationId)?.hasResearched('the_wheel') ?? false);
    const ownerSpeedMult = hasWheel ? WHEEL_SPEED_MULTIPLIER : 1;
    const destCost = stepCost(destTerritory.getTerrainType(), unitType, stats, ownerDeposits, ownerCounts, ownerSpeedMult);
    if (!isFinite(destCost)) return null;

    // Tiles held by our own units that won't make way: fighting, or stuck
    // mid-order. Advancing units clear by themselves and idle ones swap places
    // with the mover. Without a movement lookup every friendly counts.
    const parkedFriendlyKeys = new Set<string>();
    if (ownerNationId && gameState) {
      for (const unit of gameState.getUnitsByNation(ownerNationId)) {
        if (!unit.isAlive()) continue;
        if (unit.position.row === from.row && unit.position.col === from.col) continue;
        if (this.movement && !unit.isEngagedInBattle()) {
          if (this.movement.isAdvancing(unit.id) || !this.movement.isMoving(unit.id)) continue;
        }
        parkedFriendlyKeys.add(coordsToKey(unit.position));
      }
    }
    const destKey = coordsToKey(to);

    const open: AStarNode[] = [];
    const closed = new Set<string>();
    const gScore = new Map<string, number>();

    const startNode: AStarNode = {
      coords: from,
      g: 0,
      f: heuristic(from, to),
      parent: null,
    };

    open.push(startNode);
    gScore.set(coordsToKey(from), 0);

    while (open.length > 0) {
      // Find node with lowest f score (simple linear scan — fine for ≤30×30 grids)
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        const node = open[i];
        const best = open[bestIdx];
        if (node !== undefined && best !== undefined && node.f < best.f) {
          bestIdx = i;
        }
      }

      const current = open.splice(bestIdx, 1)[0];
      if (current === undefined) break;

      const currentKey = coordsToKey(current.coords);

      if (current.coords.row === to.row && current.coords.col === to.col) {
        // Reconstruct path (exclude start, include dest)
        const path: GridCoordinates[] = [];
        let node: AStarNode | null = current;
        while (node !== null && !(node.coords.row === from.row && node.coords.col === from.col)) {
          path.unshift(node.coords);
          node = node.parent;
        }
        return path;
      }

      closed.add(currentKey);

      const neighbors = this.grid.getNeighbors(current.coords);
      for (const neighbor of neighbors) {
        const neighborCoords = neighbor.getCoordinates();
        const neighborKey = coordsToKey(neighborCoords);

        if (closed.has(neighborKey)) continue;
        const parkedFriendly = neighborKey !== destKey && parkedFriendlyKeys.has(neighborKey);
        if (parkedFriendly && options.avoidParkedFriendlies) continue;

        const terrain = neighbor.getTerrainType();
        let cost = stepCost(terrain, unitType, stats, ownerDeposits, ownerCounts, ownerSpeedMult);
        if (!isFinite(cost)) continue; // impassable

        // Penalise foreign (non-allied) tiles so the path prefers to go around them.
        if (ownerNationId && gameState) {
          const tOwner = neighbor.getControllingNation();
          if (tOwner && tOwner !== ownerNationId && !(ownerNation?.isAlly(tOwner) ?? false)) {
            cost += ENEMY_TERRITORY_PENALTY;
          }
        }

        // Prefer going around our own parked units (they block the tile indefinitely).
        if (parkedFriendly) cost += cost * STATIONARY_FRIENDLY_STEP_PENALTY;

        const tentativeG = current.g + cost;
        const existingG = gScore.get(neighborKey);

        if (existingG !== undefined && tentativeG >= existingG) continue;

        gScore.set(neighborKey, tentativeG);
        const neighborNode: AStarNode = {
          coords: neighborCoords,
          g: tentativeG,
          f: tentativeG + heuristic(neighborCoords, to),
          parent: current,
        };
        open.push(neighborNode);
      }
    }

    return null; // no path found
  }
}
