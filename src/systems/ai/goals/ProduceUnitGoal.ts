/**
 * ProduceUnitGoal — queues a unit at an idle city.
 * Preferred unit types are injected by the calling strategy/profile.
 */

import type { AIContext, AIGoal, GoalStatus } from '../AITypes';
import type { UnitType } from '@/entities/units/Unit';
import { PRODUCTION_CATALOG } from '@/systems/production/ProductionCatalog';

export class ProduceUnitGoal implements AIGoal {
  readonly id = 'produce-unit';

  constructor(private readonly preferredTypes: UnitType[]) {}

  priority(ctx: AIContext): number {
    const unitCount = ctx.gameState.getUnitsByNation(ctx.nationId).length;
    // Urgency grows as we have fewer units (max 75, floor 20)
    return Math.max(20, 75 - unitCount * 8);
  }

  isFeasible(ctx: AIContext): boolean {
    return this.findBestProduction(ctx) !== null;
  }

  execute(ctx: AIContext): GoalStatus {
    const result = this.findBestProduction(ctx);
    if (!result) return 'failed';

    const r = ctx.commandProcessor.dispatch({
      type:         'START_CITY_PRODUCTION',
      playerId:     ctx.playerId,
      cityId:       result.cityId,
      unitType:     result.unitType,
      issuedAtTick: ctx.currentTick,
    });
    return r.success ? 'complete' : 'failed';
  }

  private findBestProduction(ctx: AIContext): { cityId: string; unitType: UnitType } | null {
    const nation = ctx.gameState.getNation(ctx.nationId);
    if (!nation) return null;

    for (const city of ctx.gameState.getCitiesByNation(ctx.nationId)) {
      if (city.getCurrentOrder()) continue; // busy

      for (const unitType of this.preferredTypes) {
        const entry = PRODUCTION_CATALOG.find(e => e.id === `unit:${unitType}`);
        if (!entry) continue;
        if (!entry.requiresTechs.every(t => nation.hasResearched(t))) continue;
        if (entry.requiresBuilding && !city.hasBuilding(entry.requiresBuilding)) continue;
        if (!nation.getTreasury().hasResources(entry.cost)) continue;
        return { cityId: city.id, unitType };
      }
    }
    return null;
  }
}
