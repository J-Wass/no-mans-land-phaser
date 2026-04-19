import { describe, expect, it } from '@jest/globals';
import { normalizeGameSetup } from './gameSetup';

describe('normalizeGameSetup', () => {
  it('fills in defaults for older save/menu data', () => {
    expect(normalizeGameSetup({ difficulty: 'hard' })).toEqual({
      opponentCount: 1,
      difficulty: 'hard',
      gameMode: 'skirmish',
      scenarioId: null,
    });
  });

  it('clamps opponent count into the supported range', () => {
    expect(normalizeGameSetup({ opponentCount: 99 }).opponentCount).toBe(4);
    expect(normalizeGameSetup({ opponentCount: 0 }).opponentCount).toBe(1);
  });
});
