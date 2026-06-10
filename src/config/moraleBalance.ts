/**
 * Morale balance — all tunable numbers for the morale system in one place.
 *
 * Morale runs parallel to HP. Units with high morale fight harder; broken units
 * fight worse and can't ADVANCE. Wins, kills, and conquests grant morale; damage,
 * advancing, allied deaths, and losing battles drain it.
 */

export const DEFAULT_MORALE = 80;
export const MAX_MORALE     = 100;

/** Field recovery cannot push morale above this — only positive events can reach INSPIRED. */
export const RECOVERY_CEILING = 80;

/** Ticks during which a battle loser's recovery is halved. */
export const POST_BATTLE_RECOVERY_COOLDOWN_TICKS = 30;

// ── Bands ─────────────────────────────────────────────────────────────────────

export enum MoraleBand {
  INSPIRED = 'INSPIRED',  // 90-100
  STEADY   = 'STEADY',    // 60-89
  WAVERING = 'WAVERING',  // 40-59
  SHAKEN   = 'SHAKEN',    // 15-39
  BROKEN   = 'BROKEN',    // 0-14
}

/** Inclusive lower bound of each band. BROKEN starts at 0. */
export const BAND_INSPIRED_MIN = 90;
export const BAND_STEADY_MIN   = 60;
export const BAND_WAVERING_MIN = 40;
export const BAND_SHAKEN_MIN   = 15;

/** Highest morale at which ADVANCE is still downgraded to HOLD (= top of WAVERING). */
export const MORALE_ADVANCE_BLOCK_AT_OR_BELOW = BAND_STEADY_MIN - 1;   // 59

/** Highest morale at which the unit routs (only WITHDRAW honored). */
export const MORALE_ROUT_AT_OR_BELOW = BAND_SHAKEN_MIN - 1;            // 14

/** Per-band combat effects. damageMultiplier scales offense; mitigationDelta added to mitigation before clamp. */
export interface MoraleEffect {
  damageMultiplier: number;
  mitigationDelta:  number;
}

export const BAND_EFFECTS: Record<MoraleBand, MoraleEffect> = {
  [MoraleBand.INSPIRED]: { damageMultiplier: 1.12, mitigationDelta:  0.04 },
  [MoraleBand.STEADY]:   { damageMultiplier: 1.00, mitigationDelta:  0.00 },
  [MoraleBand.WAVERING]: { damageMultiplier: 0.92, mitigationDelta: -0.03 },
  [MoraleBand.SHAKEN]:   { damageMultiplier: 0.80, mitigationDelta: -0.06 },
  [MoraleBand.BROKEN]:   { damageMultiplier: 0.60, mitigationDelta: -0.10 },
};

/** SHAKEN units flee more readily — bonus added to withdraw roll. */
export const SHAKEN_WITHDRAW_BONUS = 0.10;

// ── Sources of GAIN ───────────────────────────────────────────────────────────

export const GAIN_BATTLE_WIN          = 20;  // ELIMINATION or WITHDRAW victory
export const GAIN_KILL                =  8;  // landing the killing blow
export const GAIN_WITNESS_VICTORY     =  5;  // friendly within radius when enemy dies
export const GAIN_CITY_CONQUER        = 25;  // to the conquering unit
export const GAIN_RALLY_CRY           = 10;  // friendly within radius of conquered city
export const GAIN_TERRITORY_CONQUER   =  6;  // to nearby units when territory is taken
export const GAIN_SIEGE_DAMAGE        =  1;  // per siege round where city took damage

// ── Sources of LOSS ───────────────────────────────────────────────────────────

export const LOSS_ADVANCE_PER_ROUND   =  2;  // per combat round spent on ADVANCE
export const LOSS_ALLIED_DEATH_NEARBY =  6;  // friendly within radius dies
export const LOSS_CITY_LOST_NATIONWIDE = 10; // every unit of the nation that just lost a city
export const LOSS_BATTLE_LOST         = 15;  // loser of WITHDRAW or ROUT, on top of damage drain

// ── Recovery (per TickEngine recoverMorale pulse — 1 / sec at TICK_RATE=10) ──

export const RECOVERY_ENEMY    = 0;  // standing on enemy territory: no rest
export const RECOVERY_NEUTRAL  = 1;
export const RECOVERY_FRIENDLY = 2;
export const RECOVERY_CITY     = 4;

// ── Witness / rally radii (Chebyshev distance) ────────────────────────────────

export const WITNESS_RADIUS           = 3;  // friendly within this distance of a kill site
export const RALLY_RADIUS             = 4;  // friendly within this distance of a conquered city
export const TERRITORY_RALLY_RADIUS   = 3;  // friendly within this distance of a captured territory
