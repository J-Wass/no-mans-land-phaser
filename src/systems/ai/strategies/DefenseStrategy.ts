/**
 * DefenseStrategy — concentrate units near threatened cities.
 * Reverts to MilitaryStrategy once no enemies are nearby.
 */

import type { AIContext, AIGoal, GoalStatus } from '../AITypes';
import type { AIStrategy } from './AIStrategy';
import { manhattan } from './AIStrategy';
import { ProduceUnitGoal } from '../goals/ProduceUnitGoal';
import { AttackTargetGoal } from '../goals/AttackTargetGoal';
import { UnitType } from '@/entities/units/Unit';
import type { GridCoordinates } from '@/types/common';

const SAFE_RADIUS = 6;

export class DefenseStrategy implements AIStrategy {
  readonly name = 'defense';

  generateGoals(ctx: AIContext): AIGoal[] {
    const goals: AIGoal[] = [
      new ProduceUnitGoal([UnitType.HEAVY_INFANTRY, UnitType.INFANTRY, UnitType.CROSSBOWMAN]),
    ];

    const threatened = this.findThreatenedCity(ctx);
    if (threatened) goals.push(new DefendPositionGoal(threatened, 80));

    goals.push(new AttackTargetGoal(50));
    return goals;
  }

  shouldSwitch(ctx: AIContext): boolean {
    return !this.hasEnemyNearby(ctx);
  }

  nextStrategy(_ctx: AIContext): AIStrategy | null {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MilitaryStrategy } = require('./MilitaryStrategy') as typeof import('./MilitaryStrategy');
    return new MilitaryStrategy();
  }

  private hasEnemyNearby(ctx: AIContext): boolean {
    const nation = ctx.gameState.getNation(ctx.nationId);
    if (!nation) return false;
    for (const city of ctx.gameState.getCitiesByNation(ctx.nationId)) {
      for (const unit of ctx.gameState.getAllUnits()) {
        if (unit.getOwnerId() === ctx.nationId) continue;
        if (nation.isAlly(unit.getOwnerId())) continue;
        if (manhattan(unit.position, city.position) <= SAFE_RADIUS) return true;
      }
    }
    return false;
  }

  private findThreatenedCity(ctx: AIContext): GridCoordinates | null {
    const nation = ctx.gameState.getNation(ctx.nationId);
    if (!nation) return null;
    let minDist = Infinity;
    let best: GridCoordinates | null = null;
    for (const city of ctx.gameState.getCitiesByNation(ctx.nationId)) {
      for (const unit of ctx.gameState.getAllUnits()) {
        if (unit.getOwnerId() === ctx.nationId) continue;
        if (nation.isAlly(unit.getOwnerId())) continue;
        const d = manhattan(unit.position, city.position);
        if (d < minDist) { minDist = d; best = city.position; }
      }
    }
    return best;
  }
}

/** Routes an idle unit toward a defensive position. */
class DefendPositionGoal implements AIGoal {
  readonly id = 'defend-position';

  constructor(
    private readonly target: GridCoordinates,
    private readonly prio: number,
  ) {}

  priority(_ctx: AIContext): number { return this.prio; }

  isFeasible(ctx: AIContext): boolean {
    return ctx.gameState.getUnitsByNation(ctx.nationId)
      .some(u => u.isAlive() && !u.isEngagedInBattle() && !ctx.movementSystem.isMoving(u.id));
  }

  execute(ctx: AIContext): GoalStatus {
    const units = ctx.gameState.getUnitsByNation(ctx.nationId)
      .filter(u => u.isAlive() && !u.isEngagedInBattle() && !ctx.movementSystem.isMoving(u.id))
      .sort((a, b) => manhattan(a.position, this.target) - manhattan(b.position, this.target));

    for (const unit of units) {
      const path = ctx.pathfinder.findPath(
        unit.position, this.target, unit.getUnitType(), unit.getStats(),
      );
      if (path && path.length > 0) {
        const r = ctx.commandProcessor.dispatch({
          type: 'MOVE_UNIT', playerId: ctx.playerId,
          unitId: unit.id, path, issuedAtTick: ctx.currentTick,
        });
        if (r.success) return 'ongoing';
      }
    }
    return 'failed';
  }
}
