/**
 * AIController — one per AI-controlled nation.
 * Owns a profile (which owns the strategy) and evaluates goals on a fixed interval.
 */

import type { AIContext } from './AITypes';
import type { AIProfile } from './profiles/AIProfile';

export class AIController {
  private lastEvalTick = 0;

  constructor(private readonly profile: AIProfile) {}

  public tick(ctx: AIContext): void {
    if (ctx.currentTick - this.lastEvalTick < this.profile.tickInterval) return;
    this.lastEvalTick = ctx.currentTick;

    // Generate candidate goals, filter feasible, sort by priority (highest first)
    const candidates = this.profile.generateGoals(ctx)
      .filter(g => g.isFeasible(ctx))
      .sort((a, b) => b.priority(ctx) - a.priority(ctx));

    // Execute top N goals
    const limit = this.profile.maxGoalsPerCycle;
    for (let i = 0; i < Math.min(candidates.length, limit); i++) {
      candidates[i]!.execute(ctx);
    }
  }

  public getProfileLevel(): string {
    return this.profile.level;
  }
}
