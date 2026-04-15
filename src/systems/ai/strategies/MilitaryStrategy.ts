/**
 * MilitaryStrategy — produce units and press the attack.
 * Switches to DefenseStrategy when out-numbered and under pressure.
 */

import type { AIContext, AIGoal } from '../AITypes';
import type { AIStrategy } from './AIStrategy';
import { manhattan } from './AIStrategy';
import { ProduceUnitGoal } from '../goals/ProduceUnitGoal';
import { AttackTargetGoal } from '../goals/AttackTargetGoal';
import { ClaimTerritoryGoal } from '../goals/ClaimTerritoryGoal';
import { BuildBuildingGoal } from '../goals/BuildBuildingGoal';
import { ResearchTechGoal } from '../goals/ResearchTechGoal';
import { UnitType } from '@/entities/units/Unit';

const THREAT_RADIUS = 4;

export class MilitaryStrategy implements AIStrategy {
  readonly name = 'military';

  generateGoals(_ctx: AIContext): AIGoal[] {
    return [
      new AttackTargetGoal(70, 250),
      new ProduceUnitGoal([
        UnitType.INFANTRY,
        UnitType.CAVALRY,
        UnitType.HEAVY_INFANTRY,
        UnitType.CROSSBOWMAN,
        UnitType.LONGBOWMAN,
      ]),
      new ClaimTerritoryGoal(),
      new BuildBuildingGoal(),
      new ResearchTechGoal(),
    ];
  }

  shouldSwitch(ctx: AIContext): boolean {
    return this.isOutnumbered(ctx) && this.hasEnemyNearby(ctx);
  }

  nextStrategy(ctx: AIContext): AIStrategy | null {
    if (this.shouldSwitch(ctx)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DefenseStrategy } = require('./DefenseStrategy') as typeof import('./DefenseStrategy');
      return new DefenseStrategy();
    }
    return null;
  }

  private isOutnumbered(ctx: AIContext): boolean {
    const myCount = ctx.gameState.getUnitsByNation(ctx.nationId).length;
    const maxEnemy = Math.max(0, ...ctx.gameState.getAllNations()
      .filter(n => n.getId() !== ctx.nationId && !n.isAlly(ctx.nationId))
      .map(n => ctx.gameState.getUnitsByNation(n.getId()).length));
    return myCount < maxEnemy * 0.6;
  }

  private hasEnemyNearby(ctx: AIContext): boolean {
    const nation = ctx.gameState.getNation(ctx.nationId);
    if (!nation) return false;
    for (const city of ctx.gameState.getCitiesByNation(ctx.nationId)) {
      for (const unit of ctx.gameState.getAllUnits()) {
        if (unit.getOwnerId() === ctx.nationId) continue;
        if (nation.isAlly(unit.getOwnerId())) continue;
        if (manhattan(unit.position, city.position) <= THREAT_RADIUS) return true;
      }
    }
    return false;
  }
}
