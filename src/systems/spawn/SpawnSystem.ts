/**
 * SpawnSystem — pure algorithmic helpers for generating initial game state.
 * Extracted from BootScene so this logic is independently testable.
 */

import { TerrainType } from '@/systems/grid/Territory';
import type { Grid } from '@/systems/grid/Grid';
import type { GridCoordinates } from '@/types/common';
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';

export interface SpawnPair {
  infantry: GridCoordinates;
  scout:    GridCoordinates;
}

/**
 * Returns `count` spawn pairs chosen from coastal land tiles (tiles on the inner
 * edge of the water border, within `COAST_DEPTH` rows/cols of the map edge).
 *
 * Algorithm:
 *  1. Collect all passable coastal candidate tiles.
 *  2. Shuffle so the initial seed is random each game.
 *  3. Use greedy farthest-point sampling: each new spawn is the candidate
 *     furthest (Chebyshev distance) from the nearest already-placed spawn.
 *  4. For each chosen anchor tile, find an adjacent passable tile for the scout.
 */
export function pickCoastalSpawnPairs(grid: Grid, gridSize: number, count: number): SpawnPair[] {
  const COAST_DEPTH = 4; // tiles from the edge to consider "coastal"

  // 1. Collect passable coastal tiles
  const candidates: GridCoordinates[] = [];
  for (let r = 1; r < gridSize - 1; r++) {
    for (let c = 1; c < gridSize - 1; c++) {
      const isCoastal = r <= COAST_DEPTH || r >= gridSize - 1 - COAST_DEPTH
                     || c <= COAST_DEPTH || c >= gridSize - 1 - COAST_DEPTH;
      if (!isCoastal) continue;
      if (!isPassable(grid, { row: r, col: c })) continue;
      candidates.push({ row: r, col: c });
    }
  }

  if (candidates.length === 0) return [];

  // 2. Shuffle (Fisher-Yates) for randomness
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = tmp;
  }

  // 3. Greedy farthest-point sampling
  const anchors: GridCoordinates[] = [candidates[0]!];

  while (anchors.length < count) {
    let bestDist = -1;
    let bestPos: GridCoordinates | null = null;

    for (const cand of candidates) {
      if (anchors.some(a => a.row === cand.row && a.col === cand.col)) continue;

      const minDist = Math.min(...anchors.map(a => chebyshev(a, cand)));
      if (minDist > bestDist) {
        bestDist = minDist;
        bestPos  = cand;
      }
    }

    if (!bestPos) break;
    anchors.push(bestPos);
  }

  // 4. Attach a scout tile adjacent to each anchor
  return anchors.map(anchor => ({
    infantry: anchor,
    scout:    findAdjacentPassable(grid, anchor, gridSize, anchors) ?? anchor,
  }));
}

/**
 * Find 2 city positions near `anchor` that are:
 *  - on passable, unoccupied terrain
 *  - 2–5 tiles (Chebyshev) from the anchor
 *  - at least 3 tiles apart from each other
 */
export function findCityPositions(
  grid: Grid,
  anchor: GridCoordinates,
  taken: GridCoordinates[],
  gridSize: number,
): GridCoordinates[] {
  const candidates: GridCoordinates[] = [];
  for (let r = anchor.row - 5; r <= anchor.row + 5; r++) {
    for (let c = anchor.col - 5; c <= anchor.col + 5; c++) {
      if (r < 1 || r >= gridSize - 1 || c < 1 || c >= gridSize - 1) continue;
      const dist = chebyshev(anchor, { row: r, col: c });
      if (dist < 2 || dist > 5) continue;
      if (!isPassable(grid, { row: r, col: c })) continue;
      if (taken.some(t => t.row === r && t.col === c)) continue;
      candidates.push({ row: r, col: c });
    }
  }

  // Shuffle for variety
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = tmp;
  }

  const result: GridCoordinates[] = [];
  for (const cand of candidates) {
    if (result.length === 0) {
      result.push(cand);
      continue;
    }
    if (result.every(r => chebyshev(r, cand) >= 3)) {
      result.push(cand);
      if (result.length === 2) break;
    }
  }

  // Fallback: if we couldn't find 2 spread-apart tiles, just take the first 2 candidates
  if (result.length < 2 && candidates.length >= 2) {
    if (result.length === 0) result.push(candidates[0]!);
    const fallback = candidates.find(c => !(c.row === result[0]!.row && c.col === result[0]!.col));
    if (fallback) result.push(fallback);
  }

  return result;
}

/**
 * Claim an elliptical blob of passable territory for a nation.
 * Uses the ellipse formula: sum of distances to both city foci ≤ focal distance + OVAL_PADDING.
 * First-come-first-served — does not overwrite already-claimed tiles.
 */
export function assignStartingTerritory(
  grid: Grid,
  nationId: string,
  cities: GridCoordinates[],
  gridSize: number,
  options: { overwrite?: boolean } = {},
): void {
  const OVAL_PADDING = 2;

  if (cities.length === 0) return;

  const cityA = cities[0]!;
  const cityB = cities.length >= 2 ? cities[1]! : cityA;
  const focalDist = Math.sqrt(
    (cityA.row - cityB.row) ** 2 + (cityA.col - cityB.col) ** 2,
  );

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const territory = grid.getTerritory({ row: r, col: c });
      if (!territory) continue;
      if (territory.getControllingNation() && !options.overwrite) continue;
      const terrain = territory.getTerrainType();

      const dA = Math.sqrt((r - cityA.row) ** 2 + (c - cityA.col) ** 2);
      const dB = Math.sqrt((r - cityB.row) ** 2 + (c - cityB.col) ** 2);
      if (dA + dB <= focalDist + OVAL_PADDING) {
        territory.setControllingNation(nationId);
        // Only passable tiles get an outpost — units can't garrison water or mountains.
        const passable = terrain !== TerrainType.WATER && terrain !== TerrainType.MOUNTAIN;
        if (passable && !territory.hasBuilding(TerritoryBuildingType.OUTPOST)) {
          territory.addBuilding(TerritoryBuildingType.OUTPOST);
        }
      }
    }
  }
}

/** Chebyshev distance (diagonal counts as 1). */
export function chebyshev(a: GridCoordinates, b: GridCoordinates): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

export function isPassable(grid: Grid, coords: GridCoordinates): boolean {
  const territory = grid.getTerritory(coords);
  if (!territory) return false;
  const t = territory.getTerrainType();
  return t !== TerrainType.WATER && t !== TerrainType.MOUNTAIN;
}

/**
 * Find a passable tile orthogonally adjacent to `origin` that isn't already
 * an infantry anchor, rotating through N/E/S/W with a random starting direction.
 */
export function findAdjacentPassable(
  grid: Grid,
  origin: GridCoordinates,
  gridSize: number,
  takenAnchors: GridCoordinates[],
): GridCoordinates | null {
  const offsets = [
    { row: 0, col: 1 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: -1, col: 0 },
  ];

  const start = Math.floor(Math.random() * offsets.length);

  for (let i = 0; i < offsets.length; i++) {
    const off = offsets[(start + i) % offsets.length]!;
    const candidate: GridCoordinates = { row: origin.row + off.row, col: origin.col + off.col };

    if (candidate.row < 1 || candidate.row >= gridSize - 1) continue;
    if (candidate.col < 1 || candidate.col >= gridSize - 1) continue;
    if (!isPassable(grid, candidate)) continue;
    if (takenAnchors.some(a => a.row === candidate.row && a.col === candidate.col)) continue;

    return candidate;
  }

  return null;
}
