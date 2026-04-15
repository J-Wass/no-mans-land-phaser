/**
 * CitySiegeSystem — handles unit-vs-city combat.
 *
 * When a unit steps onto an enemy city tile, a siege begins.
 * Each BATTLE_ROUND_TICKS ticks, one round resolves:
 *   - Unit deals melee or ranged damage to the city (city walls reduce damage)
 *   - City counterattacks with garrison fire (reduced vs ranged attackers)
 * When city HP → 0 the city is conquered and ownership transfers.
 * Cities regen HP over time when not under siege.
 * A unit on RETREAT order always disengages successfully.
 */

import type { EntityId, GridCoordinates } from '@/types/common';
import type { Unit } from '@/entities/units/Unit';
import type { City } from '@/entities/cities/City';
import type { GameState } from '@/managers/GameState';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import type { MovementSystem } from '@/systems/movement/MovementSystem';
import type { SavedSiegeState } from '@/types/gameSetup';
import { BATTLE_ROUND_TICKS } from '@/systems/combat/BattleSystem';
import { TerrainType } from '@/systems/grid/Territory';

const CITY_REGEN_INTERVAL = 50;  // ticks between HP regen (every 5 s at TICK_RATE=10)
const CITY_REGEN_AMOUNT   = 5;   // HP restored per interval
const WALL_MITIGATION     = 0.22; // damage reduction from city walls (normal assault)
const CHARGE_MITIGATION   = 0.06; // reduced wall mitigation when CHARGEing

interface SiegeState extends SavedSiegeState {}

export class CitySiegeSystem {
  private sieges: Map<string, SiegeState> = new Map();
  private siegeSerial = 0;

  constructor(private readonly random: () => number = Math.random) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  public startSiege(
    unit: Unit,
    city: City,
    position: GridCoordinates,
    currentTick: number,
    movementSystem: MovementSystem,
    eventBus: GameEventBus,
  ): string | null {
    if (!unit.isAlive() || !city.isAlive()) return null;
    if (unit.isEngagedInBattle()) return null;

    const siegeId = `siege-${++this.siegeSerial}`;
    const siege: SiegeState = {
      id:              siegeId,
      unitId:          unit.id,
      cityId:          city.id,
      position:        { ...position },
      attackerOrigin:  { ...unit.position },
      ticksUntilRound: BATTLE_ROUND_TICKS,
      roundsElapsed:   0,
    };

    unit.setEngagedInBattle(true);
    movementSystem.cancelOrder(unit.id);
    this.sieges.set(siegeId, siege);

    eventBus.emit('city:siege-started', {
      siegeId,
      unitId:   unit.id,
      cityId:   city.id,
      position: { ...position },
      tick:     currentTick,
    });

    return siegeId;
  }

  public tick(
    gameState: GameState,
    movementSystem: MovementSystem,
    eventBus: GameEventBus,
    currentTick: number,
  ): void {
    // City HP regen for all cities not currently under siege
    if (currentTick % CITY_REGEN_INTERVAL === 0) {
      const besiegedCityIds = new Set(Array.from(this.sieges.values()).map(s => s.cityId));
      for (const city of gameState.getAllCities()) {
        if (!besiegedCityIds.has(city.id) && city.getHealth() < city.getMaxHealth()) {
          city.heal(CITY_REGEN_AMOUNT);
        }
      }
    }

    for (const siege of this.sieges.values()) {
      const unit = gameState.getUnit(siege.unitId);
      const city = gameState.getCity(siege.cityId);

      // Unit died externally (shouldn't happen mid-siege, but be safe)
      if (!unit || !unit.isAlive()) {
        this.finishSiege(siege, gameState, movementSystem, eventBus, currentTick, null);
        continue;
      }

      if (!city) {
        unit.setEngagedInBattle(false);
        this.sieges.delete(siege.id);
        continue;
      }

      siege.ticksUntilRound--;
      if (siege.ticksUntilRound > 0) continue;
      siege.ticksUntilRound = BATTLE_ROUND_TICKS;
      siege.roundsElapsed++;

      // RETREAT — unit always disengages from a city siege successfully
      if (unit.getBattleOrder() === 'RETREAT') {
        this.finishSiege(siege, gameState, movementSystem, eventBus, currentTick, unit, 'retreat');
        continue;
      }

      // Compute unit → city damage
      const stats    = unit.getStats();
      const useRanged = stats.attackRange > 1 && stats.rangedDamage > 0 && unit.getBattleOrder() !== 'CHARGE';
      const baseDmg  = useRanged ? stats.rangedDamage : stats.meleeDamage;
      const unitHealthFactor = 0.55 + 0.45 * (unit.getHealth() / stats.maxHealth);
      const wallMitigation   = unit.getBattleOrder() === 'CHARGE' ? CHARGE_MITIGATION : WALL_MITIGATION;
      const damageToCity = Math.max(1, Math.round(
        baseDmg * unitHealthFactor * (1 - wallMitigation) * (0.9 + this.random() * 0.2),
      ));

      // Compute city → unit counterattack
      const cityHealthFactor = 0.55 + 0.45 * (city.getHealth() / city.getMaxHealth());
      const counterFactor    = useRanged ? 0.4 : 1.0; // ranged attackers aren't in melee range
      const damageToUnit = Math.max(0, Math.round(
        city.getMeleeDamage() * cityHealthFactor * counterFactor * (0.9 + this.random() * 0.2),
      ));

      city.takeDamage(damageToCity);
      unit.takeDamage(damageToUnit);

      eventBus.emit('city:siege-round', {
        siegeId:    siege.id,
        unitId:     unit.id,
        cityId:     city.id,
        damageToCity,
        damageToUnit,
        cityHealth: city.getHealth(),
        tick:       currentTick,
      });

      // Resolve outcomes after damage
      if (!city.isAlive()) {
        this.finishSiege(siege, gameState, movementSystem, eventBus, currentTick, unit, 'conquered');
        continue;
      }

      if (!unit.isAlive()) {
        gameState.removeUnit(unit.id);
        eventBus.emit('unit:destroyed', { unitId: unit.id, byUnitId: null, tick: currentTick });
        this.finishSiege(siege, gameState, movementSystem, eventBus, currentTick, null);
        continue;
      }
    }
  }

  public getSiegeForUnit(unitId: EntityId): SiegeState | null {
    for (const siege of this.sieges.values()) {
      if (siege.unitId === unitId) return { ...siege };
    }
    return null;
  }

  public toSavedStates(): SavedSiegeState[] {
    return Array.from(this.sieges.values()).map(s => ({
      ...s,
      position:       { ...s.position },
      attackerOrigin: { ...s.attackerOrigin },
    }));
  }

  public restore(saved: SavedSiegeState[], gameState: GameState): void {
    this.sieges.clear();
    this.siegeSerial = 0;
    for (const s of saved) {
      const unit = gameState.getUnit(s.unitId);
      if (!unit) continue;
      unit.setEngagedInBattle(true);
      this.sieges.set(s.id, {
        ...s,
        position:       { ...s.position },
        attackerOrigin: { ...s.attackerOrigin },
      });
      const suffix = Number.parseInt(s.id.replace('siege-', ''), 10);
      if (Number.isFinite(suffix)) this.siegeSerial = Math.max(this.siegeSerial, suffix);
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private finishSiege(
    siege: SiegeState,
    gameState: GameState,
    movementSystem: MovementSystem,
    eventBus: GameEventBus,
    currentTick: number,
    victor: Unit | null,
    reason: 'conquered' | 'retreat' | 'unit-destroyed' = 'unit-destroyed',
  ): void {
    const unit = gameState.getUnit(siege.unitId);
    unit?.setEngagedInBattle(false);
    movementSystem.cancelOrder(siege.unitId);
    this.sieges.delete(siege.id);

    if (reason === 'conquered' && victor) {
      const city = gameState.getCity(siege.cityId);
      if (city) {
        const byNationId = victor.getOwnerId();
        city.setOwnerId(byNationId);
        city.cancelOrder();
        city.setHealth(Math.ceil(city.getMaxHealth() * 0.35)); // city at 35% after conquest

        const territory = gameState.getGrid().getTerritory(city.position);
        if (territory) territory.setControllingNation(byNationId);

        eventBus.emit('city:conquered', {
          cityId:     city.id,
          byUnitId:   victor.id,
          byNationId,
          position:   { ...city.position },
          tick:       currentTick,
        });
        // Re-emit territory:claimed so borders and territory menu refresh
        eventBus.emit('territory:claimed', {
          position: { ...city.position },
          nationId: byNationId,
          tick:     currentTick,
        });
      }
    } else if (reason === 'retreat' && unit) {
      // Move unit back toward its origin (or any free adjacent tile)
      const retreatTo = this.findRetreatTile(gameState, unit, siege);
      if (retreatTo) {
        const from = unit.position;
        unit.moveTo(retreatTo);
        eventBus.emit('unit:step-complete', {
          unitId: unit.id,
          from,
          to: retreatTo,
          tick: currentTick,
        });
      }
    }
  }

  private findRetreatTile(
    gameState: GameState,
    unit: Unit,
    siege: SiegeState,
  ): GridCoordinates | null {
    const candidates: GridCoordinates[] = [
      siege.attackerOrigin,
      { row: siege.position.row - 1, col: siege.position.col },
      { row: siege.position.row + 1, col: siege.position.col },
      { row: siege.position.row,     col: siege.position.col - 1 },
      { row: siege.position.row,     col: siege.position.col + 1 },
    ];

    const occupied = new Set(
      gameState.getAllUnits()
        .filter(u => u.id !== unit.id)
        .map(u => `${u.position.row},${u.position.col}`),
    );

    for (const c of candidates) {
      const territory = gameState.getGrid().getTerritory(c);
      if (!territory) continue;
      const terrain = territory.getTerrainType();
      if (terrain === TerrainType.WATER || terrain === TerrainType.MOUNTAIN) continue;
      if (occupied.has(`${c.row},${c.col}`)) continue;
      return { ...c };
    }
    return null;
  }
}
