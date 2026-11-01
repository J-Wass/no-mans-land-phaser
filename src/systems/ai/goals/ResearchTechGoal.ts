/**
 * ResearchTechGoal — starts research on the next useful tech.
 * A priority list is injected by the profile so different AI levels
 * can pursue different research paths.
 */

import type { AIContext, AIGoal, GoalStatus } from '../AITypes';
import { TECH_CATALOG, TECH_MAP } from '@/systems/research/TechTree';
import { ResourceType } from '@/systems/resources/ResourceType';
import type { TechId } from '@/systems/research/TechTree';

/** General-purpose research order (economy → military → advanced). */
export const DEFAULT_RESEARCH_ORDER: TechId[] = [
  'masonry', 'hunting', 'writing',
  'scientific_method', 'mathematics',
  'chemistry', 'biology', 'physics',
  'animal_domestication', 'iron_working',
  'mechanization', 'trade', 'education',
  'steel_working', 'ancient_rituals', 'mana_studies',
];

export class ResearchTechGoal implements AIGoal {
  readonly id = 'research-tech';

  constructor(private readonly priorityList: TechId[] = DEFAULT_RESEARCH_ORDER) {}

  priority(_ctx: AIContext): number { return 40; }

  isFeasible(ctx: AIContext): boolean {
    const nation = ctx.gameState.getNation(ctx.nationId);
    if (!nation || nation.getCurrentResearch()) return false;
    return this.pickTech(ctx) !== null;
  }

  execute(ctx: AIContext): GoalStatus {
    const techId = this.pickTech(ctx);
    if (!techId) return 'failed';

    const r = ctx.commandProcessor.dispatch({
      type:         'START_RESEARCH',
      playerId:     ctx.playerId,
      techId,
      issuedAtTick: ctx.currentTick,
    });
    return r.success ? 'ongoing' : 'failed';
  }

  private pickTech(ctx: AIContext): TechId | null {
    const nation = ctx.gameState.getNation(ctx.nationId);
    if (!nation) return null;

    // Only techs the nation can start right now — START_RESEARCH pays the RP cost
    // upfront and would just fail (wasting this goal slot) if it can't.
    const points = nation.getTreasury().getAmount(ResourceType.RESEARCH);
    const startable = (id: TechId): boolean =>
      nation.canResearch(id) && points >= (TECH_MAP.get(id)?.researchCost ?? Infinity);
    for (const tech of this.priorityList) {
      if (startable(tech)) return tech;
    }
    // Fallback — pick any startable tech
    for (const node of TECH_CATALOG) {
      if (startable(node.id)) return node.id;
    }
    return null;
  }
}
