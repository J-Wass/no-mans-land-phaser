/**
 * AdvancedProfile — full-featured AI.
 * Uses a swappable strategy (Expansion → Military ↔ Defense) and pursues
 * research, city buildings, and diversified unit production.
 */

import type { AIContext, AIGoal, AILevel } from '../AITypes';
import { AIProfile } from './AIProfile';
import type { AIStrategy } from '../strategies/AIStrategy';
import { ExpansionStrategy } from '../strategies/ExpansionStrategy';

export class AdvancedProfile extends AIProfile {
  override readonly level: AILevel = 'advanced';
  override readonly tickInterval   = 20;
  override readonly maxGoalsPerCycle = 4;

  private strategy: AIStrategy = new ExpansionStrategy();

  override generateGoals(ctx: AIContext): AIGoal[] {
    // Let strategy self-assess and switch if needed
    if (this.strategy.shouldSwitch(ctx)) {
      const next = this.strategy.nextStrategy(ctx);
      if (next) this.strategy = next;
    }
    return this.strategy.generateGoals(ctx);
  }

  /** Exposed for introspection / debugging. */
  getStrategyName(): string {
    return this.strategy.name;
  }
}
