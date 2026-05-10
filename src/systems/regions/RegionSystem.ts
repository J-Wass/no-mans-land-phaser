/**
 * RegionSystem — detects named geographic regions (contiguous terrain clusters)
 * and tracks which nation dominates each one.
 *
 * A nation that controls ≥66% of a region's tiles earns bonus resources from
 * those tiles each production tick.
 */

import type { Grid } from '@/systems/grid/Grid';
import type { GameState } from '@/managers/GameState';
import { TerrainType } from '@/systems/grid/Territory';
import { ResourceType } from '@/systems/resources/ResourceType';
import type { GridCoordinates } from '@/types/common';

export const REGION_CONTROL_THRESHOLD = 0.66;
const MIN_REGION_SIZE = 8;

export interface Region {
  id:      string;
  name:    string;
  terrain: TerrainType;
  tiles:   GridCoordinates[];
}

/** Resource granted per region control, and the tick interval. */
export const REGION_BONUS_INTERVAL = 50;

export function regionBonusResource(terrain: TerrainType): ResourceType | null {
  switch (terrain) {
    case TerrainType.PLAINS:  return ResourceType.FOOD;
    case TerrainType.FOREST:  return ResourceType.RAW_MATERIAL;
    case TerrainType.SNOW_FOREST:   return ResourceType.RAW_MATERIAL;
    case TerrainType.DESERT:  return ResourceType.GOLD;
    default:                  return null;
  }
}

/** Returns the bonus amount for controlling a region (scales with size). */
export function regionBonusAmount(region: Region): number {
  return Math.max(1, Math.floor(region.tiles.length / 3));
}

// ── Name generation ────────────────────────────────────────────────────────────

const ADJECTIVES = [
  'Ancient', 'Ashen', 'Bitter', 'Blazing', 'Crimson', 'Darkened', 'Dreary',
  'Emerald', 'Faded', 'Frozen', 'Gilded', 'Grim', 'Hallowed', 'Iron',
  'Jade', 'Lonely', 'Misty', 'Pale', 'Scarlet', 'Shadow', 'Silver',
  'Sunken', 'Twilight', 'Verdant', 'Weeping', 'Whispering', 'Withered',
];

const TERRAIN_NOUNS: Record<TerrainType, string[]> = {
  [TerrainType.PLAINS]:   ['Plains', 'Fields', 'Lowlands', 'Steppes', 'Meadows', 'Flats', 'Expanse'],
  [TerrainType.FOREST]:   ['Wood', 'Forest', 'Thicket', 'Grove', 'Timberland', 'Wilds', 'Canopy'],
  [TerrainType.SNOW_FOREST]: ['Snowwood', 'Frostwood', 'Winter Glen', 'Snowpines', 'Frozen Wilds', 'Icewood', 'Coldwood'],
  [TerrainType.DESERT]:   ['Desert', 'Wastes', 'Sands', 'Barrens', 'Flats', 'Dunes', 'Expanse'],
  [TerrainType.MOUNTAIN]: ['Mountains', 'Peaks', 'Range', 'Crags', 'Heights', 'Ridges', 'Spires'],
  [TerrainType.WATER]:    ['Sea', 'Depths', 'Waters', 'Shallows'],
};

function deterministicHash(tiles: GridCoordinates[]): number {
  // Simple hash based on first tile position — same map → same name
  const first = tiles[0];
  if (!first) return 0;
  let h = (first.row * 31 + first.col) * 17;
  h = ((h >>> 0) * 2654435761) >>> 0; // Knuth multiplicative hash
  return h;
}

function pickName(terrain: TerrainType, hash: number, usedNames: Set<string>): string {
  const nouns = TERRAIN_NOUNS[terrain];
  const adjLen = ADJECTIVES.length;
  const nounLen = nouns.length;

  for (let offset = 0; offset < adjLen * nounLen; offset++) {
    const adj  = ADJECTIVES[(hash + offset) % adjLen]!;
    const noun = nouns[(Math.floor((hash + offset) / adjLen)) % nounLen]!;
    const name = `${adj} ${noun}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  // Fallback: number suffix
  const base = `${ADJECTIVES[hash % adjLen]} ${nouns[hash % nounLen]}`;
  let i = 2;
  while (usedNames.has(`${base} ${i}`)) i++;
  const name = `${base} ${i}`;
  usedNames.add(name);
  return name;
}

// ── RegionSystem ───────────────────────────────────────────────────────────────

export class RegionSystem {
  private regions:     Map<string, Region>   = new Map();
  private tileToRegion: Map<string, string>  = new Map(); // "row,col" → regionId

  /** Build regions from a grid via flood fill. Call once after the grid is populated. */
  public generateFromGrid(grid: Grid): void {
    this.regions.clear();
    this.tileToRegion.clear();

    const { rows, cols } = grid.getSize();
    const visited = new Set<string>();
    const usedNames = new Set<string>();
    let nextId = 1;

    const NAMED_TERRAINS = new Set<TerrainType>([
      TerrainType.PLAINS, TerrainType.FOREST, TerrainType.SNOW_FOREST,
      TerrainType.DESERT, TerrainType.MOUNTAIN,
    ]);

    const key = (r: number, c: number) => `${r},${c}`;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = key(r, c);
        if (visited.has(k)) continue;
        const territory = grid.getTerritory({ row: r, col: c });
        if (!territory) continue;
        const terrain = territory.getTerrainType();
        if (!NAMED_TERRAINS.has(terrain)) { visited.add(k); continue; }

        // BFS flood fill for this terrain type
        const tiles: GridCoordinates[] = [];
        const queue: GridCoordinates[] = [{ row: r, col: c }];
        visited.add(k);

        while (queue.length > 0) {
          const pos = queue.shift()!;
          tiles.push(pos);

          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
            const nr = pos.row + dr;
            const nc = pos.col + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            const nk = key(nr, nc);
            if (visited.has(nk)) continue;
            const nbr = grid.getTerritory({ row: nr, col: nc });
            if (!nbr || nbr.getTerrainType() !== terrain) continue;
            visited.add(nk);
            queue.push({ row: nr, col: nc });
          }
        }

        if (tiles.length < MIN_REGION_SIZE) continue;

        const hash = deterministicHash(tiles);
        const name = pickName(terrain, hash, usedNames);
        const id   = `region-${nextId++}`;
        const region: Region = { id, name, terrain, tiles };
        this.regions.set(id, region);
        for (const tile of tiles) {
          this.tileToRegion.set(key(tile.row, tile.col), id);
        }
      }
    }
  }

  public getRegionAt(pos: GridCoordinates): Region | null {
    const id = this.tileToRegion.get(`${pos.row},${pos.col}`);
    return id ? (this.regions.get(id) ?? null) : null;
  }

  public getRegion(id: string): Region | null {
    return this.regions.get(id) ?? null;
  }

  public getAllRegions(): Region[] {
    return Array.from(this.regions.values());
  }

  /**
   * Returns the nationId that controls ≥66% of the region's tiles, or null.
   * Ownership is determined by the territory's controlling nation.
   */
  public getControllingNation(regionId: string, gameState: GameState): string | null {
    const region = this.regions.get(regionId);
    if (!region) return null;

    const counts = new Map<string, number>();
    for (const tile of region.tiles) {
      const ctrl = gameState.getGrid().getTerritory(tile)?.getControllingNation();
      if (ctrl) counts.set(ctrl, (counts.get(ctrl) ?? 0) + 1);
    }

    const threshold = Math.ceil(region.tiles.length * REGION_CONTROL_THRESHOLD);
    for (const [nationId, count] of counts) {
      if (count >= threshold) return nationId;
    }
    return null;
  }

  /**
   * Returns the nearest named region to `pos` (by minimum Manhattan distance to
   * any tile in that region), or null if nothing is within `maxDistance` tiles.
   * Uses centroid pre-filtering for performance.
   */
  public getNearestRegion(pos: GridCoordinates, maxDistance = 12): { region: Region; distance: number } | null {
    let best: { region: Region; distance: number } | null = null;

    for (const region of this.regions.values()) {
      // Fast centroid pre-filter
      const cx = region.tiles.reduce((s, t) => s + t.col, 0) / region.tiles.length;
      const cy = region.tiles.reduce((s, t) => s + t.row, 0) / region.tiles.length;
      const centroidDist = Math.abs(pos.row - cy) + Math.abs(pos.col - cx);
      if (centroidDist > maxDistance + region.tiles.length) continue; // can't possibly be close enough

      // Exact min-distance scan
      let minDist = Infinity;
      for (const tile of region.tiles) {
        const d = Math.abs(pos.row - tile.row) + Math.abs(pos.col - tile.col);
        if (d < minDist) minDist = d;
        if (minDist === 1) break; // can't get closer
      }

      if (minDist <= maxDistance && (best === null || minDist < best.distance)) {
        best = { region, distance: minDist };
      }
    }

    return best;
  }

  /** Returns what fraction (0–1) of the region a nation controls. */
  public getControlFraction(regionId: string, nationId: string, gameState: GameState): number {
    const region = this.regions.get(regionId);
    if (!region) return 0;
    const owned = region.tiles.filter(
      t => gameState.getGrid().getTerritory(t)?.getControllingNation() === nationId,
    ).length;
    return region.tiles.length > 0 ? owned / region.tiles.length : 0;
  }
}
