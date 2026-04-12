import { describe, it, expect, beforeEach } from '@jest/globals';
import { Grid } from './Grid';

describe('Grid', () => {
  let grid: Grid;

  beforeEach(() => {
    grid = new Grid({ rows: 10, cols: 10 });
  });

  it('should create grid with correct dimensions', () => {
    const size = grid.getSize();
    expect(size.rows).toBe(10);
    expect(size.cols).toBe(10);
  });

  it('should initialize all territories', () => {
    const territories = grid.getAllTerritories();
    expect(territories).toHaveLength(100);
  });

  it('should get territory at valid coordinates', () => {
    const territory = grid.getTerritory({ row: 5, col: 5 });
    expect(territory).not.toBeNull();
    expect(territory?.getCoordinates()).toEqual({ row: 5, col: 5 });
  });

  it('should validate coordinates correctly', () => {
    expect(grid.isValidCoordinate({ row: 0, col: 0 })).toBe(true);
    expect(grid.isValidCoordinate({ row: 9, col: 9 })).toBe(true);
    expect(grid.isValidCoordinate({ row: 10, col: 0 })).toBe(false);
    expect(grid.isValidCoordinate({ row: -1, col: 0 })).toBe(false);
  });

  it('should get neighbors correctly', () => {
    const neighbors = grid.getNeighbors({ row: 5, col: 5 });
    expect(neighbors).toHaveLength(4); // North, South, East, West
  });

  it('should get fewer neighbors at grid edges', () => {
    const cornerNeighbors = grid.getNeighbors({ row: 0, col: 0 });
    expect(cornerNeighbors).toHaveLength(2); // Only South and East
  });

  it('should filter territories by nation', () => {
    const territory1 = grid.getTerritory({ row: 0, col: 0 });
    const territory2 = grid.getTerritory({ row: 1, col: 1 });

    territory1?.setControllingNation('nation-1');
    territory2?.setControllingNation('nation-1');

    const nationTerritories = grid.getTerritoriesByNation('nation-1');
    expect(nationTerritories).toHaveLength(2);
  });
});
