/**
 * ExpansionStrategy — grow territory first, fight only when necessary.
 * Switches to MilitaryStrategy when we have enough territory or an enemy is close.
 */

import type { AIContext, AIGoal } from '../AITypes';
import type { AIStrategy } from './AIStrategy';
import { manhattan } from './AIStrategy';
import { ClaimTerritoryGoal } from '../goals/ClaimTerritoryGoal';
import { ProduceUnitGoal } from '../goals/ProduceUnitGoal';
import { AttackTargetGoal } from '../goals/AttackTargetGoal';
import { UnitType } from '@/entities/units/Unit';

const THREAT_RADIUS    = 5;
const TERRITORY_ENOUGH = 12;

export class ExpansionStrategy implements AIStrategy {
  readonly name = 'expansion';

  generateGoals(_ctx: AIContext): AIGoal[] {
    return [
      new ClaimTerritoryGoal(),
      new ProduceUnitGoal([UnitType.INFANTRY, UnitType.SCOUT]),
      new AttackTargetGoal(30, 500),
    ];
  }

  shouldSwitch(ctx: AIContext): boolean {
    return this.isUnderThreat(ctx) || this.hasEnoughTerritory(ctx);
  }

  nextStrategy(ctx: AIContext): AIStrategy | null {
    if (this.shouldSwitch(ctx)) {
      // Lazy import avoids circular dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MilitaryStrategy } = require('./MilitaryStrategy') as typeof import('./MilitaryStrategy');
      return new MilitaryStrategy();
    }
    return null;
  }

  private isUnderThreat(ctx: AIContext): boolean {
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

  private hasEnoughTerritory(ctx: AIContext): boolean {
    const grid = ctx.gameState.getGrid();
    const { rows, cols } = grid.getSize();
    let count = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid.getTerritory({ row: r, col: c })?.getControllingNation() === ctx.nationId) count++;
      }
    }
    return count >= TERRITORY_ENOUGH;
  }
}
