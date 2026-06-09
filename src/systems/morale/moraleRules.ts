/**
 * Pure morale helpers shared by every combat system.
 *
 * Damage→morale happens inline in each tick (so mortality and rout checks see
 * the updated value the same round). Event-driven gains live in MoraleSystem.
 *
 * `effectiveBattleOrder` lives here so BattleSystem, CitySiegeSystem,
 * TerritoryBattleSystem, and any future combat code all consult the same
 * morale-aware stance.
 */

import type { Unit, BattleOrder } from '@/entities/units/Unit';
import { MORALE_DAMAGE_SCALAR } from '@/config/combatBalance';
import {
  MoraleBand,
  BAND_EFFECTS,
  BAND_INSPIRED_MIN,
  BAND_STEADY_MIN,
  BAND_WAVERING_MIN,
  BAND_SHAKEN_MIN,
  LOSS_ADVANCE_PER_ROUND,
  MORALE_ADVANCE_BLOCK_AT_OR_BELOW,
  MORALE_ROUT_AT_OR_BELOW,
} from '@/config/moraleBalance';

/** Bucket a raw morale value into its band. */
export function getMoraleBand(value: number): MoraleBand {
  if (value >= BAND_INSPIRED_MIN) return MoraleBand.INSPIRED;
  if (value >= BAND_STEADY_MIN)   return MoraleBand.STEADY;
  if (value >= BAND_WAVERING_MIN) return MoraleBand.WAVERING;
  if (value >= BAND_SHAKEN_MIN)   return MoraleBand.SHAKEN;
  return MoraleBand.BROKEN;
}

/** Multiplier applied to a unit's offense based on its morale band. */
export function getMoraleDamageMultiplier(value: number): number {
  return BAND_EFFECTS[getMoraleBand(value)].damageMultiplier;
}

/** Delta added to a defender's mitigation based on its morale band (positive helps, negative hurts). */
export function getMoraleMitigationDelta(value: number): number {
  return BAND_EFFECTS[getMoraleBand(value)].mitigationDelta;
}

/**
 * Deduct morale equal to `ceil((damage / maxHP) × MORALE_DAMAGE_SCALAR)`.
 * Called inline from every combat system after the unit takes damage so all
 * forms of injury demoralize, not just unit-vs-unit melee.
 */
export function applyCombatMoraleHit(unit: Unit, damageTaken: number): void {
  if (damageTaken <= 0) return;
  const maxHealth = unit.getStats().maxHealth;
  if (maxHealth <= 0) return;
  const drop = Math.ceil((damageTaken / maxHealth) * MORALE_DAMAGE_SCALAR);
  unit.setMorale(unit.getMorale() - drop);
}

/** Per-round morale cost paid by units choosing to ADVANCE. */
export function applyAdvancePenalty(unit: Unit): void {
  unit.setMorale(unit.getMorale() - LOSS_ADVANCE_PER_ROUND);
}

/**
 * Morale can override the player's chosen stance:
 *   ≤ MORALE_ROUT_AT_OR_BELOW (14): troops break — only FALL_BACK is honored;
 *                                   anything else collapses to HOLD.
 *   ≤ MORALE_ADVANCE_BLOCK_AT_OR_BELOW (59): too shaken to charge;
 *                                   ADVANCE is downgraded to HOLD.
 *   Otherwise: chosen order stands.
 */
export function effectiveBattleOrder(unit: Unit): BattleOrder {
  const morale = unit.getMorale();
  const order  = unit.getBattleOrder();
  if (morale <= MORALE_ROUT_AT_OR_BELOW) return order === 'FALL_BACK' ? 'FALL_BACK' : 'HOLD';
  if (morale <= MORALE_ADVANCE_BLOCK_AT_OR_BELOW && order === 'ADVANCE') return 'HOLD';
  return order;
}
