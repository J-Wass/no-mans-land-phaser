/**
 * DiplomacySystem — manages nation relations, auto-war, and peace treaties.
 *
 * Relations start at NEUTRAL.  Combat (melee, siege, or ranged fire) automatically
 * declares WAR between the involved nations if they were previously neutral.
 *
 * Peace treaties:
 *   - Reset status back to NEUTRAL.
 *   - Start a configurable cooldown (PEACE_COOLDOWN_TICKS) before war can be
 *     declared again.
 *   - Teleport any unit from each nation that is sitting on the other nation's
 *     territory back to the nearest tile its own nation controls.
 *
 * Alliances (ALLY status) are a placeholder; the UI reserves space for them but
 * no team-game logic is implemented yet.
 */

import type { GameState } from '@/managers/GameState';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import type { MovementSystem } from '@/systems/movement/MovementSystem';
import type { EntityId, GridCoordinates } from '@/types/common';
import type { SavedPeaceCooldown } from '@/types/gameSetup';
import { DiplomaticStatus } from '@/types/diplomacy';
import type { ResourceType } from '@/systems/resources/ResourceType';
import { TICK_RATE } from '@/config/constants';

/** Ticks before war can be declared again after a peace treaty (2 min at TICK_RATE=10). */
export const PEACE_COOLDOWN_TICKS = 1200;

/** Initial trade rejection backoff (10s at TICK_RATE=10). Doubles with each rejection. */
const TRADE_BACKOFF_BASE_TICKS = 10 * TICK_RATE;
/** After this many ticks without a new offer, the rejection counter resets (2 min). */
const TRADE_RESET_TICKS = 2 * 60 * TICK_RATE;
/** The AI accepts a trade if (total offer value) / (total request value) >= this ratio. */
const TRADE_FAIR_RATIO = 0.70;
/** If the AI is running low on a resource (below this amount), it weights that need strongly. */
const AI_LOW_THRESHOLD = 20;

function pairKey(a: EntityId, b: EntityId): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export class DiplomacySystem {
  /** Maps sorted nation-pair key → tick when the peace cooldown expires. */
  private readonly peaceCooldowns: Map<string, number> = new Map();

  // ── Trade backoff tracking ───────────────────────────────────────────────
  /** Maps "localId:aiId" → number of consecutive rejections. */
  private readonly tradeRejectionCount: Map<string, number> = new Map();
  /** Maps "localId:aiId" → tick when the current rejection backoff expires. */
  private readonly tradeRejectionExpiry: Map<string, number> = new Map();
  /** Maps "localId:aiId" → tick of the last trade offer (for 2m inactivity reset). */
  private readonly tradeLastOfferTick: Map<string, number> = new Map();

  constructor(
    private readonly gameState: GameState,
    private readonly eventBus:  GameEventBus,
  ) {
    // Auto-declare war when a melee battle starts
    this.eventBus.on('battle:started', ({ unitAId, unitBId, tick }) => {
      const a = this.gameState.getUnit(unitAId);
      const b = this.gameState.getUnit(unitBId);
      if (a && b) this.declareWarIfNeeded(a.getOwnerId(), b.getOwnerId(), tick);
    });

    // Auto-declare war when a city siege starts
    this.eventBus.on('city:siege-started', ({ unitId, cityId, tick }) => {
      const unit = this.gameState.getUnit(unitId);
      const city = this.gameState.getCity(cityId);
      if (unit && city) this.declareWarIfNeeded(unit.getOwnerId(), city.getOwnerId(), tick);
    });

    // Auto-declare war when a ranged unit fires at a non-allied target
    this.eventBus.on('ranged:fired', ({ unitId, targetId, targetType, tick }) => {
      const attacker = this.gameState.getUnit(unitId);
      if (!attacker) return;
      const defenderNationId = targetType === 'unit'
        ? this.gameState.getUnit(targetId)?.getOwnerId()
        : this.gameState.getCity(targetId)?.getOwnerId();
      if (defenderNationId) {
        this.declareWarIfNeeded(attacker.getOwnerId(), defenderNationId, tick);
      }
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Manually declare war between two nations.
   * Returns false if a peace cooldown is still active.
   */
  public declareWar(
    nationId1: EntityId,
    nationId2: EntityId,
    tick: number,
  ): boolean {
    if (!this.canDeclareWar(nationId1, nationId2, tick)) return false;
    const n1 = this.gameState.getNation(nationId1);
    const n2 = this.gameState.getNation(nationId2);
    if (!n1 || !n2) return false;
    if (n1.getRelation(nationId2) === DiplomaticStatus.WAR) return false;

    n1.declareWar(nationId2);
    n2.declareWar(nationId1);
    this.eventBus.emit('diplomacy:war-declared', { nationId1, nationId2, tick });
    return true;
  }

  /**
   * Propose (and immediately accept in single-player) a peace treaty.
   * Sets both nations to NEUTRAL, starts the cooldown, and returns
   * any unit sitting on the other nation's territory back to the nearest
   * tile its own nation controls.
   */
  public proposePeace(
    fromNationId:   EntityId,
    toNationId:     EntityId,
    tick:           number,
    movementSystem: MovementSystem,
  ): boolean {
    const n1 = this.gameState.getNation(fromNationId);
    const n2 = this.gameState.getNation(toNationId);
    if (!n1 || !n2) return false;
    if (n1.getRelation(toNationId) !== DiplomaticStatus.WAR) return false;

    n1.makePeace(toNationId);
    n2.makePeace(fromNationId);

    const key = pairKey(fromNationId, toNationId);
    this.peaceCooldowns.set(key, tick + PEACE_COOLDOWN_TICKS);

    // Return any unit of each nation that is on the other's territory
    this.returnUnitsFromEnemyTerritory(fromNationId, toNationId, movementSystem, tick);
    this.returnUnitsFromEnemyTerritory(toNationId, fromNationId, movementSystem, tick);

    this.eventBus.emit('diplomacy:peace-signed', { fromNationId, toNationId, tick });
    return true;
  }

  /** Returns true if the pair may go to war (no active cooldown). */
  public canDeclareWar(
    nationId1:   EntityId,
    nationId2:   EntityId,
    currentTick: number,
  ): boolean {
    const expiry = this.peaceCooldowns.get(pairKey(nationId1, nationId2)) ?? 0;
    return currentTick >= expiry;
  }

  /** Ticks remaining before war can be declared again (0 = no cooldown). */
  public getPeaceCooldownRemaining(
    nationId1:   EntityId,
    nationId2:   EntityId,
    currentTick: number,
  ): number {
    const expiry = this.peaceCooldowns.get(pairKey(nationId1, nationId2)) ?? 0;
    return Math.max(0, expiry - currentTick);
  }

  // ── Trade evaluation ────────────────────────────────────────────────────────

  /**
   * Evaluate a trade offer FROM a human player TO an AI nation.
   *
   * Returns `{ accepted: true }` or `{ accepted: false, backoffTicks: number }`.
   *
   * Acceptance criteria:
   *   1. No active backoff from a prior rejection.
   *   2. The trade is at least TRADE_FAIR_RATIO (offer value / request value >= 0.70).
   *   3. OR the AI is low on a resource it is being offered (needs-based bonus).
   *
   * On rejection the backoff doubles with each consecutive refusal and resets
   * after TRADE_RESET_TICKS of inactivity.
   */
  public evaluateTradeForAI(
    localNationId: EntityId,
    aiNationId:    EntityId,
    offer:         Partial<Record<ResourceType, number>>,
    request:       Partial<Record<ResourceType, number>>,
    currentTick:   number,
  ): { accepted: boolean; backoffTicks: number } {
    const tradeKey = `${localNationId}:${aiNationId}`;

    // ── Reset rejection counter if player was inactive for 2 min ────────────
    const lastOffer = this.tradeLastOfferTick.get(tradeKey) ?? 0;
    if (currentTick - lastOffer >= TRADE_RESET_TICKS) {
      this.tradeRejectionCount.delete(tradeKey);
      this.tradeRejectionExpiry.delete(tradeKey);
    }
    this.tradeLastOfferTick.set(tradeKey, currentTick);

    // ── Check active backoff ─────────────────────────────────────────────────
    const expiry = this.tradeRejectionExpiry.get(tradeKey) ?? 0;
    if (currentTick < expiry) {
      return { accepted: false, backoffTicks: expiry - currentTick };
    }

    // ── Compute offer / request totals ───────────────────────────────────────
    const aiTreasury = this.gameState.getNation(aiNationId)?.getTreasury();
    if (!aiTreasury) return { accepted: false, backoffTicks: 0 };

    let offerTotal   = 0;
    let requestTotal = 0;
    for (const [, amount] of Object.entries(offer))   offerTotal   += (amount ?? 0);
    for (const [, amount] of Object.entries(request)) requestTotal += (amount ?? 0);

    // Avoid division by zero on "gift" offers (no request)
    if (requestTotal === 0) {
      // Pure gift — always accepted
      return { accepted: true, backoffTicks: 0 };
    }

    // ── Needs-based bonus: AI values offered resources it is running low on ──
    let needsBonus = 0;
    for (const [type, amount] of Object.entries(offer)) {
      if ((amount ?? 0) > 0 && aiTreasury.getAmount(type as ResourceType) < AI_LOW_THRESHOLD) {
        needsBonus += (amount ?? 0) * 0.5; // weight needed resources as 50% more valuable
      }
    }
    const effectiveOfferValue = offerTotal + needsBonus;
    const fairRatio = effectiveOfferValue / requestTotal;

    if (fairRatio >= TRADE_FAIR_RATIO) {
      // Accepted — clear rejection state
      this.tradeRejectionCount.delete(tradeKey);
      this.tradeRejectionExpiry.delete(tradeKey);
      return { accepted: true, backoffTicks: 0 };
    }

    // ── Rejected — apply doubling backoff ────────────────────────────────────
    const count = (this.tradeRejectionCount.get(tradeKey) ?? 0) + 1;
    this.tradeRejectionCount.set(tradeKey, count);
    const backoffTicks = TRADE_BACKOFF_BASE_TICKS * Math.pow(2, count - 1);
    this.tradeRejectionExpiry.set(tradeKey, currentTick + backoffTicks);
    return { accepted: false, backoffTicks };
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  public toSavedState(): SavedPeaceCooldown[] {
    return Array.from(this.peaceCooldowns.entries()).map(([key, expiresAtTick]) => ({
      key,
      expiresAtTick,
    }));
  }

  public restoreState(saved: SavedPeaceCooldown[]): void {
    this.peaceCooldowns.clear();
    for (const { key, expiresAtTick } of saved) {
      this.peaceCooldowns.set(key, expiresAtTick);
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Declare war only if neither nation is already at war or allied with the other. */
  private declareWarIfNeeded(
    nationId1: EntityId,
    nationId2: EntityId,
    tick:      number,
  ): void {
    if (nationId1 === nationId2) return;
    const n1 = this.gameState.getNation(nationId1);
    const n2 = this.gameState.getNation(nationId2);
    if (!n1 || !n2) return;
    if (n1.getRelation(nationId2) === DiplomaticStatus.WAR) return;
    if (n1.isAlly(nationId2)) return;

    n1.declareWar(nationId2);
    n2.declareWar(nationId1);
    this.eventBus.emit('diplomacy:war-declared', { nationId1, nationId2, tick });
  }

  /**
   * For each unit of `nationId` that sits on territory controlled by
   * `enemyNationId`, teleport it to the nearest tile its own nation controls.
   */
  private returnUnitsFromEnemyTerritory(
    nationId:      EntityId,
    enemyNationId: EntityId,
    movementSystem: MovementSystem,
    tick:          number,
  ): void {
    const grid = this.gameState.getGrid();
    const { rows, cols } = grid.getSize();

    // Collect all tiles owned by nationId
    const ownTiles: GridCoordinates[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid.getTerritory({ row: r, col: c })?.getControllingNation() === nationId) {
          ownTiles.push({ row: r, col: c });
        }
      }
    }
    if (ownTiles.length === 0) return;

    // Track which tiles we've already assigned (to avoid stacking)
    const reserved = new Set<string>();

    for (const unit of this.gameState.getUnitsByNation(nationId)) {
      if (!unit.isAlive()) continue;
      const currCtrl = grid.getTerritory(unit.position)?.getControllingNation();
      if (currCtrl !== enemyNationId) continue; // only move units on enemy territory

      let bestPos: GridCoordinates | null = null;
      let bestDist = Infinity;

      for (const tile of ownTiles) {
        const key = `${tile.row},${tile.col}`;
        if (reserved.has(key)) continue;
        // Check no other unit already occupies this tile
        const occupied = this.gameState.getAllUnits().some(
          u => u.id !== unit.id &&
               u.position.row === tile.row &&
               u.position.col === tile.col,
        );
        if (occupied) continue;
        const dist = Math.abs(unit.position.row - tile.row) +
                     Math.abs(unit.position.col - tile.col);
        if (dist < bestDist) { bestDist = dist; bestPos = tile; }
      }

      if (bestPos) {
        movementSystem.cancelOrder(unit.id);
        const from = { ...unit.position };
        unit.moveTo({ ...bestPos });
        reserved.add(`${bestPos.row},${bestPos.col}`);
        this.eventBus.emit('unit:step-complete', {
          unitId: unit.id, from, to: { ...bestPos }, tick,
        });
      }
    }
  }
}
