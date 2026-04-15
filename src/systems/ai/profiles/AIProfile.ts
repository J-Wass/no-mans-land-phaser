/**
 * AIProfile — abstract base class for AI difficulty levels.
 *
 * Each profile controls how often the AI re-evaluates, which goals it considers,
 * and how many goals it executes per cycle.
 */

import type { AIContext, AIGoal, AILevel } from '../AITypes';

export abstract class AIProfile {
  abstract readonly level: AILevel;

  /** How many game ticks between full re-evaluations. */
  abstract readonly tickInterval: number;

  /** Maximum goals executed per evaluation cycle. */
  readonly maxGoalsPerCycle: number = 3;

  /**
   * Generate the full ranked goal list for this cycle.
   * Returned goals are filtered for feasibility and sorted by priority
   * by AIController before execution.
   */
  abstract generateGoals(ctx: AIContext): AIGoal[];
}
