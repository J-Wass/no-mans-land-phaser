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
} from '@/systems/resources/ResourceBonuses';

export const BATTLE_ROUND_TICKS = 1 * TICK_RATE;
export const MAX_BATTLE_ROUNDS = 20;
const MOMENTUM_THRESHOLD = 100;
export const BATTLE_LAND_START = 100;

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
  momentum: number;
  startedAtTick: number;
  landA: number;
  landB: number;
}

interface BattleState extends SavedBattleState {}

type BattleEndReason = 'ELIMINATION' | 'RETREAT' | 'ROUT' | 'TIMEOUT' | 'MUTUAL_DESTRUCTION' | 'LAND_LOSS';

export class BattleSystem {
  private battles: Map<string, BattleState> = new Map();
  private battleSerial = 0;

  constructor(private readonly random: () => number = Math.random) {}

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
    // Prevent immediate re-engagement after a retreat
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
      ticksUntilRound: BATTLE_ROUND_TICKS,
      roundsElapsed: 0,
      momentum: 0,
      startedAtTick: currentTick,
      landA: BATTLE_LAND_START,
      landB: BATTLE_LAND_START,
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

      battle.ticksUntilRound = BATTLE_ROUND_TICKS;
      battle.roundsElapsed++;

      const terrain       = gameState.getGrid().getTerritory(battle.position)?.getTerrainType() ?? TerrainType.PLAINS;
      const depositsA     = gameState.getNationActiveDeposits(unitA.getOwnerId());
      const depositsB     = gameState.getNationActiveDeposits(unitB.getOwnerId());
      const countsA       = gameState.getNationActiveDepositCounts(unitA.getOwnerId());
      const countsB       = gameState.getNationActiveDepositCounts(unitB.getOwnerId());
      const damageToUnitA = this.calculateDamage(unitB, unitA, terrain, battle.roundsElapsed, depositsB, depositsA, countsB, countsA);
      const damageToUnitB = this.calculateDamage(unitA, unitB, terrain, battle.roundsElapsed, depositsA, depositsB, countsA, countsB);

      unitA.takeDamage(damageToUnitA);
      unitB.takeDamage(damageToUnitB);

      // Morale damage proportional to HP fraction taken
      const moraleHitA = Math.ceil(damageToUnitA / unitA.getStats().maxHealth * 50);
      const moraleHitB = Math.ceil(damageToUnitB / unitB.getStats().maxHealth * 50);
      unitA.setMorale(unitA.getMorale() - moraleHitA);
      unitB.setMorale(unitB.getMorale() - moraleHitB);

      // Land shift based on effective orders (respects low morale)
      const effectiveA = effectiveBattleOrder(unitA);
      const effectiveB = effectiveBattleOrder(unitB);
      const landShift = getStanceLandRate(effectiveA) - getStanceLandRate(effectiveB);
      battle.landA = Math.max(0, battle.landA + landShift);
      battle.landB = Math.max(0, battle.landB - landShift);

      battle.momentum += this.calculateMomentumShift(unitA, unitB, damageToUnitA, damageToUnitB);

      eventBus.emit('battle:round-resolved', {
        battleId: battle.id,
        round: battle.roundsElapsed,
        unitAId: unitA.id,
        unitBId: unitB.id,
        damageToUnitA,
        damageToUnitB,
        momentum: battle.momentum,
        landA: battle.landA,
        landB: battle.landB,
        tick: currentTick,
      });

      // Morale rout
      const aRouted = unitA.getMorale() <= MORALE_ROUT;
      const bRouted = unitB.getMorale() <= MORALE_ROUT;
      if (aRouted || bRouted) {
        const winner = aRouted && bRouted ? null : (aRouted ? unitB : unitA);
        const loser  = aRouted && bRouted ? null : (aRouted ? unitA : unitB);
        this.finishBattle(battle, gameState, movementSystem, eventBus, currentTick, winner, loser, 'ROUT');
        continue;
      }

      // Land loss
      if (battle.landA <= 0) {
        this.finishBattle(battle, gameState, movementSystem, eventBus, currentTick, unitB, unitA, 'LAND_LOSS');
        continue;
      }
      if (battle.landB <= 0) {
        this.finishBattle(battle, gameState, movementSystem, eventBus, currentTick, unitA, unitB, 'LAND_LOSS');
        continue;
      }

      const retreatWinner = this.resolveRetreat(unitA, unitB);
      if (retreatWinner) {
        const loser = retreatWinner.id === unitA.id ? unitB : unitA;
        this.finishBattle(battle, gameState, movementSystem, eventBus, currentTick, retreatWinner, loser, 'RETREAT');
        continue;
      }

      if (!unitA.isAlive() || !unitB.isAlive()) {
        const winner = unitA.isAlive() ? unitA : unitB.isAlive() ? unitB : null;
        const loser = winner === unitA ? unitB : winner === unitB ? unitA : null;
        this.finishBattle(battle, gameState, movementSystem, eventBus, currentTick, winner, loser, winner ? 'ELIMINATION' : 'MUTUAL_DESTRUCTION');
        continue;
      }

      if (Math.abs(battle.momentum) >= MOMENTUM_THRESHOLD) {
        const winner = battle.momentum >= 0 ? unitA : unitB;
        const loser = winner.id === unitA.id ? unitB : unitA;
        this.finishBattle(battle, gameState, movementSystem, eventBus, currentTick, winner, loser, 'ROUT');
        continue;
      }

      if (battle.roundsElapsed >= MAX_BATTLE_ROUNDS) {
        const winner = this.resolveTimeoutWinner(unitA, unitB, battle.momentum);
        const loser = winner ? (winner.id === unitA.id ? unitB : unitA) : null;
        this.finishBattle(battle, gameState, movementSystem, eventBus, currentTick, winner, loser, winner ? 'TIMEOUT' : 'MUTUAL_DESTRUCTION');
      }
    }
  }

  public getBattleForUnit(unitId: EntityId): SavedBattleState | null {
    for (const battle of this.battles.values()) {
      if (battle.unitAId === unitId || battle.unitBId === unitId) return { ...battle };
    }
    return null;
  }

  public toSavedStates(): SavedBattleState[] {
    return Array.from(this.battles.values()).map(battle => ({
      ...battle,
      position: { ...battle.position },
      attackerOrigin: { ...battle.attackerOrigin },
      defenderOrigin: { ...battle.defenderOrigin },
    }));
  }

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
        landA: battle.landA ?? BATTLE_LAND_START,
        landB: battle.landB ?? BATTLE_LAND_START,
      });

      const suffix = Number.parseInt(battle.id.replace('battle-', ''), 10);
      if (Number.isFinite(suffix)) this.battleSerial = Math.max(this.battleSerial, suffix);
    }
  }

  private calculateDamage(
    attacker: Unit,
    defender: Unit,
    terrain: TerrainType,
    round: number,
    attackerDeposits: ReadonlySet<TerritoryResourceType>,
    defenderDeposits: ReadonlySet<TerritoryResourceType>,
    attackerCounts:   ReadonlyMap<TerritoryResourceType, number>,
    defenderCounts:   ReadonlyMap<TerritoryResourceType, number>,
  ): number {
    const offense    = this.getOffenseScore(attacker, defender, terrain, round, attackerDeposits, attackerCounts);
    const mitigation = this.getMitigationScore(defender, attacker, terrain, defenderDeposits, defenderCounts);
    return Math.max(1, Math.round(offense * (1 - mitigation)));
  }

  private getOffenseScore(
    attacker: Unit,
    defender: Unit,
    terrain: TerrainType,
    round: number,
    attackerDeposits: ReadonlySet<TerritoryResourceType>,
    attackerCounts:   ReadonlyMap<TerritoryResourceType, number>,
  ): number {
    const stats = attacker.getStats();
    const order = effectiveBattleOrder(attacker);
    const useRanged = stats.attackRange > 1 && stats.rangedDamage > 0 && order !== 'CHARGE';
    const rawBase   = useRanged ? Math.max(stats.rangedDamage, stats.meleeDamage * 0.7) : stats.meleeDamage;
    // Weapon tier adds flat damage before scaling
    const baseDamage = rawBase + weaponTierDamageBonus(attackerDeposits);
    const healthRatio  = attacker.getHealth() / stats.maxHealth;
    const healthFactor = 0.55 + 0.45 * healthRatio;
    const orderFactor   = getOrderAttackFactor(order, useRanged, round);
    const matchupFactor = getMatchupAttackFactor(attacker.getUnitType(), defender.getUnitType(), order, defender.getStats().armorType, useRanged);
    const terrainFactor = getTerrainAttackFactor(attacker.getUnitType(), terrain, order, useRanged);
    const fireFactor = fireManaDamageFactor(attackerDeposits, attackerCounts);
    const randomness = 0.9 + this.random() * 0.2;

    return baseDamage * healthFactor * orderFactor * matchupFactor * terrainFactor * fireFactor * randomness;
  }

  private getMitigationScore(
    defender: Unit,
    attacker: Unit,
    terrain: TerrainType,
    defenderDeposits: ReadonlySet<TerritoryResourceType>,
    defenderCounts:   ReadonlyMap<TerritoryResourceType, number>,
  ): number {
    const order        = effectiveBattleOrder(defender);
    const base         = getOrderMitigation(order);
    const terrainBonus = getTerrainMitigation(defender.getUnitType(), terrain, order);
    const matchupBonus = getMatchupMitigation(defender.getUnitType(), attacker.getUnitType(), order);
    // Earth mana grants bonus mitigation
    const earthBonus   = earthManaHPFactor(defenderDeposits, defenderCounts) - 1.0;
    return clamp(base + terrainBonus + matchupBonus + earthBonus, 0, 0.65);
  }

  private calculateMomentumShift(unitA: Unit, unitB: Unit, damageToUnitA: number, damageToUnitB: number): number {
    const damageSwing = damageToUnitB - damageToUnitA;
    const orderSwing = getOrderPressure(effectiveBattleOrder(unitA), unitA.getUnitType()) - getOrderPressure(effectiveBattleOrder(unitB), unitB.getUnitType());
    const healthSwing = Math.round((unitA.getHealth() - unitB.getHealth()) / 12);
    return damageSwing + orderSwing + healthSwing;
  }

  private resolveRetreat(unitA: Unit, unitB: Unit): Unit | null {
    const aRetreats = this.didRetreatSucceed(unitA, unitB);
    const bRetreats = this.didRetreatSucceed(unitB, unitA);

    if (aRetreats && !bRetreats) return unitB;
    if (bRetreats && !aRetreats) return unitA;
    return null;
  }

  private didRetreatSucceed(unit: Unit, opponent: Unit): boolean {
    if (effectiveBattleOrder(unit) !== 'RETREAT' || !unit.isAlive()) return false;

    // Morale rout gives guaranteed retreat
    if (unit.getMorale() <= MORALE_ROUT) return true;

    const speedDelta = unit.getStats().speed - opponent.getStats().speed;
    const chance = clamp(
      0.35 + speedDelta * 0.08 - getOrderPressure(effectiveBattleOrder(opponent), opponent.getUnitType()) / 100,
      0.15,
      0.85,
    );
    return this.random() < chance;
  }

  private resolveTimeoutWinner(unitA: Unit, unitB: Unit, momentum: number): Unit | null {
    const scoreA = unitA.getHealth() + momentum;
    const scoreB = unitB.getHealth() - momentum;
    if (scoreA === scoreB) return unitA.getHealth() >= unitB.getHealth() ? unitA : unitB;
    return scoreA > scoreB ? unitA : unitB;
  }

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

    // ── XP awards ────────────────────────────────────────────────────────────
    if (winner?.isAlive()) {
      if (loser && !loser.isAlive()) {
        winner.addXP(3); // kill
      } else if (loser?.isAlive()) {
        winner.addXP(2); // enemy retreated / routed / lost land
        loser.addXP(1);  // survived by retreating
        // Retreat cooldown — prevents immediate re-engagement for 2 seconds
        loser.setRetreatCooldownUntilTick(currentTick + 20);
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

  private findRetreatTarget(
    gameState: GameState,
    loser: Unit,
    winner: Unit | null,
    battle: BattleState,
  ): GridCoordinates | null {
    const origin = loser.id === battle.attackerId ? battle.attackerOrigin : battle.defenderOrigin;
    const occupied = new Set(
      gameState.getAllUnits()
        .filter(u => u.id !== loser.id && (!winner || u.id !== winner.id))
        .map(u => `${u.position.row},${u.position.col}`),
    );

    const isValid = (c: GridCoordinates): boolean => {
      const territory = gameState.getGrid().getTerritory(c);
      if (!territory) return false;
      if (territory.getTerrainType() === TerrainType.WATER || territory.getTerrainType() === TerrainType.MOUNTAIN) return false;
      if (occupied.has(`${c.row},${c.col}`)) return false;
      if (winner && c.row === winner.position.row && c.col === winner.position.col) return false;
      return true;
    };

    // Direction of retreat: away from battle position, towards origin
    const dr = Math.sign(origin.row - battle.position.row);
    const dc = Math.sign(origin.col - battle.position.col);

    // Try 2-tile hop in retreat direction first, then 1-tile, then adjacent
    if (dr !== 0 || dc !== 0) {
      const step1: GridCoordinates = { row: battle.position.row + dr, col: battle.position.col + dc };
      const step2: GridCoordinates = { row: step1.row + dr, col: step1.col + dc };
      if (isValid(step2)) return step2;
      if (isValid(step1)) return step1;
    }

    // Fallback: orthogonal adjacents sorted by distance from winner (prefer farther)
    const adjacents: GridCoordinates[] = [
      { row: battle.position.row - 1, col: battle.position.col },
      { row: battle.position.row + 1, col: battle.position.col },
      { row: battle.position.row,     col: battle.position.col - 1 },
      { row: battle.position.row,     col: battle.position.col + 1 },
    ];

    if (winner) {
      adjacents.sort((a, b) => {
        const da = Math.abs(a.row - winner.position.row) + Math.abs(a.col - winner.position.col);
        const db = Math.abs(b.row - winner.position.row) + Math.abs(b.col - winner.position.col);
        return db - da; // prefer farther from winner
      });
    }

    for (const candidate of adjacents) {
      if (isValid(candidate)) return { ...candidate };
    }

    return null;
  }
}

function getOrderAttackFactor(order: BattleOrder, useRanged: boolean, round: number): number {
  switch (order) {
    case 'RETREAT': return useRanged ? 0.55 : 0.35;
    case 'FALL_BACK': return useRanged ? 1.2 : 0.75;
    case 'HOLD': return useRanged ? 0.95 : 0.85;
    case 'ADVANCE': return 1;
    case 'CHARGE': return round <= 2 ? 1.35 : 1.1;
  }
}

function getOrderMitigation(order: BattleOrder): number {
  switch (order) {
    case 'RETREAT': return 0.2;
    case 'FALL_BACK': return 0.14;
    case 'HOLD': return 0.22;
    case 'ADVANCE': return 0.04;
    case 'CHARGE': return -0.08;
  }
}

function getOrderPressure(order: BattleOrder, unitType: UnitType): number {
  const base = (() => {
    switch (order) {
      case 'RETREAT': return -24;
      case 'FALL_BACK': return -8;
      case 'HOLD': return 0;
      case 'ADVANCE': return 10;
      case 'CHARGE': return 18;
    }
  })();

  if (order === 'CHARGE' && unitType === 'CAVALRY') return base + 10;
  if (order === 'HOLD' && unitType === 'HEAVY_INFANTRY') return base + 6;
  if (order === 'FALL_BACK' && unitType === 'CROSSBOWMAN') return base + 5;
  return base;
}

function getMatchupAttackFactor(
  attackerType: UnitType,
  defenderType: UnitType,
  order: BattleOrder,
  defenderArmor: 'light' | 'heavy',
  useRanged: boolean,
): number {
  let factor = 1;

  if (useRanged && defenderArmor === 'heavy') factor += 0.12;
  if (!useRanged && defenderArmor === 'heavy') factor -= 0.06;

  if (attackerType === 'CAVALRY' && order === 'CHARGE') factor += 0.22;
  if (attackerType === 'HEAVY_INFANTRY' && order === 'HOLD') factor += 0.14;
  if (attackerType === 'CROSSBOWMAN' && order === 'FALL_BACK') factor += 0.18;

  if ((attackerType === 'CATAPULT' || attackerType === 'TREBUCHET') && !useRanged) factor -= 0.3;
  if ((defenderType === 'CATAPULT' || defenderType === 'TREBUCHET') && !useRanged) factor += 0.08;

  return factor;
}

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
    case TerrainType.HILLS:
      if (useRanged) return 1.12;
      if (order === 'HOLD') return 1.05;
      return 1;
    case TerrainType.DESERT:
      if (unitType === 'CAVALRY') return 1.06;
      if (unitType === 'HEAVY_INFANTRY') return 0.95;
      return 1;
    case TerrainType.PLAINS:
      if (unitType === 'CAVALRY' && order === 'CHARGE') return 1.15;
      return 1;
    default:
      return 1;
  }
}

function getTerrainMitigation(unitType: UnitType, terrain: TerrainType, order: BattleOrder): number {
  let bonus = 0;
  if (terrain === TerrainType.FOREST && unitType !== 'CAVALRY') bonus += 0.06;
  if (terrain === TerrainType.HILLS && (order === 'HOLD' || order === 'FALL_BACK')) bonus += 0.08;
  if (terrain === TerrainType.PLAINS && unitType === 'CAVALRY' && order === 'CHARGE') bonus -= 0.04;
  return bonus;
}

function getMatchupMitigation(unitType: UnitType, attackerType: UnitType, order: BattleOrder): number {
  let bonus = 0;
  if (unitType === 'HEAVY_INFANTRY' && order === 'HOLD') bonus += 0.16;
  if (unitType === 'CROSSBOWMAN' && order === 'FALL_BACK') bonus += 0.12;
  if (unitType === 'CAVALRY' && order === 'CHARGE') bonus -= 0.08;
  if ((unitType === 'CATAPULT' || unitType === 'TREBUCHET') && attackerType !== 'CATAPULT' && attackerType !== 'TREBUCHET') {
    bonus -= 0.08;
  }
  return bonus;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Returns the effective battle order, overriding based on morale thresholds. */
function effectiveBattleOrder(unit: Unit): BattleOrder {
  const morale = unit.getMorale();
  const order  = unit.getBattleOrder();
  if (morale <= MORALE_ROUT) return 'RETREAT';
  if (morale <= MORALE_LOW && (order === 'ADVANCE' || order === 'CHARGE')) return 'HOLD';
  return order;
}

/** Land rate contribution per round (net = rateA - rateB changes landA). */
function getStanceLandRate(order: BattleOrder): number {
  switch (order) {
    case 'RETREAT':   return -10;
    case 'FALL_BACK': return -5;
    case 'HOLD':      return 0;
    case 'ADVANCE':   return 5;
    case 'CHARGE':    return 10;
  }
}
