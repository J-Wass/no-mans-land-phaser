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

export const BATTLE_ROUND_TICKS = 1 * TICK_RATE;

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
      ticksUntilRound: BATTLE_ROUND_TICKS,
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

      const terrain = gameState.getGrid().getTerritory(battle.position)?.getTerrainType() ?? TerrainType.PLAINS;
      const depositsA = gameState.getNationActiveDeposits(unitA.getOwnerId());
      const depositsB = gameState.getNationActiveDeposits(unitB.getOwnerId());
      const countsA = gameState.getNationActiveDepositCounts(unitA.getOwnerId());
      const countsB = gameState.getNationActiveDepositCounts(unitB.getOwnerId());
      const orderA = effectiveBattleOrder(unitA);
      const orderB = effectiveBattleOrder(unitB);
      const battlePaceFactor = orderA === 'ADVANCE' || orderB === 'ADVANCE' ? 1.25 : 1;

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
      );

      unitA.takeDamage(damageToUnitA);
      unitB.takeDamage(damageToUnitB);

      const moraleHitA = Math.ceil(damageToUnitA / unitA.getStats().maxHealth * 45);
      const moraleHitB = Math.ceil(damageToUnitB / unitB.getStats().maxHealth * 45);
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
      });

      const suffix = Number.parseInt(battle.id.replace('battle-', ''), 10);
      if (Number.isFinite(suffix)) this.battleSerial = Math.max(this.battleSerial, suffix);
    }
  }

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
  ): number {
    const offense = this.getOffenseScore(
      attacker,
      defender,
      terrain,
      order,
      battlePaceFactor,
      attackerDeposits,
      attackerCounts,
    );
    const mitigation = this.getMitigationScore(defender, attacker, terrain, order, defenderDeposits, defenderCounts);
    return Math.max(1, Math.round(offense * (1 - mitigation)));
  }

  private getOffenseScore(
    attacker: Unit,
    defender: Unit,
    terrain: TerrainType,
    order: BattleOrder,
    battlePaceFactor: number,
    attackerDeposits: ReadonlySet<TerritoryResourceType>,
    attackerCounts: ReadonlyMap<TerritoryResourceType, number>,
  ): number {
    const stats = attacker.getStats();
    const useRanged = stats.attackRange > 1 && stats.rangedDamage > 0 && order !== 'ADVANCE';
    const rawBase = useRanged ? Math.max(stats.rangedDamage, stats.meleeDamage * 0.7) : stats.meleeDamage;
    const baseDamage = rawBase + weaponTierDamageBonus(attackerDeposits);
    const healthRatio = attacker.getHealth() / stats.maxHealth;
    const healthFactor = 0.55 + 0.45 * healthRatio;
    const orderFactor = getOrderAttackFactor(order, attacker.getUnitType());
    const matchupFactor = getMatchupAttackFactor(attacker.getUnitType(), defender.getUnitType(), defender.getStats().armorType, useRanged);
    const terrainFactor = getTerrainAttackFactor(attacker.getUnitType(), terrain, order, useRanged);
    const fireFactor = fireManaDamageFactor(attackerDeposits, attackerCounts);
    const randomness = 0.9 + this.random() * 0.2;

    return baseDamage * healthFactor * orderFactor * matchupFactor * terrainFactor * fireFactor * battlePaceFactor * randomness;
  }

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
    return clamp(base + terrainBonus + matchupBonus + earthBonus, 0, 0.65);
  }

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
    const chance = clamp(0.3 + speedDelta * 0.07 + shadowManaWithdrawBonus(deposits, counts), 0.15, 0.9);
    if (this.random() >= chance) return false;

    return this.findRetreatTarget(gameState, unit, opponent, battle) !== null;
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

    if (winner?.isAlive()) {
      if (loser && !loser.isAlive()) {
        winner.addXP(3);
      } else if (loser?.isAlive()) {
        winner.addXP(2);
        loser.addXP(1);
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

    for (const candidate of [...candidates, ...ringTwo]) {
      if (isValid(candidate)) return { ...candidate };
    }

    return null;
  }
}

function getOrderAttackFactor(order: BattleOrder, unitType: UnitType): number {
  if (order !== 'ADVANCE') return 1;
  return unitType === 'CAVALRY' ? 1.5 : 1.25;
}

function getOrderMitigation(order: BattleOrder): number {
  switch (order) {
    case 'FALL_BACK': return 0.16;
    case 'HOLD': return 0.22;
    case 'ADVANCE': return 0.04;
  }
}

function getMatchupAttackFactor(
  attackerType: UnitType,
  defenderType: UnitType,
  defenderArmor: 'light' | 'heavy',
  useRanged: boolean,
): number {
  let factor = 1;

  if (useRanged && defenderArmor === 'heavy') factor += 0.12;
  if (!useRanged && defenderArmor === 'heavy') factor -= 0.06;
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
      if (unitType === 'CAVALRY' && order === 'ADVANCE') return 1.12;
      return 1;
    default:
      return 1;
  }
}

function getTerrainMitigation(unitType: UnitType, terrain: TerrainType, order: BattleOrder): number {
  let bonus = 0;
  if (terrain === TerrainType.FOREST && unitType !== 'CAVALRY') bonus += 0.06;
  if (terrain === TerrainType.HILLS && (order === 'HOLD' || order === 'FALL_BACK')) bonus += 0.08;
  if (terrain === TerrainType.PLAINS && unitType === 'CAVALRY' && order === 'ADVANCE') bonus -= 0.04;
  return bonus;
}

function getMatchupMitigation(unitType: UnitType, attackerType: UnitType, order: BattleOrder): number {
  let bonus = 0;
  if (unitType === 'HEAVY_INFANTRY' && order === 'HOLD') bonus += 0.16;
  if (unitType === 'CROSSBOWMAN' && order === 'FALL_BACK') bonus += 0.12;
  if ((unitType === 'CATAPULT' || unitType === 'TREBUCHET') && attackerType !== 'CATAPULT' && attackerType !== 'TREBUCHET') {
    bonus -= 0.08;
  }
  return bonus;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function effectiveBattleOrder(unit: Unit): BattleOrder {
  const morale = unit.getMorale();
  const order = unit.getBattleOrder();
  if (morale <= MORALE_ROUT) return order === 'FALL_BACK' ? 'FALL_BACK' : 'HOLD';
  if (morale <= MORALE_LOW && order === 'ADVANCE') return 'HOLD';
  return order;
}
