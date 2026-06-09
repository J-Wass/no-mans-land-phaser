/**
 * TerritoryBattleSystem — combat when a unit enters enemy-owned territory.
 *
 * When a unit steps onto an enemy territory tile (no city), a battle begins.
 * Each BATTLE_ROUND_TICKS ticks one round resolves:
 *   - Unit deals damage to the territory (based on melee/ranged stats)
 *   - Territory counterattacks (BASE_ATTACK_DAMAGE, or WALLS_ATTACK_DAMAGE with walls)
 * When territory HP → 0 it transfers to the attacker with a free OUTPOST.
 * Territory HP regenerates when not under attack.
 */

import type { EntityId, GridCoordinates } from '@/types/common';
import type { Unit } from '@/entities/units/Unit';
import type { Territory } from '@/systems/grid/Territory';
import type { GameState } from '@/managers/GameState';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import type { MovementSystem } from '@/systems/movement/MovementSystem';
import type { UnitMovementState } from '@/systems/movement/MovementState';
import { BATTLE_ROUND_TICKS } from '@/systems/combat/BattleSystem';
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import { TerrainType } from '@/systems/grid/Territory';
import { CARDINAL_OFFSETS } from '@/systems/grid/geometry';
import {
  healthFactor,
  damageVariance,
  TERRITORY_REGEN_INTERVAL,
  TERRITORY_REGEN_AMOUNT,
  TERRITORY_WALL_MITIGATION,
  TERRITORY_RANGED_COUNTER_FACTOR,
  TERRITORY_RETREAT_REGEN,
  XP_RANGED_HIT,
  veteranDamageMultiplier,
} from '@/config/combatBalance';
import {
  applyCombatMoraleHit,
  applyAdvancePenalty,
  effectiveBattleOrder,
} from '@/systems/morale/moraleRules';

export interface TerritoryBattleState {
  id:              string;
  unitId:          EntityId;
  position:        GridCoordinates;
  attackerOrigin:  GridCoordinates;
  pendingMovement: UnitMovementState | null;
  ticksUntilRound: number;
  roundsElapsed:   number;
}

export class TerritoryBattleSystem {
  private battles: Map<string, TerritoryBattleState> = new Map();
  private battleSerial = 0;

  constructor(private readonly random: () => number = Math.random) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  public startBattle(
    unit:           Unit,
    territory:      Territory,
    attackerOrigin: GridCoordinates,
    position:       GridCoordinates,
    currentTick:    number,
    movementSystem: MovementSystem,
    eventBus:       GameEventBus,
  ): string | null {
    if (!unit.isAlive()) return null;
    if (unit.isEngagedInBattle()) return null;
    // One battle per tile
    const posKey = `${position.row},${position.col}`;
    if (this.battles.has(posKey)) return null;

    const pausedMovement = movementSystem.pauseOrder(unit.id);
    const battleId = `tbattle-${++this.battleSerial}`;
    const battle: TerritoryBattleState = {
      id:              battleId,
      unitId:          unit.id,
      position:        { ...position },
      attackerOrigin:  { ...attackerOrigin },
      pendingMovement: pausedMovement,
      ticksUntilRound: BATTLE_ROUND_TICKS,
      roundsElapsed:   0,
    };

    unit.setEngagedInBattle(true);
    this.battles.set(posKey, battle);

    eventBus.emit('territory:conquest-started', {
      position: { ...position },
      nationId: unit.getOwnerId(),
      needed:   territory.getMaxHealth(),
      tick:     currentTick,
    });

    return battleId;
  }

  public tick(
    gameState:      GameState,
    movementSystem: MovementSystem,
    eventBus:       GameEventBus,
    currentTick:    number,
  ): void {
    // HP regen for territories not under attack
    if (currentTick % TERRITORY_REGEN_INTERVAL === 0) {
      const attackedKeys = new Set(this.battles.keys());
      const grid = gameState.getGrid();
      const { rows, cols } = grid.getSize();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const key = `${r},${c}`;
          if (attackedKeys.has(key)) continue;
          const t = grid.getTerritory({ row: r, col: c });
          if (!t || !t.getControllingNation()) continue;
          if (t.getHealth() < t.getMaxHealth()) t.heal(TERRITORY_REGEN_AMOUNT);
        }
      }
    }

    for (const [posKey, battle] of this.battles) {
      const unit      = gameState.getUnit(battle.unitId);
      const territory = gameState.getGrid().getTerritory(battle.position);

      if (!unit || !unit.isAlive()) {
        this.finishBattle(battle, posKey, gameState, movementSystem, eventBus, currentTick, null);
        continue;
      }

      if (!territory) {
        unit.setEngagedInBattle(false);
        this.battles.delete(posKey);
        continue;
      }

      battle.ticksUntilRound--;
      if (battle.ticksUntilRound > 0) continue;
      battle.ticksUntilRound = BATTLE_ROUND_TICKS;
      battle.roundsElapsed++;

      const order = effectiveBattleOrder(unit);
      // FALL_BACK — unit always disengages
      if (order === 'FALL_BACK') {
        this.finishBattle(battle, posKey, gameState, movementSystem, eventBus, currentTick, unit, 'retreat');
        continue;
      }

      // Unit → territory damage
      const stats     = unit.getStats();
      const useRanged = stats.attackRange > 1 && stats.rangedDamage > 0 && order !== 'ADVANCE';
      const baseDmg   = (useRanged ? stats.rangedDamage : stats.meleeDamage)
        * veteranDamageMultiplier(unit.getVeteranLevel());
      const hpFactor  = healthFactor(unit.getHealth(), stats.maxHealth);
      const wallMit   = (territory.hasBuilding(TerritoryBuildingType.WALLS) && order !== 'ADVANCE')
        ? TERRITORY_WALL_MITIGATION : 0;
      const damageToTerritory = Math.max(1, Math.round(
        baseDmg * hpFactor * (1 - wallMit) * damageVariance(this.random()),
      ));
      if (useRanged && damageToTerritory > 0) unit.addXP(XP_RANGED_HIT);

      // Territory → unit damage
      const counterFactor = useRanged ? TERRITORY_RANGED_COUNTER_FACTOR : 1.0;
      const damageToUnit = Math.max(0, Math.round(
        territory.getAttackDamage() * counterFactor * damageVariance(this.random()),
      ));

      territory.takeDamage(damageToTerritory);
      unit.takeDamage(damageToUnit);
      applyCombatMoraleHit(unit, damageToUnit);
      if (order === 'ADVANCE') applyAdvancePenalty(unit);

      // Emit progress (progress = HP lost, needed = max HP — reuses conquest overlay)
      eventBus.emit('territory:conquest-progress', {
        position: { ...battle.position },
        progress: territory.getMaxHealth() - territory.getHealth(),
        needed:   territory.getMaxHealth(),
        tick:     currentTick,
      });

      // Resolve outcomes
      if (territory.getHealth() <= 0) {
        this.finishBattle(battle, posKey, gameState, movementSystem, eventBus, currentTick, unit, 'conquered');
        continue;
      }

      if (!unit.isAlive()) {
        const pos = { ...unit.position };
        const owner = unit.getOwnerId();
        gameState.removeUnit(unit.id);
        eventBus.emit('unit:destroyed', {
          unitId: unit.id, byUnitId: null, ownerNationId: owner, position: pos, tick: currentTick,
        });
        this.finishBattle(battle, posKey, gameState, movementSystem, eventBus, currentTick, null);
        continue;
      }
    }
  }

  public getBattleAt(position: GridCoordinates): TerritoryBattleState | null {
    const posKey = `${position.row},${position.col}`;
    return this.battles.get(posKey) ?? null;
  }

  public getAllBattles(): TerritoryBattleState[] {
    return Array.from(this.battles.values());
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private finishBattle(
    battle:         TerritoryBattleState,
    posKey:         string,
    gameState:      GameState,
    movementSystem: MovementSystem,
    eventBus:       GameEventBus,
    currentTick:    number,
    victor:         Unit | null,
    reason:         'conquered' | 'retreat' | 'unit-destroyed' = 'unit-destroyed',
  ): void {
    const unit = gameState.getUnit(battle.unitId);
    unit?.setEngagedInBattle(false);
    this.battles.delete(posKey);

    if (reason === 'conquered' && victor) {
      const territory = gameState.getGrid().getTerritory(battle.position);
      if (territory) {
        const fromNationId = territory.getControllingNation() ?? undefined;
        territory.setControllingNation(victor.getOwnerId());
        territory.setBuildings([TerritoryBuildingType.OUTPOST]); // free outpost on capture

        eventBus.emit('territory:claimed', {
          position:   { ...battle.position },
          nationId:   victor.getOwnerId(),
          tick:       currentTick,
          ...(fromNationId ? { fromNationId } : {}),
        });

        this.claimAdjacentImpassable(gameState, battle.position, victor.getOwnerId());
      }

      if (battle.pendingMovement?.path.length) {
        movementSystem.resumeOrder(battle.pendingMovement);
      } else if (battle.pendingMovement) {
        eventBus.emit('unit:move-complete', {
          unitId: battle.unitId,
          destination: { ...battle.position },
          tick: currentTick,
        });
      }
    } else if (reason === 'retreat' && unit) {
      const retreatedTerritory = gameState.getGrid().getTerritory(battle.position);
      if (retreatedTerritory) retreatedTerritory.heal(TERRITORY_RETREAT_REGEN); // partial regen on retreat
      const retreatTo = this.findRetreatTile(gameState, unit, battle);
      if (retreatTo) {
        const from = unit.position;
        unit.moveTo(retreatTo);
        eventBus.emit('unit:step-complete', { unitId: unit.id, from, to: retreatTo, tick: currentTick });
      }
      eventBus.emit('territory:conquest-cancelled', { position: { ...battle.position }, tick: currentTick });
    } else {
      // unit destroyed — territory stays; cancel conquest overlay
      eventBus.emit('territory:conquest-cancelled', { position: { ...battle.position }, tick: currentTick });
    }
  }

  private findRetreatTile(
    gameState: GameState,
    unit:      Unit,
    battle:    TerritoryBattleState,
  ): GridCoordinates | null {
    const occupied = new Set(
      gameState.getAllUnits()
        .filter(u => u.id !== unit.id)
        .map(u => `${u.position.row},${u.position.col}`),
    );

    const isValid = (c: GridCoordinates): boolean => {
      const t = gameState.getGrid().getTerritory(c);
      if (!t) return false;
      const terrain = t.getTerrainType();
      if (terrain === TerrainType.WATER || terrain === TerrainType.MOUNTAIN) return false;
      if (occupied.has(`${c.row},${c.col}`)) return false;
      return true;
    };

    const candidates = this.findRetreatCandidates(battle.position, battle.attackerOrigin);
    const safe = candidates.find(c => {
      if (!isValid(c)) return false;
      const owner = gameState.getGrid().getTerritory(c)?.getControllingNation();
      return !owner || owner === unit.getOwnerId();
    });
    if (safe) return { ...safe };

    const fallback = candidates.find(isValid);
    return fallback ? { ...fallback } : null;
  }

  private findRetreatCandidates(position: GridCoordinates, origin: GridCoordinates): GridCoordinates[] {
    const candidates: GridCoordinates[] = [origin];
    for (let radius = 1; radius <= 5; radius++) {
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

  private claimAdjacentImpassable(
    gameState: GameState,
    position:  GridCoordinates,
    nationId:  string,
  ): void {
    const grid    = gameState.getGrid();
    for (const off of CARDINAL_OFFSETS) {
      const nbr = grid.getTerritory({ row: position.row + off.row, col: position.col + off.col });
      if (!nbr) continue;
      const t = nbr.getTerrainType();
      if (t !== TerrainType.WATER && t !== TerrainType.MOUNTAIN) continue;
      if (nbr.getControllingNation()) continue;
      nbr.setControllingNation(nationId);
    }
  }
}
