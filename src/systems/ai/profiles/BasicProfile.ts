/**
 * BasicProfile — medium AI.
 * Produces infantry, claims territory, attacks nearby enemies.
 * No research, no buildings.
 */

import type { AIContext, AIGoal, AILevel } from '../AITypes';
import { AIProfile } from './AIProfile';
import { ProduceUnitGoal } from '../goals/ProduceUnitGoal';
import { ClaimTerritoryGoal } from '../goals/ClaimTerritoryGoal';
import { AttackTargetGoal } from '../goals/AttackTargetGoal';
import { UnitType } from '@/entities/units/Unit';

export class BasicProfile extends AIProfile {
  override readonly level: AILevel = 'basic';
  override readonly tickInterval   = 30;
  override readonly maxGoalsPerCycle = 2;

  override generateGoals(_ctx: AIContext): AIGoal[] {
    return [
      new ProduceUnitGoal([UnitType.INFANTRY, UnitType.SCOUT]),
      new ClaimTerritoryGoal(),
      new AttackTargetGoal(55, 800),
    ];
  }
}
