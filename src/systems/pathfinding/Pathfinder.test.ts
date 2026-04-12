import { describe, it, expect, beforeEach } from '@jest/globals';
import { Pathfinder } from './Pathfinder';
import { Grid } from '@/systems/grid/Grid';
import { TerrainType } from '@/systems/grid/Territory';
import { UnitType } from '@/entities/units/Unit';
import type { UnitStats } from '@/entities/units/Unit';

const infantryStats: UnitStats = {
  maxHealth: 100, meleeDamage: 10, rangedDamage: 0,
  armorType: 'light', speed: 2, attackRange: 1, vision: 1,
};

describe('Pathfinder', () => {
  let grid: Grid;
  let pathfinder: Pathfinder;

  beforeEach(() => {
    grid = new Grid({ rows: 5, cols: 5 });
    pathfinder = new Pathfinder(grid);
  });

  it('finds a direct path on an open grid', () => {
    const path = pathfinder.findPath(
      { row: 0, col: 0 },
      { row: 0, col: 3 },
      UnitType.INFANTRY,
      infantryStats
    );
    expect(path).not.toBeNull();
    // Last step should be destination
    expect(path?.[path.length - 1]).toEqual({ row: 0, col: 3 });
    // Path should not include start
    expect(path?.[0]).not.toEqual({ row: 0, col: 0 });
  });

  it('returns null when destination is WATER (impassable)', () => {
    grid.getTerritory({ row: 2, col: 2 })?.setTerrainType(TerrainType.WATER);
    const path = pathfinder.findPath(
      { row: 0, col: 0 },
      { row: 2, col: 2 },
      UnitType.INFANTRY,
      infantryStats
    );
    expect(path).toBeNull();
  });

  it('returns null when destination is MOUNTAIN (impassable)', () => {
    grid.getTerritory({ row: 1, col: 1 })?.setTerrainType(TerrainType.MOUNTAIN);
    const path = pathfinder.findPath(
      { row: 0, col: 0 },
      { row: 1, col: 1 },
      UnitType.INFANTRY,
      infantryStats
    );
    expect(path).toBeNull();
  });

  it('navigates around a WATER wall', () => {
    // Block col=2 from rows 0-3; row 4 stays open
    for (let r = 0; r <= 3; r++) {
      grid.getTerritory({ row: r, col: 2 })?.setTerrainType(TerrainType.WATER);
    }

    const path = pathfinder.findPath(
      { row: 0, col: 0 },
      { row: 0, col: 4 },
      UnitType.INFANTRY,
      infantryStats
    );

    expect(path).not.toBeNull();
    // Path must not pass through WATER column (col=2, rows 0-3)
    const illegal = path?.some(c => c.col === 2 && c.row <= 3);
    expect(illegal).toBe(false);
    // Destination reached
    expect(path?.[path.length - 1]).toEqual({ row: 0, col: 4 });
  });

  it('returns null when completely surrounded by impassable terrain', () => {
    // Surround (2,2) with WATER on all 4 sides
    grid.getTerritory({ row: 1, col: 2 })?.setTerrainType(TerrainType.WATER);
    grid.getTerritory({ row: 3, col: 2 })?.setTerrainType(TerrainType.WATER);
    grid.getTerritory({ row: 2, col: 1 })?.setTerrainType(TerrainType.WATER);
    grid.getTerritory({ row: 2, col: 3 })?.setTerrainType(TerrainType.WATER);

    const path = pathfinder.findPath(
      { row: 0, col: 0 },
      { row: 2, col: 2 },
      UnitType.INFANTRY,
      infantryStats
    );
    expect(path).toBeNull();
  });

  it('returns empty array when already at destination', () => {
    const path = pathfinder.findPath(
      { row: 2, col: 2 },
      { row: 2, col: 2 },
      UnitType.INFANTRY,
      infantryStats
    );
    expect(path).toEqual([]);
  });

  it('prefers cheaper terrain (plains over forest) when both reach the goal', () => {
    // Row 0: all FOREST (expensive), row 1: PLAINS (cheap)
    // Start (0,0) -> dest (0,4): going via row 1 is cheaper
    for (let c = 1; c <= 4; c++) {
      grid.getTerritory({ row: 0, col: c })?.setTerrainType(TerrainType.FOREST);
    }

    const path = pathfinder.findPath(
      { row: 0, col: 0 },
      { row: 0, col: 4 },
      UnitType.INFANTRY,
      infantryStats
    );
    expect(path).not.toBeNull();
    // Path should go through row 1 (plains) rather than staying on row 0 (forest)
    const usesRow1 = path?.some(c => c.row === 1);
    expect(usesRow1).toBe(true);
  });
});
