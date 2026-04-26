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
});
