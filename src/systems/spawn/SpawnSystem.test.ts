import { describe, expect, it } from '@jest/globals';
import { GameState } from '@/managers/GameState';
import { assignStartingTerritory } from './SpawnSystem';

describe('assignStartingTerritory', () => {
  it('can overwrite existing claims for deterministic scenario setup', () => {
    const state = new GameState({ rows: 10, cols: 10 });
    const grid = state.getGrid();
    const shared = { row: 4, col: 4 };

    assignStartingTerritory(grid, 'nation-a', [
      { row: 4, col: 3 },
      { row: 4, col: 5 },
    ], 10);
    expect(grid.getTerritory(shared)?.getControllingNation()).toBe('nation-a');

    assignStartingTerritory(grid, 'nation-b', [
      { row: 4, col: 4 },
      { row: 4, col: 6 },
    ], 10);
    expect(grid.getTerritory(shared)?.getControllingNation()).toBe('nation-a');

    assignStartingTerritory(grid, 'nation-b', [
      { row: 4, col: 4 },
      { row: 4, col: 6 },
    ], 10, { overwrite: true });
    expect(grid.getTerritory(shared)?.getControllingNation()).toBe('nation-b');
  });
});
