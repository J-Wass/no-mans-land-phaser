/**
 * BasicProfile — medium AI.
 * Produces infantry, claims territory, researches tech, builds, and attacks.
 */

import type { AIContext, AIGoal, AILevel } from '../AITypes';
import { AIProfile } from './AIProfile';
import { ProduceUnitGoal } from '../goals/ProduceUnitGoal';
import { ClaimTerritoryGoal } from '../goals/ClaimTerritoryGoal';
import { AttackTargetGoal } from '../goals/AttackTargetGoal';
import { ResearchTechGoal } from '../goals/ResearchTechGoal';
import { BuildBuildingGoal } from '../goals/BuildBuildingGoal';
import { UnitType } from '@/entities/units/Unit';
import type { TechId } from '@/systems/research/TechTree';

/** Simplified research path for medium difficulty: economy first, then military basics. */
const BASIC_RESEARCH_ORDER: TechId[] = [
  'masonry', 'hunting', 'writing',
  'trade', 'education',
  'animal_domestication', 'iron_working',
  'scientific_method', 'mathematics',
];

export class BasicProfile extends AIProfile {
  override readonly level: AILevel = 'basic';
  override readonly tickInterval   = 30;
  override readonly maxGoalsPerCycle = 3;

  override generateGoals(_ctx: AIContext): AIGoal[] {
    return [
      new ProduceUnitGoal([UnitType.INFANTRY, UnitType.SCOUT]),
      new ClaimTerritoryGoal(),
      new AttackTargetGoal(55, 800),
      new ResearchTechGoal(BASIC_RESEARCH_ORDER),
      new BuildBuildingGoal(),
    ];
  }
}
