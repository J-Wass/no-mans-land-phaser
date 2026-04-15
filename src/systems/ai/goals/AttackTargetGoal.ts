/**
 * AttackTargetGoal — routes the closest idle unit toward the nearest enemy
 * city or unit, ignoring allies.
 *
 * The actual battle / siege starts automatically when the unit arrives
 * (MovementSystem.tickWithBattles / CitySiegeSystem).
 */

import type { AIContext, AIGoal, GoalStatus } from '../AITypes';
import type { GridCoordinates } from '@/types/common';
import { manhattan } from '../strategies/AIStrategy';

export class AttackTargetGoal implements AIGoal {
  readonly id = 'attack-target';

  constructor(
    /** 0–100. Caller adjusts to reflect strategic posture. */
    private readonly basePriority: number = 60,
    /** Don't attack before this tick (prevents immediate aggression at game start). */
    private readonly minTickToAttack: number = 0,
  ) {}

  priority(_ctx: AIContext): number { return this.basePriority; }

  isFeasible(ctx: AIContext): boolean {
    if (ctx.currentTick < this.minTickToAttack) return false;
    const hasIdle = ctx.gameState.getUnitsByNation(ctx.nationId)
      .some(u => u.isAlive() && !u.isEngagedInBattle() && !ctx.movementSystem.isMoving(u.id));
    return hasIdle && this.findTarget(ctx) !== null;
  }

  execute(ctx: AIContext): GoalStatus {
    const target = this.findTarget(ctx);
    if (!target) return 'failed';

    // Pick idle unit closest to the target
    const units = ctx.gameState.getUnitsByNation(ctx.nationId)
      .filter(u => u.isAlive() && !u.isEngagedInBattle() && !ctx.movementSystem.isMoving(u.id))
      .sort((a, b) => manhattan(a.position, target) - manhattan(b.position, target));

    for (const unit of units) {
      const path = ctx.pathfinder.findPath(
        unit.position, target, unit.getUnitType(), unit.getStats(),
      );
      if (!path || path.length === 0) continue;

      const r = ctx.commandProcessor.dispatch({
        type:         'MOVE_UNIT',
        playerId:     ctx.playerId,
        unitId:       unit.id,
        path,
        issuedAtTick: ctx.currentTick,
      });
      if (r.success) return 'ongoing';
    }
    return 'failed';
  }

  private findTarget(ctx: AIContext): GridCoordinates | null {
    const nation = ctx.gameState.getNation(ctx.nationId);
    if (!nation) return null;

    const myRef =
      ctx.gameState.getCitiesByNation(ctx.nationId)[0]?.position ??
      ctx.gameState.getUnitsByNation(ctx.nationId)[0]?.position;
    if (!myRef) return null;

    const targets: GridCoordinates[] = [];

    // Enemy cities
    for (const city of ctx.gameState.getAllCities()) {
      if (city.getOwnerId() === ctx.nationId) continue;
      if (nation.isAlly(city.getOwnerId())) continue;
      targets.push(city.position);
    }

    // Enemy units
    for (const unit of ctx.gameState.getAllUnits()) {
      if (unit.getOwnerId() === ctx.nationId) continue;
      if (nation.isAlly(unit.getOwnerId())) continue;
      targets.push(unit.position);
    }

    if (targets.length === 0) return null;

    // Closest to our capital / first city
    targets.sort((a, b) => manhattan(a, myRef) - manhattan(b, myRef));
    return targets[0]!;
  }
}
