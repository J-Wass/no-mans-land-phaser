/**
 * NoobProfile — simplest AI.
 * Produces a handful of infantry. Never attacks, never claims territory.
 */

import type { AIContext, AIGoal, AILevel } from '../AITypes';
import { AIProfile } from './AIProfile';
import { ProduceUnitGoal } from '../goals/ProduceUnitGoal';
import { BuildBuildingGoal } from '../goals/BuildBuildingGoal';
import { ResearchTechGoal } from '../goals/ResearchTechGoal';
import { UnitType } from '@/entities/units/Unit';
import { CityBuildingType } from '@/systems/territory/CityBuilding';

const MAX_UNITS = 4; // won't produce beyond this

export class NoobProfile extends AIProfile {
  override readonly level: AILevel = 'noob';
  override readonly tickInterval   = 80;
  override readonly maxGoalsPerCycle = 1;

  override generateGoals(ctx: AIContext): AIGoal[] {
    const nation = ctx.gameState.getNation(ctx.nationId);
    const unitCount = ctx.gameState.getUnitsByNation(ctx.nationId).length;
    // Infantry needs a Barracks, which needs Masonry — on an ordinary start
    // this AI has neither, so without these two goals it can never produce
    // the infantry it's meant to. Kept narrowly scoped (Barracks only, one
    // tech, dropped again once researched) so it stays the passive/simple AI
    // tier — it still never attacks or claims territory, and never wanders
    // into ResearchTechGoal's broader "research anything" fallback.
    const goals: AIGoal[] = [new BuildBuildingGoal([CityBuildingType.BARRACKS])];
    if (!nation?.hasResearched('masonry')) goals.push(new ResearchTechGoal(['masonry']));
    if (unitCount < MAX_UNITS) goals.push(new ProduceUnitGoal([UnitType.INFANTRY]));
    return goals;
  }
}
