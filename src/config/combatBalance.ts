/**
 * Combat balance constants and shared damage formulas.
 *
 * These numbers were previously scattered inline across BattleSystem,
 * CitySiegeSystem, TerritoryBattleSystem and RangedFireSystem. Centralizing them
 * makes the game tunable from one place and keeps the shared formulas (health
 * scaling, per-round variance) identical everywhere.
 */

// ── Shared damage formulas ───────────────────────────────────────────────────

/** A unit/attacker hits harder at full health: factor ranges over [BASE, BASE+RANGE]. */
export const HEALTH_FACTOR_BASE = 0.55;
export const HEALTH_FACTOR_RANGE = 0.45;

/** Damage multiplier from current/max HP, in [HEALTH_FACTOR_BASE, BASE+RANGE]. */
export function healthFactor(currentHp: number, maxHp: number): number {
  const ratio = maxHp > 0 ? currentHp / maxHp : 0;
  return HEALTH_FACTOR_BASE + HEALTH_FACTOR_RANGE * ratio;
}

/** Per-round random spread applied to damage: maps rand∈[0,1) to [0.9, 1.1). */
export const DAMAGE_VARIANCE_MIN = 0.9;
export const DAMAGE_VARIANCE_SPAN = 0.2;

/** @param rand a value in [0,1) from the deterministic RNG. */
export function damageVariance(rand: number): number {
  return DAMAGE_VARIANCE_MIN + rand * DAMAGE_VARIANCE_SPAN;
}

// ── Unit-vs-unit battle ──────────────────────────────────────────────────────

/** Morale lost per round scales with the fraction of max HP taken, times this. */
export const MORALE_DAMAGE_SCALAR = 45;
/** Extra damage multiplier when at least one side is on ADVANCE. */
export const ADVANCE_PACE_FACTOR = 1.25;
/** Hard cap on total mitigation so attacks always do meaningful damage. */
export const MITIGATION_CAP = 0.65;

/** Withdraw (FALL_BACK) success chance model. */
export const WITHDRAW_BASE_CHANCE = 0.3;
export const WITHDRAW_SPEED_WEIGHT = 0.07;
export const WITHDRAW_CHANCE_MIN = 0.15;
export const WITHDRAW_CHANCE_MAX = 0.9;

/** Ticks a routed/withdrawing unit cannot be re-engaged. */
export const RETREAT_COOLDOWN_TICKS = 20;

/** Experience awarded for a kill, a win (opponent survives), and a loss. */
export const XP_KILL = 3;
export const XP_WIN = 2;
export const XP_LOSS = 1;

// ── City siege ───────────────────────────────────────────────────────────────

export const CITY_REGEN_INTERVAL = 50; // ticks between HP regen pulses
export const CITY_REGEN_AMOUNT = 5;
export const WALL_MITIGATION_PER_LEVEL = 0.06;
export const ADVANCE_MITIGATION_FACTOR = 0.45; // pressing the assault cuts wall mitigation
/** City HP fraction retained by the conqueror immediately after capture. */
export const CITY_POST_CONQUEST_HP = 0.35;

// ── Territory battle ─────────────────────────────────────────────────────────

export const TERRITORY_REGEN_INTERVAL = 50;
export const TERRITORY_REGEN_AMOUNT = 5;
export const TERRITORY_WALL_MITIGATION = 0.2;
/** Ranged attackers take reduced counterfire from a contested territory. */
export const TERRITORY_RANGED_COUNTER_FACTOR = 0.85;
/** HP a territory regains when its attacker withdraws. */
export const TERRITORY_RETREAT_REGEN = 10;
