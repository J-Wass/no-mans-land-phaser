/**
 * TickEngine - pure-logic tick counter and system coordinator.
 * GameScene calls advance() from Phaser's update() loop via a delta accumulator.
 * Future: add combatSystem.tick(), productionSystem.tick(), etc. here.
 */

import type { GameState } from '@/managers/GameState';
import type { MovementSystem } from '@/systems/movement/MovementSystem';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import { BattleSystem } from '@/systems/combat/BattleSystem';
import type { SavedBattleState } from '@/systems/combat/BattleSystem';
import { CitySiegeSystem } from '@/systems/combat/CitySiegeSystem';
import { RangedFireSystem } from '@/systems/combat/RangedFireSystem';
import { ProductionSystem } from '@/systems/production/ProductionSystem';
import { TerritoryBattleSystem } from '@/systems/combat/TerritoryBattleSystem';
import { MAX_MORALE } from '@/entities/units/Unit';
import { waterManaRegenBonus } from '@/systems/resources/ResourceBonuses';
import type { SavedSiegeState } from '@/types/gameSetup';
import type { EntityId } from '@/types/common';
import { TICK_RATE } from '@/config/constants';

/** Ticks between city-healing pulses (1 s at TICK_RATE=10). */
const CITY_HEAL_INTERVAL_TICKS = TICK_RATE;
/** Fraction of max HP restored per pulse. */
const CITY_HEAL_RATE = 0.05;

/** Morale recovery per second (per TICK_RATE ticks) outside combat. */
const MORALE_RECOVERY_ENEMY    = 1;
const MORALE_RECOVERY_NEUTRAL  = 2;
const MORALE_RECOVERY_FRIENDLY = 3;
const MORALE_RECOVERY_CITY     = 5;

export class TickEngine {
  private currentTick = 0;
  private readonly productionSystem        = new ProductionSystem();
  private readonly battleSystem            = new BattleSystem();
  private readonly citySiegeSystem         = new CitySiegeSystem();
  private readonly rangedFireSystem        = new RangedFireSystem();
  private readonly territoryBattleSystem   = new TerritoryBattleSystem();

  constructor(
    private gameState: GameState,
    private movementSystem: MovementSystem,
    private eventBus: GameEventBus
  ) {}

  /** Advance one tick. Returns the new tick count. */
  public advance(): number {
    this.currentTick++;
    this.movementSystem.tickWithBattles(this.gameState, this.eventBus, this.currentTick, this.battleSystem, this.citySiegeSystem, this.territoryBattleSystem);
    this.battleSystem.tick(this.gameState, this.movementSystem, this.eventBus, this.currentTick);
    this.citySiegeSystem.tick(this.gameState, this.movementSystem, this.eventBus, this.currentTick);
    this.territoryBattleSystem.tick(this.gameState, this.movementSystem, this.eventBus, this.currentTick);
    this.rangedFireSystem.tick(this.gameState, this.eventBus, this.currentTick);
    this.productionSystem.tick(this.gameState, this.eventBus, this.currentTick);
    this.sweepDeadUnits();
    if (this.currentTick % CITY_HEAL_INTERVAL_TICKS === 0) {
      this.healUnitsInCities();
      this.recoverMorale();
    }
    this.eventBus.emit('game:tick', { tick: this.currentTick });
    return this.currentTick;
  }

  /**
   * Remove any unit that has reached 0 HP but was not cleaned up by the system
   * that dealt the killing blow (e.g. damage from two sources in the same tick,
   * or LAND_LOSS ending a battle before the HP elimination check ran).
   */
  private sweepDeadUnits(): void {
    for (const unit of this.gameState.getAllUnits()) {
      if (!unit.isAlive()) {
        this.gameState.removeUnit(unit.id);
        this.eventBus.emit('unit:destroyed', {
          unitId: unit.id,
          byUnitId: null,
          tick: this.currentTick,
        });
      }
    }
  }

  /** Heal units that are resting inside a friendly city. */
  private healUnitsInCities(): void {
    const grid = this.gameState.getGrid();
    for (const unit of this.gameState.getAllUnits()) {
      if (!unit.isAlive()) continue;
      if (unit.isEngagedInBattle()) continue;
      if (unit.getHealth() >= unit.getStats().maxHealth) continue;

      const territory = grid.getTerritory(unit.position);
      const cityId    = territory?.getCityId() ?? null;
      if (!cityId) continue;

      const city = this.gameState.getCity(cityId);
      if (!city || city.getOwnerId() !== unit.getOwnerId()) continue;

      const deposits  = this.gameState.getNationActiveDeposits(unit.getOwnerId());
      const totalRate = CITY_HEAL_RATE + waterManaRegenBonus(deposits);
      unit.heal(Math.ceil(unit.getStats().maxHealth * totalRate));
    }
  }

  /** Recover morale for units outside combat, based on territory type. */
  private recoverMorale(): void {
    const grid = this.gameState.getGrid();
    for (const unit of this.gameState.getAllUnits()) {
      if (!unit.isAlive()) continue;
      if (unit.isEngagedInBattle()) continue;
      if (unit.getMorale() >= MAX_MORALE) continue;

      const territory = grid.getTerritory(unit.position);
      const ctrl      = territory?.getControllingNation() ?? null;
      const cityId    = territory?.getCityId() ?? null;

      let recovery: number;
      if (ctrl === unit.getOwnerId()) {
        const city = cityId ? this.gameState.getCity(cityId) : null;
        recovery = (city && city.getOwnerId() === unit.getOwnerId())
          ? MORALE_RECOVERY_CITY
          : MORALE_RECOVERY_FRIENDLY;
      } else if (!ctrl) {
        recovery = MORALE_RECOVERY_NEUTRAL;
      } else {
        recovery = MORALE_RECOVERY_ENEMY;
      }

      unit.setMorale(unit.getMorale() + recovery);
    }
  }

  public getCurrentTick(): number {
    return this.currentTick;
  }

  public reset(): void {
    this.currentTick = 0;
  }

  /** Restore tick counter from a save — call before the first advance(). */
  public setTick(tick: number): void {
    this.currentTick = tick;
  }

  public getBattleForUnit(unitId: EntityId): SavedBattleState | null {
    return this.battleSystem.getBattleForUnit(unitId);
  }

  public getBattleStates(): SavedBattleState[] {
    return this.battleSystem.toSavedStates();
  }

  public restoreBattleStates(saved: SavedBattleState[]): void {
    this.battleSystem.restore(saved, this.gameState);
  }

  public getSiegeStates(): SavedSiegeState[] {
    return this.citySiegeSystem.toSavedStates();
  }

  public restoreSiegeStates(saved: SavedSiegeState[]): void {
    this.citySiegeSystem.restore(saved, this.gameState);
  }

  public getTerritoryBattleAt(position: import('@/types/common').GridCoordinates) {
    return this.territoryBattleSystem.getBattleAt(position);
  }

  public getTerritoryBattlesForDisplay() {
    return this.territoryBattleSystem.getAllBattles();
  }
}
