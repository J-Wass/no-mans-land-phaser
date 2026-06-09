import type { EntityId, GridCoordinates } from '@/types/common';
import type { Unit, BattleOrder, UnitType } from '@/entities/units/Unit';
import { MORALE_LOW, MORALE_ROUT } from '@/entities/units/Unit';
import type { GameState } from '@/managers/GameState';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import type { MovementSystem } from '@/systems/movement/MovementSystem';
import { TerrainType } from '@/systems/grid/Territory';
import { TICK_RATE } from '@/config/constants';
import type { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import {
  weaponTierDamageBonus,
  fireManaDamageFactor,
  earthManaHPFactor,
  shadowManaWithdrawBonus,
} from '@/systems/resources/ResourceBonuses';
import {
  healthFactor,
  damageVariance,
  MORALE_DAMAGE_SCALAR,
  ADVANCE_PACE_FACTOR,
  MITIGATION_CAP,
  WITHDRAW_BASE_CHANCE,
  WITHDRAW_SPEED_WEIGHT,
  WITHDRAW_CHANCE_MIN,
  WITHDRAW_CHANCE_MAX,
  RETREAT_COOLDOWN_TICKS,
  XP_KILL,
  XP_WIN,
  XP_LOSS,
  XP_RANGED_HIT,
  veteranDamageMultiplier,
} from '@/config/combatBalance';

/** Round cadence for sieges and territory battles (1 s at TICK_RATE=10). */
export const BATTLE_ROUND_TICKS = 1 * TICK_RATE;

/**
 * Unit-vs-unit melee resolves on a slower cadence so clashes read as a drawn-out
 * fight rather than an instant exchange. Pure pacing — total damage is unchanged.
 */
export const UNIT_BATTLE_ROUND_TICKS = 2 * TICK_RATE;

export interface SavedBattleState {
  id: string;
  unitAId: EntityId;
  unitBId: EntityId;
  position: GridCoordinates;
  attackerId: EntityId;
  attackerOrigin: GridCoordinates;
  defenderOrigin: GridCoordinates;
  ticksUntilRound: number;
  roundsElapsed: number;
  startedAtTick: number;
}

interface BattleState extends SavedBattleState {}

type BattleEndReason = 'ELIMINATION' | 'WITHDRAW' | 'ROUT' | 'MUTUAL_DESTRUCTION';

export class BattleSystem {
  private battles: Map<string, BattleState> = new Map();
  private battleSerial = 0;

  constructor(private readonly random: () => number = Math.random) {}

  /**
   * Engage two enemy units in a battle. Returns the new battle id, or null if
   * either is dead, already fighting, on retreat cooldown, or same-owner.
   * The first round resolves UNIT_BATTLE_ROUND_TICKS ticks from now.
   */
  public startBattle(
    attacker: Unit,
    defender: Unit,
    attackerOrigin: GridCoordinates,
    position: GridCoordinates,
    currentTick: number,
    movementSystem: MovementSystem,
    eventBus: GameEventBus,
  ): string | null {
    if (!attacker.isAlive() || !defender.isAlive()) return null;
    if (attacker.getOwnerId() === defender.getOwnerId()) return null;
    if (attacker.isEngagedInBattle() || defender.isEngagedInBattle()) return null;
    if (attacker.getRetreatCooldownUntilTick() > currentTick) return null;
    if (defender.getRetreatCooldownUntilTick() > currentTick) return null;

    const battleId = `battle-${++this.battleSerial}`;
    const battle: BattleState = {
      id: battleId,
      unitAId: attacker.id,
      unitBId: defender.id,
      position: { ...position },
      attackerId: attacker.id,
      attackerOrigin: { ...attackerOrigin },
      defenderOrigin: { ...defender.position },
      ticksUntilRound: UNIT_BATTLE_ROUND_TICKS,
      roundsElapsed: 0,
      startedAtTick: currentTick,
    };

    attacker.setEngagedInBattle(true);
    defender.setEngagedInBattle(true);
    movementSystem.cancelOrder(attacker.id);
    movementSystem.cancelOrder(defender.id);
    this.battles.set(battleId, battle);

    eventBus.emit('battle:started', {
      battleId,
      unitAId: attacker.id,
      unitBId: defender.id,
      position: { ...position },
      tick: currentTick,
    });

    return battleId;
  }

  /**
   * Per-tick heartbeat for all active battles. When a battle's round timer
   * expires, both units deal damage to each other simultaneously, lose morale
   * proportional to wounds taken, then the battle ends if either dies,
   * withdraws, or routs (checked in that order).
   */
  public tick(
    gameState: GameState,
    movementSystem: MovementSystem,
    eventBus: GameEventBus,
    currentTick: number,
  ): void {
    for (const battle of this.battles.values()) {
      const unitA = gameState.getUnit(battle.unitAId);
      const unitB = gameState.getUnit(battle.unitBId);

      if (!unitA || !unitB) {
        this.finishBattle(battle, gameState, movementSystem, eventBus, currentTick, null, null, 'MUTUAL_DESTRUCTION');
        continue;
      }

      if (!unitA.isAlive() || !unitB.isAlive()) {
        const winner = unitA.isAlive() ? unitA : unitB.isAlive() ? unitB : null;
        const loser = winner === unitA ? unitB : winner === unitB ? unitA : null;
        this.finishBattle(battle, gameState, movementSystem, eventBus, currentTick, winner, loser, winner ? 'ELIMINATION' : 'MUTUAL_DESTRUCTION');
        continue;
      }

      battle.ticksUntilRound--;
      if (battle.ticksUntilRound > 0) continue;

      battle.ticksUntilRound = UNIT_BATTLE_ROUND_TICKS;
      battle.roundsElapsed++;

      const terrain = gameState.getGrid().getTerritory(battle.position)?.getTerrainType() ?? TerrainType.PLAINS;
      const depositsA = gameState.getNationActiveDeposits(unitA.getOwnerId());
      const depositsB = gameState.getNationActiveDeposits(unitB.getOwnerId());
      const countsA = gameState.getNationActiveDepositCounts(unitA.getOwnerId());
      const countsB = gameState.getNationActiveDepositCounts(unitB.getOwnerId());
      const orderA = effectiveBattleOrder(unitA);
      const orderB = effectiveBattleOrder(unitB);
      const battlePaceFactor = orderA === 'ADVANCE' || orderB === 'ADVANCE' ? ADVANCE_PACE_FACTOR : 1;
      const kinematicsA = gameState.getNation(unitA.getOwnerId())?.hasResearched('kinematics') ?? false;
      const kinematicsB = gameState.getNation(unitB.getOwnerId())?.hasResearched('kinematics') ?? false;

      const damageToUnitA = this.calculateDamage(
        unitB,
        unitA,
        terrain,
        orderB,
        battlePaceFactor,
        depositsB,
        countsB,
        depositsA,
        countsA,
        kinematicsB,
      );
      const damageToUnitB = this.calculateDamage(
        unitA,
        unitB,
        terrain,
        orderA,
        battlePaceFactor,
        depositsA,
        countsA,
        depositsB,
        countsB,
        kinematicsA,
      );

      unitA.takeDamage(damageToUnitA);
      unitB.takeDamage(damageToUnitB);

      // Ranged attackers earn a bit of XP for landing fire (damageToUnitB is dealt by unitA, etc.).
      if (damageToUnitB > 0 && usesRangedAttack(unitA, orderA)) unitA.addXP(XP_RANGED_HIT);
      if (damageToUnitA > 0 && usesRangedAttack(unitB, orderB)) unitB.addXP(XP_RANGED_HIT);

      const moraleHitA = Math.ceil(damageToUnitA / unitA.getStats().maxHealth * MORALE_DAMAGE_SCALAR);
      const moraleHitB = Math.ceil(damageToUnitB / unitB.getStats().maxHealth * MORALE_DAMAGE_SCALAR);
      unitA.setMorale(unitA.getMorale() - moraleHitA);
      unitB.setMorale(unitB.getMorale() - moraleHitB);

      eventBus.emit('battle:round-resolved', {
        battleId: battle.id,
        round: battle.roundsElapsed,
        unitAId: unitA.id,
        unitBId: unitB.id,
        damageToUnitA,
        damageToUnitB,
        tick: currentTick,
      });

      if (!unitA.isAlive() || !unitB.isAlive()) {
        const winner = unitA.isAlive() ? unitA : unitB.isAlive() ? unitB : null;
        const loser = winner === unitA ? unitB : winner === unitB ? unitA : null;
        this.finishBattle(battle, gameState, movementSystem, eventBus, currentTick, winner, loser, winner ? 'ELIMINATION' : 'MUTUAL_DESTRUCTION');
        continue;
      }

      const withdrew = this.resolveWithdraw(gameState, battle, unitA, unitB);
      if (withdrew) {
        const winner = withdrew.id === unitA.id ? unitB : unitA;
        this.finishBattle(battle, gameState, movementSystem, eventBus, currentTick, winner, withdrew, 'WITHDRAW');
        continue;
      }

      const aRouted = unitA.getMorale() <= MORALE_ROUT;
      const bRouted = unitB.getMorale() <= MORALE_ROUT;
      if (aRouted || bRouted) {
        const loser = aRouted && !bRouted ? unitA : bRouted && !aRouted ? unitB : null;
        const winner = loser ? (loser.id === unitA.id ? unitB : unitA) : null;
        this.finishBattle(battle, gameState, movementSystem, eventBus, currentTick, winner, loser, loser ? 'ROUT' : 'MUTUAL_DESTRUCTION');
      }
    }
  }

  /** The battle this unit is currently engaged in, or null. Returns a deep copy. */
  public getBattleForUnit(unitId: EntityId): SavedBattleState | null {
    for (const battle of this.battles.values()) {
      if (battle.unitAId === unitId || battle.unitBId === unitId) return { ...battle };
    }
    return null;
  }

  /** Serialize all active battles for save-game (deep-copies coordinates). */
  public toSavedStates(): SavedBattleState[] {
    return Array.from(this.battles.values()).map(battle => ({
      ...battle,
      position: { ...battle.position },
      attackerOrigin: { ...battle.attackerOrigin },
      defenderOrigin: { ...battle.defenderOrigin },
    }));
  }

  /**
   * Rehydrate battles from a save. Skips entries whose units no longer exist,
   * re-marks survivors as engaged, and advances the serial counter so freshly
   * started battles get unique ids.
   */
  public restore(saved: SavedBattleState[], gameState: GameState): void {
    this.battles.clear();
    this.battleSerial = 0;

    for (const battle of saved) {
      const unitA = gameState.getUnit(battle.unitAId);
      const unitB = gameState.getUnit(battle.unitBId);
      if (!unitA || !unitB) continue;

      unitA.setEngagedInBattle(true);
      unitB.setEngagedInBattle(true);
      this.battles.set(battle.id, {
        ...battle,
        position: { ...battle.position },
        attackerOrigin: { ...battle.attackerOrigin },
        defenderOrigin: { ...battle.defenderOrigin },
      });

      const suffix = Number.parseInt(battle.id.replace('battle-', ''), 10);
      if (Number.isFinite(suffix)) this.battleSerial = Math.max(this.battleSerial, suffix);
    }
  }

  /**
   * One-round damage one unit deals to the other.
   * Formula: max(1, round(offense × (1 - mitigation))). The floor of 1 means
   * even a perfectly-mitigated attack still chips a sliver of HP, so battles
   * can't stall forever.
   */
  private calculateDamage(
    attacker: Unit,
    defender: Unit,
    terrain: TerrainType,
    order: BattleOrder,
    battlePaceFactor: number,
    attackerDeposits: ReadonlySet<TerritoryResourceType>,
    attackerCounts: ReadonlyMap<TerritoryResourceType, number>,
    defenderDeposits: ReadonlySet<TerritoryResourceType>,
    defenderCounts: ReadonlyMap<TerritoryResourceType, number>,
    attackerHasKinematics = false,
  ): number {
    const offense = this.getOffenseScore(
      attacker,
      defender,
      terrain,
      order,
      battlePaceFactor,
      attackerDeposits,
      attackerCounts,
      attackerHasKinematics,
    );
    const mitigation = this.getMitigationScore(defender, attacker, terrain, order, defenderDeposits, defenderCounts);
    return Math.max(1, Math.round(offense * (1 - mitigation)));
  }

  /**
   * Pre-mitigation outgoing damage, built as a multiplicative chain:
   *   baseDamage (ranged unless ADVANCEing; + weapon-tier + Kinematics; × veteran)
   *   × hpFactor       (wounded units hit softer; range [0.55, 1.0])
   *   × orderFactor    (ADVANCE: 1.5× Cavalry, 1.25× others)
   *   × matchupFactor  (armor and siege adjustments — no unit counters)
   *   × terrainFactor  (unit-type × tile)
   *   × fireFactor     (Fire Mana bonus)
   *   × battlePaceFactor (any ADVANCEr speeds the exchange up)
   *   × randomness     (±10% per round)
   */
  private getOffenseScore(
    attacker: Unit,
    defender: Unit,
    terrain: TerrainType,
    order: BattleOrder,
    battlePaceFactor: number,
    attackerDeposits: ReadonlySet<TerritoryResourceType>,
    attackerCounts: ReadonlyMap<TerritoryResourceType, number>,
    attackerHasKinematics = false,
  ): number {
    const stats = attacker.getStats();
    const useRanged = stats.attackRange > 1 && stats.rangedDamage > 0 && order !== 'ADVANCE';
    const rawBase = useRanged ? Math.max(stats.rangedDamage, stats.meleeDamage * 0.7) : stats.meleeDamage;
    const isSiege = attacker.getUnitType() === 'CATAPULT' || attacker.getUnitType() === 'TREBUCHET';
    const kinematicsBonus = attackerHasKinematics && useRanged && isSiege ? 3 : 0;
    const baseDamage = (rawBase + weaponTierDamageBonus(attackerDeposits) + kinematicsBonus)
      * veteranDamageMultiplier(attacker.getVeteranLevel());
    const hpFactor = healthFactor(attacker.getHealth(), stats.maxHealth);
    const orderFactor = getOrderAttackFactor(order, attacker.getUnitType());
    const matchupFactor = getMatchupAttackFactor(attacker.getUnitType(), defender.getUnitType(), defender.getStats().armorType, useRanged);
    const terrainFactor = getTerrainAttackFactor(attacker.getUnitType(), terrain, order, useRanged);
    const fireFactor = fireManaDamageFactor(attackerDeposits, attackerCounts);
    const randomness = damageVariance(this.random());

    return baseDamage * hpFactor * orderFactor * matchupFactor * terrainFactor * fireFactor * battlePaceFactor * randomness;
  }

  /**
   * Damage-reduction percentage applied to incoming offense. Components are
   * ADDED (not multiplied):
   *   base order mitigation (FALL_BACK 0.16, HOLD 0.22, ADVANCE 0.04)
   *   + terrain mitigation (forest cover, snow dig-in, etc.)
   *   + matchup mitigation (e.g. Heavy Infantry HOLD +0.16)
   *   + Earth Mana bonus
   * Clamped to [0, MITIGATION_CAP] so a defender can never become unkillable.
   */
  private getMitigationScore(
    defender: Unit,
    attacker: Unit,
    terrain: TerrainType,
    order: BattleOrder,
    defenderDeposits: ReadonlySet<TerritoryResourceType>,
    defenderCounts: ReadonlyMap<TerritoryResourceType, number>,
  ): number {
    const base = getOrderMitigation(order);
    const terrainBonus = getTerrainMitigation(defender.getUnitType(), terrain, order);
    const matchupBonus = getMatchupMitigation(defender.getUnitType(), attacker.getUnitType(), order);
    const earthBonus = earthManaHPFactor(defenderDeposits, defenderCounts) - 1.0;
    return clamp(base + terrainBonus + matchupBonus + earthBonus, 0, MITIGATION_CAP);
  }

  /**
   * After damage resolves, both sides roll independently to flee. The battle
   * ends via WITHDRAW only if exactly one succeeds — neither/both succeeding
   * means the fight continues another round.
   */
  private resolveWithdraw(
    gameState: GameState,
    battle: BattleState,
    unitA: Unit,
    unitB: Unit,
  ): Unit | null {
    const aWithdraws = this.didWithdrawSucceed(gameState, battle, unitA, unitB);
    const bWithdraws = this.didWithdrawSucceed(gameState, battle, unitB, unitA);

    if (aWithdraws && !bWithdraws) return unitA;
    if (bWithdraws && !aWithdraws) return unitB;
    return null;
  }

  /**
   * A flee attempt requires effective order = FALL_BACK. Probability =
   * WITHDRAW_BASE_CHANCE + (own speed − opponent speed) × WITHDRAW_SPEED_WEIGHT
   * + Shadow Mana bonus, clamped to [MIN, MAX]. The roll only counts if a
   * valid retreat tile exists to fall back to.
   */
  private didWithdrawSucceed(
    gameState: GameState,
    battle: BattleState,
    unit: Unit,
    opponent: Unit,
  ): boolean {
    if (effectiveBattleOrder(unit) !== 'FALL_BACK' || !unit.isAlive()) return false;

    const deposits = gameState.getNationActiveDeposits(unit.getOwnerId());
    const counts = gameState.getNationActiveDepositCounts(unit.getOwnerId());
    const speedDelta = unit.getStats().speed - opponent.getStats().speed;
    const chance = clamp(
      WITHDRAW_BASE_CHANCE + speedDelta * WITHDRAW_SPEED_WEIGHT + shadowManaWithdrawBonus(deposits, counts),
      WITHDRAW_CHANCE_MIN,
      WITHDRAW_CHANCE_MAX,
    );
    if (this.random() >= chance) return false;

    return this.findRetreatTarget(gameState, unit, opponent, battle) !== null;
  }

  /**
   * End-of-battle cleanup: clear engaged flags, cancel queued movement, award
   * XP (kill / win / loss), set a retreat cooldown on the loser, then either
   * remove the dead or move the loser to a retreat tile. A loser with no
   * valid retreat tile is killed in place.
   */
  private finishBattle(
    battle: BattleState,
    gameState: GameState,
    movementSystem: MovementSystem,
    eventBus: GameEventBus,
    currentTick: number,
    winner: Unit | null,
    loser: Unit | null,
    reason: BattleEndReason,
  ): void {
    const unitA = gameState.getUnit(battle.unitAId);
    const unitB = gameState.getUnit(battle.unitBId);
    unitA?.setEngagedInBattle(false);
    unitB?.setEngagedInBattle(false);
    unitA?.incrementBattlesEngaged();
    unitB?.incrementBattlesEngaged();
    movementSystem.cancelOrder(battle.unitAId);
    movementSystem.cancelOrder(battle.unitBId);

    if (winner?.isAlive()) {
      if (loser && !loser.isAlive()) {
        winner.addXP(XP_KILL);
      } else if (loser?.isAlive()) {
        winner.addXP(XP_WIN);
        loser.addXP(XP_LOSS);
        loser.setRetreatCooldownUntilTick(currentTick + RETREAT_COOLDOWN_TICKS);
      }
    }

    if (loser) {
      if (!loser.isAlive()) {
        gameState.removeUnit(loser.id);
        eventBus.emit('unit:destroyed', { unitId: loser.id, byUnitId: winner?.id ?? null, tick: currentTick });
      } else {
        const retreatTarget = this.findRetreatTarget(gameState, loser, winner, battle);
        if (retreatTarget) {
          const from = loser.position;
          loser.moveTo(retreatTarget);
          eventBus.emit('unit:step-complete', {
            unitId: loser.id,
            from,
            to: retreatTarget,
            tick: currentTick,
          });
          eventBus.emit('unit:withdrew', {
            unitId: loser.id,
            from,
            to: retreatTarget,
            tick: currentTick,
          });
        } else {
          gameState.removeUnit(loser.id);
          eventBus.emit('unit:destroyed', { unitId: loser.id, byUnitId: winner?.id ?? null, tick: currentTick });
        }
      }
    }

    if (winner && !winner.isAlive()) {
      gameState.removeUnit(winner.id);
      eventBus.emit('unit:destroyed', { unitId: winner.id, byUnitId: loser?.id ?? null, tick: currentTick });
      winner = null;
    }

    this.battles.delete(battle.id);
    eventBus.emit('battle:ended', {
      battleId: battle.id,
      winnerUnitId: winner?.id ?? null,
      loserUnitId: loser?.id ?? null,
      reason,
      tick: currentTick,
    });
  }

  /**
   * Pick the tile the loser flees to. Priority order:
   *   1. Two tiles back along the loser's incoming direction (and the diagonals
   *      of that direction).
   *   2. Chebyshev-distance-2 ring around the battle, sorted to maximize
   *      distance from the winner.
   *   3. Expanding rings of radius 3..6 (findFallbackRetreatRing).
   * Prefers friendly or neutral territory; falls back to any unoccupied
   * passable tile (water and mountain excluded). Returns null if nothing
   * is reachable, in which case the caller kills the unit instead.
   */
  private findRetreatTarget(
    gameState: GameState,
    loser: Unit,
    winner: Unit | null,
    battle: BattleState,
  ): GridCoordinates | null {
    const origin = loser.id === battle.attackerId ? battle.attackerOrigin : battle.defenderOrigin;
    const occupied = new Set(
      gameState.getAllUnits()
        .filter(unit => unit.id !== loser.id && (!winner || unit.id !== winner.id))
        .map(unit => `${unit.position.row},${unit.position.col}`),
    );

    const isValid = (coords: GridCoordinates): boolean => {
      const territory = gameState.getGrid().getTerritory(coords);
      if (!territory) return false;
      if (territory.getTerrainType() === TerrainType.WATER || territory.getTerrainType() === TerrainType.MOUNTAIN) return false;
      if (occupied.has(`${coords.row},${coords.col}`)) return false;
      if (winner && coords.row === winner.position.row && coords.col === winner.position.col) return false;
      return true;
    };

    const dr = Math.sign(origin.row - battle.position.row);
    const dc = Math.sign(origin.col - battle.position.col);
    const candidates: GridCoordinates[] = [];

    if (dr !== 0 || dc !== 0) {
      candidates.push({ row: battle.position.row + dr * 2, col: battle.position.col + dc * 2 });
      candidates.push({ row: battle.position.row + dr * 2, col: battle.position.col });
      candidates.push({ row: battle.position.row, col: battle.position.col + dc * 2 });
      candidates.push({ row: battle.position.row + dr * 2, col: battle.position.col + dc });
      candidates.push({ row: battle.position.row + dr, col: battle.position.col + dc * 2 });
    }

    const ringTwo: GridCoordinates[] = [
      { row: battle.position.row - 2, col: battle.position.col },
      { row: battle.position.row + 2, col: battle.position.col },
      { row: battle.position.row, col: battle.position.col - 2 },
      { row: battle.position.row, col: battle.position.col + 2 },
      { row: battle.position.row - 1, col: battle.position.col - 1 },
      { row: battle.position.row - 1, col: battle.position.col + 1 },
      { row: battle.position.row + 1, col: battle.position.col - 1 },
      { row: battle.position.row + 1, col: battle.position.col + 1 },
    ];

    if (winner) {
      ringTwo.sort((a, b) => {
        const da = Math.abs(a.row - winner.position.row) + Math.abs(a.col - winner.position.col);
        const db = Math.abs(b.row - winner.position.row) + Math.abs(b.col - winner.position.col);
        return db - da;
      });
    }

    const ordered = [...candidates, ...ringTwo, ...this.findFallbackRetreatRing(battle.position, origin)];
    const safe = ordered.find(candidate => {
      if (!isValid(candidate)) return false;
      const owner = gameState.getGrid().getTerritory(candidate)?.getControllingNation();
      return !owner || owner === loser.getOwnerId();
    });
    if (safe) return { ...safe };

    const fallback = ordered.find(isValid);
    if (fallback) return { ...fallback };

    return null;
  }

  /**
   * Last-resort retreat candidates: every tile on the Chebyshev rings of
   * radius 3 through 6 around the battle, sorted nearest-to-origin first
   * (i.e. "run toward home" when there's nowhere safer to go).
   */
  private findFallbackRetreatRing(position: GridCoordinates, origin: GridCoordinates): GridCoordinates[] {
    const candidates: GridCoordinates[] = [];
    for (let radius = 3; radius <= 6; radius++) {
      for (let row = position.row - radius; row <= position.row + radius; row++) {
        for (let col = position.col - radius; col <= position.col + radius; col++) {
          if (Math.max(Math.abs(row - position.row), Math.abs(col - position.col)) !== radius) continue;
          candidates.push({ row, col });
        }
      }
    }
    candidates.sort((a, b) => {
      const da = Math.abs(a.row - origin.row) + Math.abs(a.col - origin.col);
      const db = Math.abs(b.row - origin.row) + Math.abs(b.col - origin.col);
      return da - db;
    });
    return candidates;
  }
}

/**
 * ADVANCE-stance attack multiplier. Cavalry uniquely gets 1.5× (the only
 * unit-type bonus hardcoded into offense); everyone else gets 1.25×.
 * HOLD and FALL_BACK pay their dues in mitigation, not here.
 */
function getOrderAttackFactor(order: BattleOrder, unitType: UnitType): number {
  if (order !== 'ADVANCE') return 1;
  return unitType === 'CAVALRY' ? 1.5 : 1.25;
}

/**
 * Baseline damage reduction by stance, before terrain and matchup bonuses.
 * FALL_BACK 0.16, HOLD 0.22, ADVANCE 0.04 — pressing forward leaves you exposed.
 */
function getOrderMitigation(order: BattleOrder): number {
  switch (order) {
    case 'FALL_BACK': return 0.16;
    case 'HOLD': return 0.22;
    case 'ADVANCE': return 0.04;
  }
}

/**
 * Per-attack matchup modifier. Combines universal armor rules with unit-specific
 * rock-paper-scissors counters. All effects stack additively.
 *
 * Universal armor:
 *   ranged volley vs heavy armor:        +12%  (arrows punch plate)
 *   melee swing  vs heavy armor:          -6%  (sword glances off plate)
 *
 * Siege in close combat:
 *   siege attacker in melee:             -30%  (catapults can't brawl)
 *   anything else hitting siege in melee: +8%  (catapults can't dodge)
 *
 * Unit-specific counters (offense):
 *   Heavy Infantry vs Cavalry:           +35%  (spear-wall / pike anti-cavalry)
 *   Heavy Infantry vs light armor:       +15%  (armored line crushes skirmishers)
 *   Crossbowman   vs heavy armor:        +10%  (armor-piercing bolts; stacks with the +12% ranged-vs-heavy)
 *   Crossbowman   vs Cavalry:            +35%  (well-aimed shots into the charge; stacks with the heavy-armor bonuses)
 *   Catapult / Trebuchet vs heavy armor: +20%  (boulders ignore plate)
 *   Catapult / Trebuchet vs light armor: -25%  (slow projectiles miss fast targets)
 */
function getMatchupAttackFactor(
  attackerType: UnitType,
  defenderType: UnitType,
  defenderArmor: 'light' | 'heavy',
  useRanged: boolean,
): number {
  let factor = 1;

  // Universal armor rules
  if (useRanged && defenderArmor === 'heavy') factor += 0.12;
  if (!useRanged && defenderArmor === 'heavy') factor -= 0.06;

  // Siege is helpless in melee, and easy prey when shoved into one
  if ((attackerType === 'CATAPULT' || attackerType === 'TREBUCHET') && !useRanged) factor -= 0.3;
  if ((defenderType === 'CATAPULT' || defenderType === 'TREBUCHET') && !useRanged) factor += 0.08;

  // Heavy Infantry: spear-wall anti-cavalry; also crushes light skirmishers
  if (attackerType === 'HEAVY_INFANTRY' && defenderType === 'CAVALRY') factor += 0.35;
  if (attackerType === 'HEAVY_INFANTRY' && defenderArmor === 'light') factor += 0.15;

  // Crossbowman: armor-piercing bolts (stacks with the universal ranged-vs-heavy)
  if (attackerType === 'CROSSBOWMAN' && defenderArmor === 'heavy') factor += 0.10;

  // Crossbowman vs Cavalry: extra punishment for cavalry that closes on a crossbow line.
  // Stacks with the heavy-armor bonuses above for a total of +57% offense.
  if (attackerType === 'CROSSBOWMAN' && defenderType === 'CAVALRY') factor += 0.35;

  // Siege weapons: anti-armor specialists, hopeless against fast/light units
  if ((attackerType === 'CATAPULT' || attackerType === 'TREBUCHET') && useRanged) {
    if (defenderArmor === 'heavy') factor += 0.20;
    if (defenderArmor === 'light') factor -= 0.25;
  }

  return factor;
}

/**
 * Attacker's tile-specific multiplier.
 *   FOREST:      Cavalry crippled 0.82×; ranged 0.94×; melee 1.08×.
 *   SNOW_FOREST: ranged +12%; HOLD +5% — favors dug-in shooters.
 *   DESERT:      Cavalry +6%; Heavy Infantry 0.95× (plate broils).
 *   PLAINS:      Cavalry +12% on ADVANCE — their signature charge bonus.
 */
function getTerrainAttackFactor(
  unitType: UnitType,
  terrain: TerrainType,
  order: BattleOrder,
  useRanged: boolean,
): number {
  switch (terrain) {
    case TerrainType.FOREST:
      if (unitType === 'CAVALRY') return 0.82;
      if (useRanged) return 0.94;
      return 1.08;
    case TerrainType.SNOW_FOREST:
      if (useRanged) return 1.12;
      if (order === 'HOLD') return 1.05;
      return 1;
    case TerrainType.DESERT:
      if (unitType === 'CAVALRY') return 1.06;
      if (unitType === 'HEAVY_INFANTRY') return 0.95;
      return 1;
    case TerrainType.PLAINS:
      if (unitType === 'CAVALRY' && order === 'ADVANCE') return 1.12;
      return 1;
    default:
      return 1;
  }
}

/**
 * Defender's terrain bonus. Forest cover +6% for everyone except Cavalry
 * (can't hide a horse). Snow-forest dug-in (HOLD/FALL_BACK) +8%. Charging
 * Cavalry on plains takes a -4% defensive hit — the cost of momentum.
 */
function getTerrainMitigation(unitType: UnitType, terrain: TerrainType, order: BattleOrder): number {
  let bonus = 0;
  if (terrain === TerrainType.FOREST && unitType !== 'CAVALRY') bonus += 0.06;
  if (terrain === TerrainType.SNOW_FOREST && (order === 'HOLD' || order === 'FALL_BACK')) bonus += 0.08;
  if (terrain === TerrainType.PLAINS && unitType === 'CAVALRY' && order === 'ADVANCE') bonus -= 0.04;
  return bonus;
}

/**
 * Defensive bonuses tied to specific unit+stance combos:
 *   Heavy Infantry HOLD:               +16% (shield wall — its signature bonus)
 *   Crossbowman    FALL_BACK:          +12% (kiting tax on pursuers)
 *   Siege hit in melee by non-siege:    -8% (sitting ducks if shoved up close)
 *
 * Anti-cavalry mitigation (applies in any stance, mitigation is clamped at MITIGATION_CAP):
 *   Heavy Infantry being hit by Cavalry: +50% (planted spears soak the charge)
 *   Crossbowman    being hit by Cavalry: +55% (stakes / pavise behind the line)
 * These bonuses are intentionally large because base order mitigation keys off the
 * ATTACKER's stance, so a defending unit's own stance contributes nothing to its
 * survival when an ADVANCing cavalryman pins them.
 */
function getMatchupMitigation(unitType: UnitType, attackerType: UnitType, order: BattleOrder): number {
  let bonus = 0;
  if (unitType === 'HEAVY_INFANTRY' && order === 'HOLD') bonus += 0.16;
  if (unitType === 'CROSSBOWMAN' && order === 'FALL_BACK') bonus += 0.12;
  if ((unitType === 'CATAPULT' || unitType === 'TREBUCHET') && attackerType !== 'CATAPULT' && attackerType !== 'TREBUCHET') {
    bonus -= 0.08;
  }

  // Anti-cavalry defensive counters
  if (unitType === 'HEAVY_INFANTRY' && attackerType === 'CAVALRY') bonus += 0.50;
  if (unitType === 'CROSSBOWMAN'    && attackerType === 'CAVALRY') bonus += 0.55;

  return bonus;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * A unit fires at range when it has reach (range > 1) and a ranged stat — EXCEPT
 * when ADVANCEing, which forces melee even for ranged units. Shared by the
 * damage formula and the XP system so they agree on the same condition.
 */
function usesRangedAttack(unit: Unit, order: BattleOrder): boolean {
  const stats = unit.getStats();
  return stats.attackRange > 1 && stats.rangedDamage > 0 && order !== 'ADVANCE';
}

/**
 * Morale can override the player's chosen stance:
 *   ≤ MORALE_ROUT: troops break — only FALL_BACK is honored; anything else
 *                  collapses to HOLD (paralyzed in place).
 *   ≤ MORALE_LOW:  too shaken to ADVANCE; downgraded to HOLD.
 *   Otherwise:     the chosen order stands.
 */
function effectiveBattleOrder(unit: Unit): BattleOrder {
  const morale = unit.getMorale();
  const order = unit.getBattleOrder();
  if (morale <= MORALE_ROUT) return order === 'FALL_BACK' ? 'FALL_BACK' : 'HOLD';
  if (morale <= MORALE_LOW && order === 'ADVANCE') return 'HOLD';
  return order;
}
