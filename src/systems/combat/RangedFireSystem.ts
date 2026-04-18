/**
 * RangedFireSystem — continuous ranged attacks from a stationary unit.
 *
 * Every RANGED_FIRE_INTERVAL_TICKS, each ranged unit that is:
 *   - alive, NOT engaged in melee/siege battle, NOT on CHARGE order
 *   - has an enemy unit or city within attackRange tiles (Manhattan distance)
 * …fires once, dealing scaled ranged damage directly.
 *
 * War declaration (if nations are neutral) is handled downstream by
 * DiplomacySystem which subscribes to the 'ranged:fired' event.
 *
 * Cities can be chipped below full HP by ranged fire but not captured;
 * a unit must physically occupy the city tile to conquer it.
 */

import type { Unit } from '@/entities/units/Unit';
import type { City } from '@/entities/cities/City';
import type { GameState } from '@/managers/GameState';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import type { EntityId, GridCoordinates } from '@/types/common';
import type { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import { weaponTierDamageBonus, fireManaDamageFactor } from '@/systems/resources/ResourceBonuses';

/** Ticks between consecutive shots from a stationary ranged unit (2 s at TICK_RATE=10). */
export const RANGED_FIRE_INTERVAL_TICKS = 20;

export class RangedFireSystem {
  /** Earliest tick on which each unit may fire again. */
  private readonly nextFireTick: Map<EntityId, number> = new Map();

  public tick(gameState: GameState, eventBus: GameEventBus, currentTick: number): void {
    for (const unit of gameState.getAllUnits()) {
      if (!this.isRangedUnit(unit)) continue;
      if (!unit.isAlive()) continue;
      if (unit.isEngagedInBattle()) continue;
      if (unit.getBattleOrder() === 'CHARGE') continue;

      const nextFire = this.nextFireTick.get(unit.id) ?? 0;
      if (currentTick < nextFire) continue;

      const nation = gameState.getNation(unit.getOwnerId());
      if (!nation) continue;

      const target = this.findTarget(unit, gameState);
      if (!target) continue;

      const deposits = gameState.getNationActiveDeposits(unit.getOwnerId());
      const counts   = gameState.getNationActiveDepositCounts(unit.getOwnerId());
      const damage   = this.calculateDamage(unit, deposits, counts);

      if (target.type === 'unit') {
        target.unit.takeDamage(damage);
        eventBus.emit('ranged:fired', {
          unitId:     unit.id,
          targetId:   target.unit.id,
          targetType: 'unit',
          damage,
          from: { ...unit.position },
          to:   { ...target.unit.position },
          tick: currentTick,
        });
        if (!target.unit.isAlive()) {
          gameState.removeUnit(target.unit.id);
          eventBus.emit('unit:destroyed', {
            unitId: target.unit.id, byUnitId: unit.id, tick: currentTick,
          });
        }
      } else {
        // Ranged fire chips HP but cannot conquer; minimum 1 HP remains
        const newHp = Math.max(1, target.city.getHealth() - damage);
        target.city.setHealth(newHp);
        eventBus.emit('ranged:fired', {
          unitId:     unit.id,
          targetId:   target.city.id,
          targetType: 'city',
          damage,
          from: { ...unit.position },
          to:   { ...target.city.position },
          tick: currentTick,
        });
      }

      this.nextFireTick.set(unit.id, currentTick + RANGED_FIRE_INTERVAL_TICKS);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private isRangedUnit(unit: Unit): boolean {
    const s = unit.getStats();
    return s.attackRange > 1 && s.rangedDamage > 0;
  }

  private findTarget(
    unit: Unit,
    gameState: GameState,
  ): { type: 'unit'; unit: Unit } | { type: 'city'; city: City } | null {
    const nation = gameState.getNation(unit.getOwnerId());
    if (!nation) return null;

    const range = unit.getStats().attackRange;

    // ── Check player-assigned preferred target first ──────────────────────────
    const prefId = unit.getPreferredTargetId();
    if (prefId) {
      const pref = gameState.getUnit(prefId);
      if (pref && pref.isAlive() && !nation.isAlly(pref.getOwnerId())) {
        const dist = manhattan(unit.position, pref.position);
        if (dist <= range) return { type: 'unit', unit: pref };
      }
      // Preferred target is gone or out of range — revert to auto
      unit.setPreferredTargetId(null);
    }

    // ── Auto: closest enemy unit, then closest enemy city ────────────────────
    let bestUnit: Unit | null = null;
    let bestUnitDist = Infinity;
    let bestCity: City | null = null;
    let bestCityDist = Infinity;

    for (const other of gameState.getAllUnits()) {
      if (other.id === unit.id) continue;
      if (other.getOwnerId() === unit.getOwnerId()) continue;
      if (nation.isAlly(other.getOwnerId())) continue;
      if (!other.isAlive()) continue;
      const dist = manhattan(unit.position, other.position);
      if (dist <= range && dist < bestUnitDist) {
        bestUnitDist = dist;
        bestUnit = other;
      }
    }

    for (const city of gameState.getAllCities()) {
      if (city.getOwnerId() === unit.getOwnerId()) continue;
      if (nation.isAlly(city.getOwnerId())) continue;
      const dist = manhattan(unit.position, city.position);
      if (dist <= range && dist < bestCityDist) {
        bestCityDist = dist;
        bestCity = city;
      }
    }

    // Prefer enemy units (active threats) over cities
    if (bestUnit) return { type: 'unit', unit: bestUnit };
    if (bestCity) return { type: 'city', city: bestCity };
    return null;
  }

  private calculateDamage(
    attacker: Unit,
    deposits: ReadonlySet<TerritoryResourceType>,
    counts:   ReadonlyMap<TerritoryResourceType, number>,
  ): number {
    const stats      = attacker.getStats();
    const baseDamage = stats.rangedDamage + weaponTierDamageBonus(deposits);
    const healthRatio  = attacker.getHealth() / stats.maxHealth;
    const healthFactor = 0.55 + 0.45 * healthRatio;
    const fireFactor = fireManaDamageFactor(deposits, counts);
    const randomness = 0.9 + Math.random() * 0.2;
    return Math.max(1, Math.round(baseDamage * healthFactor * fireFactor * randomness));
  }
}

function manhattan(a: GridCoordinates, b: GridCoordinates): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
