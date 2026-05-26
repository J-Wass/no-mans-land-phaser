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
import { TICK_RATE } from '@/config/constants';
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import { TerrainType } from '@/systems/grid/Territory';
import { CARDINAL_OFFSETS } from '@/systems/grid/geometry';

/** Ticks between water-mana heal pulses (same cadence as city heal). */
const WATER_MANA_HEAL_INTERVAL_TICKS = TICK_RATE;
import type { SavedSiegeState } from '@/types/gameSetup';
import type { EntityId } from '@/types/common';

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
  private readonly battleSystem:            BattleSystem;
  private readonly citySiegeSystem:         CitySiegeSystem;
  private readonly rangedFireSystem:        RangedFireSystem;
  private readonly territoryBattleSystem:   TerritoryBattleSystem;

  constructor(
    private gameState: GameState,
    private movementSystem: MovementSystem,
    private eventBus: GameEventBus
  ) {
    // Every combat system shares the one authoritative RNG so the simulation is
    // deterministic and lockstep-safe for multiplayer.
    const random = gameState.getRng().fn();
    this.battleSystem          = new BattleSystem(random);
    this.citySiegeSystem       = new CitySiegeSystem(random);
    this.rangedFireSystem      = new RangedFireSystem(random);
    this.territoryBattleSystem = new TerritoryBattleSystem(random);
  }

  /** Advance one tick. Returns the new tick count. */
  public advance(): number {
    this.currentTick++;
    this.movementSystem.tickWithBattles(this.gameState, this.eventBus, this.currentTick, this.battleSystem, this.citySiegeSystem, this.territoryBattleSystem);
    this.battleSystem.tick(this.gameState, this.movementSystem, this.eventBus, this.currentTick);
    this.startSiegesForStrandedEnemiesOnCities();
    this.citySiegeSystem.tick(this.gameState, this.movementSystem, this.eventBus, this.currentTick);
    this.territoryBattleSystem.tick(this.gameState, this.movementSystem, this.eventBus, this.currentTick);
    this.rangedFireSystem.tick(this.gameState, this.eventBus, this.currentTick);
    this.productionSystem.tick(this.gameState, this.eventBus, this.currentTick);
    this.tickTerritoryConstruction();
    this.sweepDeadUnits();
    this.checkDefeatedNations();
    if (this.currentTick % CITY_HEAL_INTERVAL_TICKS === 0) {
      this.healUnitsInCities();
      this.recoverMorale();
    }
    if (this.currentTick % WATER_MANA_HEAL_INTERVAL_TICKS === 0) {
      this.healUnitsWithWaterMana();
    }
    this.eventBus.emit('game:tick', { tick: this.currentTick });
    return this.currentTick;
  }

  /**
   * Remove any unit that has reached 0 HP but was not cleaned up by the system
   * that dealt the killing blow (e.g. damage from two sources in the same tick,
   * or another combat system ending before the HP elimination check ran).
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

  /**
   * After a battle ends, the attacker can be left standing on an enemy city tile
   * with no active engagement (e.g. defender withdrew, defender routed and fled).
   * Promote those units to a siege so the city continues to be attacked.
   */
  private startSiegesForStrandedEnemiesOnCities(): void {
    const grid = this.gameState.getGrid();
    for (const unit of this.gameState.getAllUnits()) {
      if (!unit.isAlive()) continue;
      if (unit.isEngagedInBattle()) continue;
      const territory = grid.getTerritory(unit.position);
      const cityId = territory?.getCityId();
      if (!cityId) continue;
      const city = this.gameState.getCity(cityId);
      if (!city || !city.isAlive()) continue;
      if (city.getOwnerId() === unit.getOwnerId()) continue;
      this.citySiegeSystem.startSiege(
        unit,
        city,
        unit.position,
        unit.position,
        this.currentTick,
        this.movementSystem,
        this.eventBus,
      );
    }
  }

  private checkDefeatedNations(): void {
    for (const nation of this.gameState.getAllNations()) {
      const nationId = nation.getId();
      const hasCities = this.gameState.getCitiesByNation(nationId).length > 0;
      const hasUnits = this.gameState.getUnitsByNation(nationId).some(unit => unit.isAlive());
      if (hasCities || hasUnits) continue;

      const tombstone = this.gameState.defeatNation(nationId, this.currentTick);
      if (!tombstone) continue;
      this.eventBus.emit('nation:defeated', {
        nationId,
        name: tombstone.name,
        tick: this.currentTick,
      });
    }
  }

  private tickTerritoryConstruction(): void {
    const grid = this.gameState.getGrid();
    const { rows, cols } = grid.getSize();

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const position = { row, col };
        const territory = grid.getTerritory(position);
        const completed = territory?.tickConstruction();
        if (!territory || !completed) continue;

        if (completed.isUpgrade) {
          territory.upgradeBuildingLevel(completed.building);
          this.eventBus.emit('territory:building-upgraded', {
            position,
            building: completed.building,
            newLevel: territory.getBuildingLevel(completed.building),
            tick: this.currentTick,
          });
        } else if (completed.building === TerritoryBuildingType.OUTPOST) {
          territory.setControllingNation(completed.nationId);
          territory.addBuilding(TerritoryBuildingType.OUTPOST);
          this.claimAdjacentImpassable(position, completed.nationId);
          this.eventBus.emit('territory:claimed', {
            position,
            nationId: completed.nationId,
            tick: this.currentTick,
          });
          this.eventBus.emit('territory:building-built', {
            position,
            building: completed.building,
            tick: this.currentTick,
          });
        } else {
          territory.addBuilding(completed.building);
          this.eventBus.emit('territory:building-built', {
            position,
            building: completed.building,
            tick: this.currentTick,
          });
        }
      }
    }
  }

  private claimAdjacentImpassable(position: { row: number; col: number }, nationId: EntityId): void {
    const grid = this.gameState.getGrid();
    for (const off of CARDINAL_OFFSETS) {
      const nbr = grid.getTerritory({ row: position.row + off.row, col: position.col + off.col });
      if (!nbr) continue;
      const terrain = nbr.getTerrainType();
      if (terrain !== TerrainType.WATER && terrain !== TerrainType.MOUNTAIN) continue;
      if (nbr.getControllingNation()) continue;
      nbr.setControllingNation(nationId);
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

      unit.heal(Math.ceil(unit.getStats().maxHealth * CITY_HEAL_RATE));
    }
  }

  /** Heal all alive units of nations with active water mana mines, anywhere on the map. */
  private healUnitsWithWaterMana(): void {
    // The water-mana rate is a per-nation property derived from a full territory
    // scan; compute it once per nation per pulse instead of once per unit.
    const rateByNation = new Map<EntityId, number>();
    const rateFor = (nationId: EntityId): number => {
      let rate = rateByNation.get(nationId);
      if (rate === undefined) {
        const deposits = this.gameState.getNationActiveDeposits(nationId);
        const counts   = this.gameState.getNationActiveDepositCounts(nationId);
        rate = waterManaRegenBonus(deposits, counts);
        rateByNation.set(nationId, rate);
      }
      return rate;
    };

    for (const unit of this.gameState.getAllUnits()) {
      if (!unit.isAlive()) continue;
      if (unit.isEngagedInBattle()) continue;
      if (unit.getHealth() >= unit.getStats().maxHealth) continue;

      const rate = rateFor(unit.getOwnerId());
      if (rate > 0) {
        unit.heal(Math.ceil(unit.getStats().maxHealth * rate));
      }
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
