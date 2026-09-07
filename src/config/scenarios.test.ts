import { describe, expect, it } from '@jest/globals';
import { DEFAULT_SCENARIO_ID, SCENARIOS, getScenarioById, getScenarioMap } from './scenarios';

const IMPASSABLE_TERRAIN = new Set(['M', 'W']);

function terrainAt(map: string[], row: number, col: number): string {
  return map[row]?.[col] ?? '';
}

describe('scenarios', () => {
  it('exposes at least one playable scenario', () => {
    expect(SCENARIOS.length).toBeGreaterThan(0);
    expect(getScenarioById(DEFAULT_SCENARIO_ID)?.id).toBe(DEFAULT_SCENARIO_ID);
  });

  it('falls back to the default scenario when an unknown id is requested', () => {
    expect(getScenarioById('missing-scenario')?.id).toBe(DEFAULT_SCENARIO_ID);
  });

  it('uses complete 60x60 terrain maps for configured scenarios', () => {
    for (const scenario of SCENARIOS) {
      const map = getScenarioMap(scenario.id);

      expect(map).not.toBeNull();
      expect(map).toHaveLength(60);
      expect(map?.every(row => row.length === 60)).toBe(true);
    }
  });

  it('keeps scripted cities and units on passable scenario terrain', () => {
    for (const scenario of SCENARIOS) {
      const map = getScenarioMap(scenario.id);

      expect(map).not.toBeNull();
      if (!map) continue;

      for (const nation of scenario.nations) {
        for (const city of nation.cities) {
          expect(IMPASSABLE_TERRAIN.has(terrainAt(map, city.row, city.col))).toBe(false);
        }

        for (const unit of nation.units) {
          expect(IMPASSABLE_TERRAIN.has(terrainAt(map, unit.row, unit.col))).toBe(false);
        }
      }
    }
  });

  // BootScene sizes the grid to the scenario map's own dimensions (see
  // getScenarioMap usage there), NOT to computeGridSize(totalNations). This
  // test guards that relationship directly: every scripted row/col must fall
  // within the map the grid will actually be built at, since a mismatch there
  // previously caused most scripted cities/units to boot outside the grid and
  // be silently dropped.
  it('keeps scripted cities and units within the scenario map bounds', () => {
    for (const scenario of SCENARIOS) {
      const map = getScenarioMap(scenario.id);
      expect(map).not.toBeNull();
      if (!map) continue;

      const gridSize = map.length;

      for (const nation of scenario.nations) {
        for (const city of nation.cities) {
          expect(city.row).toBeGreaterThanOrEqual(0);
          expect(city.row).toBeLessThan(gridSize);
          expect(city.col).toBeGreaterThanOrEqual(0);
          expect(city.col).toBeLessThan(gridSize);
        }

        for (const unit of nation.units) {
          expect(unit.row).toBeGreaterThanOrEqual(0);
          expect(unit.row).toBeLessThan(gridSize);
          expect(unit.col).toBeGreaterThanOrEqual(0);
          expect(unit.col).toBeLessThan(gridSize);
        }
      }

      for (const deposit of scenario.deposits) {
        expect(deposit.row).toBeGreaterThanOrEqual(0);
        expect(deposit.row).toBeLessThan(gridSize);
        expect(deposit.col).toBeGreaterThanOrEqual(0);
        expect(deposit.col).toBeLessThan(gridSize);
      }
    }
  });
});
