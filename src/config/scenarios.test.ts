import { describe, expect, it } from '@jest/globals';
import { DEFAULT_SCENARIO_ID, SCENARIOS, getScenarioById } from './scenarios';

describe('scenarios', () => {
  it('exposes at least one playable scenario', () => {
    expect(SCENARIOS.length).toBeGreaterThan(0);
    expect(getScenarioById(DEFAULT_SCENARIO_ID)?.id).toBe(DEFAULT_SCENARIO_ID);
  });

  it('falls back to the default scenario when an unknown id is requested', () => {
    expect(getScenarioById('missing-scenario')?.id).toBe(DEFAULT_SCENARIO_ID);
  });
});
