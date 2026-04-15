/**
 * BuildBuildingGoal — constructs the next useful city building.
 */

import type { AIContext, AIGoal, GoalStatus } from '../AITypes';
import { CITY_BUILDING_CATALOG, CityBuildingType } from '@/systems/territory/CityBuilding';

/** Preferred construction order. */
const PREFERRED: CityBuildingType[] = [
  CityBuildingType.BARRACKS,
  CityBuildingType.FARMS,
  CityBuildingType.WORKSHOP,
  CityBuildingType.WALLS,
  CityBuildingType.MARKET,
  CityBuildingType.SCHOOL,
  CityBuildingType.COURTHOUSE,
  CityBuildingType.HOUSING,
];

export class BuildBuildingGoal implements AIGoal {
  readonly id = 'build-building';

  priority(_ctx: AIContext): number { return 35; }

  isFeasible(ctx: AIContext): boolean {
    return this.findBuild(ctx) !== null;
  }

  execute(ctx: AIContext): GoalStatus {
    const build = this.findBuild(ctx);
    if (!build) return 'failed';

    const r = ctx.commandProcessor.dispatch({
      type:         'BUILD_CITY_BUILDING',
      playerId:     ctx.playerId,
      cityId:       build.cityId,
      building:     build.building,
      issuedAtTick: ctx.currentTick,
    });
    return r.success ? 'ongoing' : 'failed';
  }

  private findBuild(
    ctx: AIContext,
  ): { cityId: string; building: CityBuildingType } | null {
    const nation = ctx.gameState.getNation(ctx.nationId);
    if (!nation) return null;

    for (const city of ctx.gameState.getCitiesByNation(ctx.nationId)) {
      if (city.getCurrentOrder()) continue;

      for (const buildingType of PREFERRED) {
        if (city.hasBuilding(buildingType)) continue;

        const def = CITY_BUILDING_CATALOG.find(d => d.type === buildingType);
        if (!def || def.ticks === 0) continue; // ticks=0 means built-in only
        if (def.requiresTech && !nation.hasResearched(def.requiresTech)) continue;
        if (!nation.getTreasury().hasResources(def.cost)) continue;

        return { cityId: city.id, building: buildingType };
      }
    }
    return null;
  }
}
