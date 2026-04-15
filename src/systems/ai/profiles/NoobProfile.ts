/**
 * NoobProfile — simplest AI.
 * Produces a handful of infantry. Never attacks, never claims territory.
 */

import type { AIContext, AIGoal, AILevel } from '../AITypes';
import { AIProfile } from './AIProfile';
import { ProduceUnitGoal } from '../goals/ProduceUnitGoal';
import { UnitType } from '@/entities/units/Unit';

const MAX_UNITS = 4; // won't produce beyond this

export class NoobProfile extends AIProfile {
  override readonly level: AILevel = 'noob';
  override readonly tickInterval   = 80;
  override readonly maxGoalsPerCycle = 1;

  override generateGoals(ctx: AIContext): AIGoal[] {
    const unitCount = ctx.gameState.getUnitsByNation(ctx.nationId).length;
    if (unitCount >= MAX_UNITS) return [];
    return [new ProduceUnitGoal([UnitType.INFANTRY])];
  }
}
