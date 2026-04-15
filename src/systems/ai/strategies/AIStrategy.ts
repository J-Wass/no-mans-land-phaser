/**
 * AIStrategy — selects and prioritises goals based on the current game state.
 * Concrete strategies are swapped in/out by the profile when conditions change.
 */

import type { AIContext, AIGoal } from '../AITypes';

export interface AIStrategy {
  readonly name: string;
  /** Return all candidate goals for this strategy this tick. */
  generateGoals(ctx: AIContext): AIGoal[];
  /** True if the strategy thinks it should hand off to something else. */
  shouldSwitch(ctx: AIContext): boolean;
  /** Return the replacement strategy, or null to stay. */
  nextStrategy(ctx: AIContext): AIStrategy | null;
}

/** Manhattan distance helper shared by strategies. */
export function manhattan(
  a: { row: number; col: number },
  b: { row: number; col: number },
): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
