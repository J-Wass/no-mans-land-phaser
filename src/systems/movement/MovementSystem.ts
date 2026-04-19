/**
 * MovementSystem - manages all in-flight unit movement.
 *
 * Owns a parallel Map<unitId, UnitMovementState> — does NOT store state on Unit.
 * tick() is called by TickEngine each game tick.
 */

import type { EntityId, GridCoordinates } from '@/types/common';
import type { Unit } from '@/entities/units/Unit';
import type { GameState } from '@/managers/GameState';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import type { BattleSystem } from '@/systems/combat/BattleSystem';
import type { CitySiegeSystem } from '@/systems/combat/CitySiegeSystem';
import type { TerritoryBattleSystem } from '@/systems/combat/TerritoryBattleSystem';
import type { SavedMovementState } from '@/types/gameSetup';
import { stepCost } from './MovementCosts';
import type { UnitMovementState } from './MovementState';

export class MovementSystem {
  private states: Map<EntityId, UnitMovementState> = new Map();

  /**
   * Issue a movement order for a unit. Replaces any existing order.
   * `path` is a sequence of steps from (exclusive of) current position to destination.
   */
  public issueOrder(unit: Unit, path: GridCoordinates[]): void {
    if (path.length === 0) return;

    const firstStep = path[0];
    if (firstStep === undefined) return;

    // Compute ticks needed for the first step
    const stats = unit.getStats();
    const unitType = unit.getUnitType();
    // We'll compute cost when we actually get the territory in tick(); for now set to 1
    // so we immediately start. MovementSystem needs Grid access for terrain — pass via tick().
    // Actually store a sentinel; real cost set on first tick.
    this.states.set(unit.id, {
      unitId: unit.id,
      path: [...path],
      ticksRemainingOnStep: 0, // resolved to real cost on first tick
    });

    void firstStep; // suppress unused warning
    void stats;
    void unitType;
  }

  public cancelOrder(unitId: EntityId): void {
    this.states.delete(unitId);
  }

  public pauseOrder(unitId: EntityId): UnitMovementState | null {
    const state = this.states.get(unitId);
    if (!state) return null;

    const snapshot: UnitMovementState = {
      unitId: state.unitId,
      path: state.path.map(step => ({ ...step })),
      ticksRemainingOnStep: state.ticksRemainingOnStep,
    };
    this.states.delete(unitId);
    return snapshot;
  }

  public resumeOrder(state: UnitMovementState | null): void {
    if (!state || state.path.length === 0) return;

    this.states.set(state.unitId, {
      unitId: state.unitId,
      path: state.path.map(step => ({ ...step })),
      ticksRemainingOnStep: Math.max(0, state.ticksRemainingOnStep),
    });
  }

  public isMoving(unitId: EntityId): boolean {
    return this.states.has(unitId);
  }

  public getState(unitId: EntityId): Readonly<UnitMovementState> | undefined {
    return this.states.get(unitId);
  }

  public getAllStates(): ReadonlyMap<EntityId, UnitMovementState> {
    return this.states;
  }

  /** Restore in-flight movement orders from a save. Call before the first tick(). */
  public restoreStates(saved: SavedMovementState[]): void {
    this.states.clear();
    for (const s of saved) {
      if (s.path.length > 0) {
        this.states.set(s.unitId, {
          unitId: s.unitId,
          path: s.path.map(c => ({ row: c.row, col: c.col })),
          ticksRemainingOnStep: s.ticksRemainingOnStep,
        });
      }
    }
  }

  /**
   * Advance all in-flight moves by one tick.
   * Called by TickEngine; requires GameState for unit + grid lookups.
   */
  public tick(gameState: GameState, eventBus: GameEventBus, currentTick: number): void {
    const grid = gameState.getGrid();

    for (const [unitId, state] of this.states) {
      const unit = gameState.getUnit(unitId);
      if (!unit || !unit.isAlive()) {
        this.states.delete(unitId);
        continue;
      }

      if (unit.isEngagedInBattle()) {
        continue;
      }

      const deposits = gameState.getNationActiveDeposits(unit.getOwnerId());
      const counts   = gameState.getNationActiveDepositCounts(unit.getOwnerId());

      // Resolve first-tick cost (ticksRemainingOnStep === 0 means just issued)
      if (state.ticksRemainingOnStep <= 0) {
        const nextCoords = state.path[0];
        if (nextCoords === undefined) {
          this.states.delete(unitId);
          continue;
        }
        const territory = grid.getTerritory(nextCoords);
        if (!territory) {
          this.states.delete(unitId);
          continue;
        }
        const cost = stepCost(territory.getTerrainType(), unit.getUnitType(), unit.getStats(), deposits, counts);
        if (!isFinite(cost)) {
          // Path became invalid (terrain changed); cancel
          this.states.delete(unitId);
          continue;
        }
        state.ticksRemainingOnStep = cost;
      }

      state.ticksRemainingOnStep--;

      if (state.ticksRemainingOnStep <= 0) {
        const nextCoords = state.path.shift();
        if (nextCoords === undefined) {
          this.states.delete(unitId);
          continue;
        }

        const from = unit.position;
        unit.moveTo(nextCoords);

        eventBus.emit('unit:step-complete', {
          unitId,
          from,
          to: nextCoords,
          tick: currentTick,
        });

        if (state.path.length === 0) {
          this.states.delete(unitId);
          eventBus.emit('unit:move-complete', {
            unitId,
            destination: nextCoords,
            tick: currentTick,
          });
        } else {
          // Pre-compute cost for the next step immediately
          const nextNext = state.path[0];
          if (nextNext !== undefined) {
            const territory = grid.getTerritory(nextNext);
            if (territory) {
              const cost = stepCost(territory.getTerrainType(), unit.getUnitType(), unit.getStats(), deposits, counts);
              state.ticksRemainingOnStep = isFinite(cost) ? cost : 0;
            }
          }
        }
      }
    }
  }

  public tickWithBattles(
    gameState: GameState,
    eventBus: GameEventBus,
    currentTick: number,
    battleSystem: BattleSystem,
    citySiegeSystem: CitySiegeSystem,
    territoryBattleSystem: TerritoryBattleSystem,
  ): void {
    const grid = gameState.getGrid();

    for (const [unitId, state] of this.states) {
      const unit = gameState.getUnit(unitId);
      if (!unit || !unit.isAlive()) {
        this.states.delete(unitId);
        continue;
      }

      if (unit.isEngagedInBattle()) {
        continue;
      }

      const deposits = gameState.getNationActiveDeposits(unit.getOwnerId());
      const counts   = gameState.getNationActiveDepositCounts(unit.getOwnerId());

      if (state.ticksRemainingOnStep <= 0) {
        const nextCoords = state.path[0];
        if (nextCoords === undefined) {
          this.states.delete(unitId);
          continue;
        }
        const territory = grid.getTerritory(nextCoords);
        if (!territory) {
          this.states.delete(unitId);
          continue;
        }
        const cost = stepCost(territory.getTerrainType(), unit.getUnitType(), unit.getStats(), deposits, counts);
        if (!isFinite(cost)) {
          this.states.delete(unitId);
          continue;
        }
        state.ticksRemainingOnStep = cost;
      }

      state.ticksRemainingOnStep--;

      if (state.ticksRemainingOnStep <= 0) {
        const nextCoords = state.path.shift();
        if (nextCoords === undefined) {
          this.states.delete(unitId);
          continue;
        }

        const from = unit.position;
        unit.moveTo(nextCoords);

        eventBus.emit('unit:step-complete', {
          unitId,
          from,
          to: nextCoords,
          tick: currentTick,
        });

        const enemyOccupant = gameState.getAllUnits().find(other =>
          other.id !== unit.id &&
          other.isAlive() &&
          !other.isEngagedInBattle() &&
          other.getOwnerId() !== unit.getOwnerId() &&
          other.position.row === nextCoords.row &&
          other.position.col === nextCoords.col,
        );

        if (enemyOccupant) {
          battleSystem.startBattle(unit, enemyOccupant, from, nextCoords, currentTick, this, eventBus);
          continue;
        }

        // Check for enemy city on this tile
        const territory = grid.getTerritory(nextCoords);
        const cityId = territory?.getCityId() ?? null;
        if (cityId) {
          const city = gameState.getCity(cityId);
          if (city && city.getOwnerId() !== unit.getOwnerId()) {
            citySiegeSystem.startSiege(unit, city, from, nextCoords, currentTick, this, eventBus);
            continue;
          }
        }

        // Check for enemy-owned non-city territory
        if (territory) {
          const tOwner = territory.getControllingNation();
          if (tOwner && tOwner !== unit.getOwnerId() && !territory.getCityId()) {
            const unitNation = gameState.getNation(unit.getOwnerId());
            if (unitNation?.isAtWar(tOwner)) {
              territoryBattleSystem.startBattle(unit, territory, from, nextCoords, currentTick, this, eventBus);
              continue;
            }
          }
        }

        if (state.path.length === 0) {
          this.states.delete(unitId);
          eventBus.emit('unit:move-complete', {
            unitId,
            destination: nextCoords,
            tick: currentTick,
          });
        } else {
          const nextNext = state.path[0];
          if (nextNext !== undefined) {
            const territory = grid.getTerritory(nextNext);
            if (territory) {
              const cost = stepCost(territory.getTerrainType(), unit.getUnitType(), unit.getStats(), deposits, counts);
              state.ticksRemainingOnStep = isFinite(cost) ? cost : 0;
            }
          }
        }
      }
    }
  }
}
