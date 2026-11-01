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
import { stepCost, WHEEL_SPEED_MULTIPLIER } from './MovementCosts';
import type { UnitMovementState } from './MovementState';
import { Pathfinder } from '@/systems/pathfinding/Pathfinder';
import type { MovementLookup } from '@/systems/pathfinding/Pathfinder';
import { FRIENDLY_BLOCK_GRACE_TICKS } from '@/config/constants';
import { defaultEngagementPolicy } from '@/systems/combat/EngagementPolicy';
import type { EngagementPolicy } from '@/systems/combat/EngagementPolicy';

export class MovementSystem implements MovementLookup {
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

    // blockedTicks is dropped on purpose: whatever blocked the unit is stale by the time it resumes.
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

  /** True while the unit has an order and isn't stuck waiting behind a friendly unit. */
  public isAdvancing(unitId: EntityId): boolean {
    const state = this.states.get(unitId);
    return state !== undefined && !((state.blockedTicks ?? 0) > 0);
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
          ...(s.blockedTicks ? { blockedTicks: s.blockedTicks } : {}),
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
      const speedMult = (gameState.getNation(unit.getOwnerId())?.hasResearched('the_wheel') ?? false)
        ? WHEEL_SPEED_MULTIPLIER : 1;

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
        const cost = stepCost(territory.getTerrainType(), unit.getUnitType(), unit.getStats(), deposits, counts, speedMult);
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

        // Block friendly stacking: wait for the tile to clear, re-path or give up
        if (this.waitForFriendly(unit, state, nextCoords, gameState, eventBus, currentTick)) continue;

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
              const cost = stepCost(territory.getTerrainType(), unit.getUnitType(), unit.getStats(), deposits, counts, speedMult);
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
    canEngage: EngagementPolicy = defaultEngagementPolicy(gameState),
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
      const speedMult = (gameState.getNation(unit.getOwnerId())?.hasResearched('the_wheel') ?? false)
        ? WHEEL_SPEED_MULTIPLIER : 1;

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
        const cost = stepCost(territory.getTerrainType(), unit.getUnitType(), unit.getStats(), deposits, counts, speedMult);
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

        // Block friendly stacking: wait for the tile to clear, re-path or give up
        if (this.waitForFriendly(unit, state, nextCoords, gameState, eventBus, currentTick)) continue;

        const from = unit.position;
        unit.moveTo(nextCoords);

        eventBus.emit('unit:step-complete', {
          unitId,
          from,
          to: nextCoords,
          tick: currentTick,
        });

        // Spies infiltrate silently — they never trigger unit battles, sieges, or
        // auto-war on entering enemy units/cities/territory. (Detection, which
        // destroys them, is handled by SpyDetectionSystem.)
        if (!unit.isSpy()) {
          const enemyOccupant = gameState.getAllUnits().find(other =>
            other.id !== unit.id &&
            other.isAlive() &&
            !other.isSpy() &&            // undercover spies coexist silently — moving onto one never starts a battle or declares war
            !other.isEngagedInBattle() &&
            other.getOwnerId() !== unit.getOwnerId() &&
            other.position.row === nextCoords.row &&
            other.position.col === nextCoords.col &&
            // Allies, and neutrals inside a peace cooldown, share the tile peacefully.
            canEngage(unit.getOwnerId(), other.getOwnerId(), currentTick),
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
            if (city && city.getOwnerId() !== unit.getOwnerId()
                && canEngage(unit.getOwnerId(), city.getOwnerId(), currentTick)) {
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
              const cost = stepCost(territory.getTerrainType(), unit.getUnitType(), unit.getStats(), deposits, counts, speedMult);
              state.ticksRemainingOnStep = isFinite(cost) ? cost : 0;
            }
          }
        }
      }
    }
  }

  /**
   * Friendly units can't share a tile. If one of `unit`'s own units holds
   * `nextCoords`, keep the unit waiting and return true (the caller skips the
   * step). An idle friendly that isn't on the order's final tile steps aside
   * by swapping tiles with the mover (return false: the step goes ahead).
   * A blocker that is about to clear — on the move, or fighting (a
   * besieger that may fall, see Known Quirks) — is waited for indefinitely.
   * One that won't clear (parked, or itself stuck) is waited for
   * FRIENDLY_BLOCK_GRACE_TICKS; then the unit re-paths around every parked
   * friendly, or, when the destination is held by one or there's no detour,
   * the order ends on the current tile with a 'unit:move-blocked' event.
   */
  private waitForFriendly(
    unit: Unit,
    state: UnitMovementState,
    nextCoords: GridCoordinates,
    gameState: GameState,
    eventBus: GameEventBus,
    currentTick: number,
  ): boolean {
    const blocker = gameState.getUnitsByNation(unit.getOwnerId()).find(other =>
      other.id !== unit.id &&
      other.isAlive() &&
      other.position.row === nextCoords.row &&
      other.position.col === nextCoords.col,
    );
    if (!blocker) {
      delete state.blockedTicks;
      return false;
    }

    // `state.path` no longer includes nextCoords, so a non-empty path means the
    // blocker is only in the way, not parked on the destination.
    if (state.path.length > 0 && this.canSwapWith(blocker, unit.position, gameState)) {
      const from = blocker.position;
      blocker.moveTo(unit.position);
      eventBus.emit('unit:step-complete', { unitId: blocker.id, from, to: blocker.position, tick: currentTick });
      delete state.blockedTicks;
      return false;
    }

    state.path.unshift(nextCoords);
    state.ticksRemainingOnStep = 1;
    state.blockedTicks = (state.blockedTicks ?? 0) + 1;

    if (this.willClear(blocker) || state.blockedTicks < FRIENDLY_BLOCK_GRACE_TICKS) return true;

    // The order can't finish if its destination is held by a unit that won't move.
    const destination = state.path[state.path.length - 1] ?? nextCoords;
    const destBlocker = state.path.length > 1
      ? gameState.getUnitsByNation(unit.getOwnerId()).find(other =>
          other.id !== unit.id &&
          other.isAlive() &&
          other.position.row === destination.row &&
          other.position.col === destination.col &&
          !this.willClear(other),
        )
      : blocker;

    if (!destBlocker) {
      const detour = new Pathfinder(gameState.getGrid(), this).findPath(
        unit.position, destination, unit.getUnitType(), unit.getStats(),
        unit.getOwnerId(), gameState, { avoidParkedFriendlies: true },
      );
      if (detour && detour.length > 0) {
        state.path = detour;
        state.ticksRemainingOnStep = 0; // first step's cost resolves next tick
        delete state.blockedTicks;
        return true;
      }
    }

    this.states.delete(unit.id);
    eventBus.emit('unit:move-blocked', {
      unitId:        unit.id,
      position:      { ...unit.position },
      blockedAt:     destBlocker ? { ...destination } : { ...nextCoords },
      blockerUnitId: (destBlocker ?? blocker).id,
      reason:        destBlocker ? 'destination-occupied' : 'no-detour',
      tick:          currentTick,
    });
    return true;
  }

  /** An idle friendly (no order, not fighting) that can stand on the mover's tile trades places with it. */
  private canSwapWith(blocker: Unit, moverTile: GridCoordinates, gameState: GameState): boolean {
    if (this.states.has(blocker.id) || blocker.isEngagedInBattle()) return false;
    const territory = gameState.getGrid().getTerritory(moverTile);
    if (!territory) return false;
    const owner = blocker.getOwnerId();
    const cost = stepCost(
      territory.getTerrainType(), blocker.getUnitType(), blocker.getStats(),
      gameState.getNationActiveDeposits(owner), gameState.getNationActiveDepositCounts(owner),
    );
    return isFinite(cost);
  }

  /** A friendly blocker that will free its tile by itself: on the move, or fighting. */
  private willClear(blocker: Unit): boolean {
    return blocker.isEngagedInBattle() || this.isAdvancing(blocker.id);
  }
}
