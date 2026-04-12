/**
 * A* pathfinder over the game grid.
 * Cost = terrain-weighted ticks (stepCost). Heuristic = Manhattan distance.
 * Returns the path as steps from (exclusive of) start to (inclusive of) dest.
 * Returns null if the destination is unreachable or impassable.
 */

import type { GridCoordinates } from '@/types/common';
import type { Grid } from '@/systems/grid/Grid';
import { coordsToKey } from '@/systems/grid/Grid';
import type { UnitType, UnitStats } from '@/entities/units/Unit';
import { stepCost } from '@/systems/movement/MovementCosts';

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
  constructor(private grid: Grid) {}

  /**
   * Find the lowest-cost path from `from` to `to` for a unit
   * with the given type and stats.
   *
   * @returns Array of GridCoordinates (excluding start, including dest),
   *          or null if no path exists.
   */
  public findPath(
    from: GridCoordinates,
    to: GridCoordinates,
    unitType: UnitType,
    stats: UnitStats
  ): GridCoordinates[] | null {
    const destTerritory = this.grid.getTerritory(to);
    if (!destTerritory) return null;

    const destCost = stepCost(destTerritory.getTerrainType(), unitType, stats);
    if (!isFinite(destCost)) return null;

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

        const terrain = neighbor.getTerrainType();
        const cost = stepCost(terrain, unitType, stats);
        if (!isFinite(cost)) continue; // impassable

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
