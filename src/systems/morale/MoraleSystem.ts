/**
 * MoraleSystem — owns event-driven morale changes and band-change detection.
 *
 * Per-round damage drain and ADVANCE penalty happen inline in each combat
 * system (via moraleRules.ts helpers) so they fire in the same tick as
 * mortality/rout checks. This system handles the discrete events: winning a
 * fight, killing a unit, conquering a city or territory, witnessing victory
 * or loss, and the nation-wide shock when a city falls.
 *
 * It also polls every tick to fire `morale:band-changed` events when units
 * cross a band threshold, so UI can show toasts.
 */

import type { EntityId } from '@/types/common';
import type { GameState } from '@/managers/GameState';
import type { GameEventBus, MoraleGainSource, MoraleLossSource } from '@/systems/events/GameEventBus';
import type { Unit } from '@/entities/units/Unit';
import { getMoraleBand } from '@/systems/morale/moraleRules';
import {
  MoraleBand,
  GAIN_BATTLE_WIN,
  GAIN_KILL,
  GAIN_WITNESS_VICTORY,
  GAIN_CITY_CONQUER,
  GAIN_RALLY_CRY,
  GAIN_TERRITORY_CONQUER,
  GAIN_SIEGE_DAMAGE,
  LOSS_ALLIED_DEATH_NEARBY,
  LOSS_CITY_LOST_NATIONWIDE,
  POST_BATTLE_RECOVERY_COOLDOWN_TICKS,
  WITNESS_RADIUS,
  RALLY_RADIUS,
  TERRITORY_RALLY_RADIUS,
} from '@/config/moraleBalance';

export class MoraleSystem {
  /** Last band seen per unit — used to detect threshold crossings. */
  private lastBands: Map<EntityId, MoraleBand> = new Map();

  constructor(
    private readonly gameState: GameState,
    private readonly eventBus:  GameEventBus,
  ) {
    this.subscribe();
  }

  // ── Per-tick poll ─────────────────────────────────────────────────────────

  /**
   * Detect band crossings for every live unit and emit `morale:band-changed`.
   * Called once per game tick from TickEngine.
   */
  public tick(currentTick: number): void {
    const liveIds = new Set<EntityId>();
    for (const unit of this.gameState.getAllUnits()) {
      liveIds.add(unit.id);
      const newBand = getMoraleBand(unit.getMorale());
      const oldBand = this.lastBands.get(unit.id);
      if (oldBand === undefined) {
        this.lastBands.set(unit.id, newBand);
        continue;
      }
      if (oldBand !== newBand) {
        this.eventBus.emit('morale:band-changed', {
          unitId: unit.id,
          oldBand,
          newBand,
          value:  unit.getMorale(),
          tick:   currentTick,
        });
        this.lastBands.set(unit.id, newBand);
      }
    }
    // Drop stale entries so dead units don't leak.
    for (const id of this.lastBands.keys()) {
      if (!liveIds.has(id)) this.lastBands.delete(id);
    }
  }

  // ── Event subscriptions ───────────────────────────────────────────────────

  private subscribe(): void {
    this.eventBus.on('battle:ended', ({ winnerUnitId, loserUnitId, reason, tick }) => {
      if (reason === 'ELIMINATION' || reason === 'WITHDRAW') {
        if (winnerUnitId) {
          const winner = this.gameState.getUnit(winnerUnitId);
          if (winner?.isAlive()) this.grant(winner, GAIN_BATTLE_WIN, 'win', tick);
        }
      }
      if (loserUnitId) {
        const loser = this.gameState.getUnit(loserUnitId);
        if (loser?.isAlive()) {
          loser.setMoraleRecoveryCooldownUntilTick(tick + POST_BATTLE_RECOVERY_COOLDOWN_TICKS);
        }
      }
    });

    this.eventBus.on('unit:destroyed', ({ byUnitId, ownerNationId, position, tick }) => {
      // Killer gets a kill bonus, witnesses on both sides react.
      if (byUnitId) {
        const killer = this.gameState.getUnit(byUnitId);
        if (killer?.isAlive()) this.grant(killer, GAIN_KILL, 'kill', tick);
      }
      // Allies of the killer (= enemies of the dead) within witness radius cheer.
      // Allies of the dead within witness radius grieve.
      for (const other of this.gameState.getAllUnits()) {
        if (!other.isAlive()) continue;
        if (this.chebyshev(other.position, position) > WITNESS_RADIUS) continue;
        if (other.getOwnerId() === ownerNationId) {
          this.drain(other, LOSS_ALLIED_DEATH_NEARBY, 'allied-death', tick);
        } else if (byUnitId && other.id !== byUnitId) {
          // Witness victory only goes to allies of the killer, not the killer themselves
          // (the killer already got GAIN_KILL).
          const killer = this.gameState.getUnit(byUnitId);
          if (killer && other.getOwnerId() === killer.getOwnerId()) {
            this.grant(other, GAIN_WITNESS_VICTORY, 'witness', tick);
          }
        }
      }
    });

    this.eventBus.on('city:conquered', ({ byUnitId, byNationId, fromNationId, position, tick }) => {
      // Direct conqueror: big morale boost.
      const conqueror = this.gameState.getUnit(byUnitId);
      if (conqueror?.isAlive()) this.grant(conqueror, GAIN_CITY_CONQUER, 'conquest', tick);

      // Local rally cry to nearby friendlies of the conquering nation.
      for (const other of this.gameState.getAllUnits()) {
        if (!other.isAlive()) continue;
        if (other.id === byUnitId) continue;
        if (other.getOwnerId() !== byNationId) continue;
        if (this.chebyshev(other.position, position) > RALLY_RADIUS) continue;
        this.grant(other, GAIN_RALLY_CRY, 'rally', tick);
      }

      // Nation-wide shock to every unit of the previous owner (asymmetric: gains
      // are local, losses are nation-wide — "bad news travels fast").
      if (fromNationId) {
        for (const unit of this.gameState.getUnitsByNation(fromNationId)) {
          if (!unit.isAlive()) continue;
          this.drain(unit, LOSS_CITY_LOST_NATIONWIDE, 'city-lost', tick);
        }
      }
    });

    this.eventBus.on('territory:claimed', ({ position, nationId, fromNationId, tick }) => {
      // Only conquests grant morale (outpost completions skip this).
      if (!fromNationId) return;
      for (const unit of this.gameState.getUnitsByNation(nationId)) {
        if (!unit.isAlive()) continue;
        if (this.chebyshev(unit.position, position) > TERRITORY_RALLY_RADIUS) continue;
        this.grant(unit, GAIN_TERRITORY_CONQUER, 'territory', tick);
      }
    });

    this.eventBus.on('city:siege-round', ({ unitId, damageToCity, damageToUnit, tick }) => {
      // Bombarding successfully (and unscathed this round) raises morale a sliver.
      if (damageToCity <= 0 || damageToUnit > 0) return;
      const unit = this.gameState.getUnit(unitId);
      if (unit?.isAlive()) this.grant(unit, GAIN_SIEGE_DAMAGE, 'siege', tick);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private grant(unit: Unit, amount: number, source: MoraleGainSource, tick: number): void {
    if (amount <= 0) return;
    unit.setMorale(unit.getMorale() + amount);
    this.eventBus.emit('morale:gained', { unitId: unit.id, amount, source, tick });
  }

  private drain(unit: Unit, amount: number, source: MoraleLossSource, tick: number): void {
    if (amount <= 0) return;
    unit.setMorale(unit.getMorale() - amount);
    this.eventBus.emit('morale:lost', { unitId: unit.id, amount, source, tick });
  }

  private chebyshev(a: { row: number; col: number }, b: { row: number; col: number }): number {
    return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
  }
}
