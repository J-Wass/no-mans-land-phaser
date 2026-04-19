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

const TERRITORY_REGEN_INTERVAL = 50;  // ticks between HP regen (5 s at TICK_RATE=10)
const TERRITORY_REGEN_AMOUNT   = 5;
const WALL_MITIGATION          = 0.20; // damage reduction when territory has walls (unit attacking)

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

      // FALL_BACK — unit always disengages
      if (unit.getBattleOrder() === 'FALL_BACK') {
        this.finishBattle(battle, posKey, gameState, movementSystem, eventBus, currentTick, unit, 'retreat');
        continue;
      }

      // Unit → territory damage
      const stats     = unit.getStats();
      const useRanged = stats.attackRange > 1 && stats.rangedDamage > 0 && unit.getBattleOrder() !== 'ADVANCE';
      const baseDmg   = useRanged ? stats.rangedDamage : stats.meleeDamage;
      const healthFactor = 0.55 + 0.45 * (unit.getHealth() / stats.maxHealth);
      const wallMit   = (territory.hasBuilding(TerritoryBuildingType.WALLS) && unit.getBattleOrder() !== 'ADVANCE')
        ? WALL_MITIGATION : 0;
      const damageToTerritory = Math.max(1, Math.round(
        baseDmg * healthFactor * (1 - wallMit) * (0.9 + this.random() * 0.2),
      ));

      // Territory → unit damage
      const counterFactor = useRanged ? 0.4 : 1.0;
      const damageToUnit = Math.max(0, Math.round(
        territory.getAttackDamage() * counterFactor * (0.9 + this.random() * 0.2),
      ));

      territory.takeDamage(damageToTerritory);
      unit.takeDamage(damageToUnit);

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
        gameState.removeUnit(unit.id);
        eventBus.emit('unit:destroyed', { unitId: unit.id, byUnitId: null, tick: currentTick });
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
      territory: {
        const territory = gameState.getGrid().getTerritory(battle.position);
        if (territory) territory.heal(10); // partial regen on retreat
      }
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
    const candidates: GridCoordinates[] = [
      battle.attackerOrigin,
      { row: battle.position.row - 1, col: battle.position.col },
      { row: battle.position.row + 1, col: battle.position.col },
      { row: battle.position.row,     col: battle.position.col - 1 },
      { row: battle.position.row,     col: battle.position.col + 1 },
    ];

    const occupied = new Set(
      gameState.getAllUnits()
        .filter(u => u.id !== unit.id)
        .map(u => `${u.position.row},${u.position.col}`),
    );

    for (const c of candidates) {
      const t = gameState.getGrid().getTerritory(c);
      if (!t) continue;
      const terrain = t.getTerrainType();
      if (terrain === TerrainType.WATER || terrain === TerrainType.MOUNTAIN) continue;
      if (occupied.has(`${c.row},${c.col}`)) continue;
      return { ...c };
    }
    return null;
  }

  private claimAdjacentImpassable(
    gameState: GameState,
    position:  GridCoordinates,
    nationId:  string,
  ): void {
    const grid    = gameState.getGrid();
    const offsets = [
      { row: -1, col: 0 }, { row: 1, col: 0 },
      { row: 0, col: -1 }, { row: 0, col: 1 },
    ];
    for (const off of offsets) {
      const nbr = grid.getTerritory({ row: position.row + off.row, col: position.col + off.col });
      if (!nbr) continue;
      const t = nbr.getTerrainType();
      if (t !== TerrainType.WATER && t !== TerrainType.MOUNTAIN) continue;
      if (nbr.getControllingNation()) continue;
      nbr.setControllingNation(nationId);
    }
  }
}
