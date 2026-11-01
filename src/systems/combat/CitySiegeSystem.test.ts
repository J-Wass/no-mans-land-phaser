import { describe, it, expect, beforeEach } from '@jest/globals';
import { CitySiegeSystem } from './CitySiegeSystem';
import { GameState } from '@/managers/GameState';
import { Nation } from '@/entities/nations/Nation';
import { City } from '@/entities/cities/City';
import { Infantry } from '@/entities/units/Infantry';
import { MovementSystem } from '@/systems/movement/MovementSystem';
import { GameEventBus } from '@/systems/events/GameEventBus';
import {
  CITY_REGEN_AMOUNT,
  CITY_REGEN_INTERVAL,
  CITY_SIEGE_HEAL_COOLDOWN_TICKS,
} from '@/config/combatBalance';

describe('CitySiegeSystem — city healing around sieges', () => {
  let gameState: GameState;
  let sieges: CitySiegeSystem;
  let movement: MovementSystem;
  let eventBus: GameEventBus;
  let city: City;

  beforeEach(() => {
    gameState = new GameState({ rows: 5, cols: 5 });
    gameState.addNation(new Nation('na', 'Attackers', '#f00'));
    gameState.addNation(new Nation('nb', 'Defenders', '#00f'));
    city = new City('city-b', 'Bastion', 'nb', { row: 2, col: 2 });
    city.setHealth(100);
    gameState.addCity(city);
    sieges = new CitySiegeSystem(() => 0.5);
    movement = new MovementSystem();
    eventBus = new GameEventBus();
  });

  function tickRange(from: number, to: number): void {
    for (let t = from; t <= to; t++) sieges.tick(gameState, movement, eventBus, t);
  }

  function besiegeAt(tick: number): Infantry {
    const unit = new Infantry('attacker', 'na', { row: 2, col: 2 });
    gameState.addUnit(unit);
    sieges.startSiege(unit, city, { row: 2, col: 1 }, { row: 2, col: 2 }, tick, movement, eventBus);
    return unit;
  }

  it('heals an unbesieged, damaged city every regen interval', () => {
    tickRange(1, CITY_REGEN_INTERVAL);
    expect(city.getHealth()).toBe(100 + CITY_REGEN_AMOUNT);
  });

  it('does not heal while under siege', () => {
    city.setHealth(190);
    besiegeAt(1);
    let previous = city.getHealth();
    let t = 1;
    for (; t <= 3 * CITY_REGEN_INTERVAL && sieges.getSiegeForUnit('attacker'); t++) {
      sieges.tick(gameState, movement, eventBus, t);
      expect(city.getHealth()).toBeLessThanOrEqual(previous);
      previous = city.getHealth();
    }
    expect(t).toBeGreaterThan(2 * CITY_REGEN_INTERVAL); // the siege spanned at least two regen pulses
  });

  it('waits out the cooldown after the siege ends, then heals again', () => {
    besiegeAt(1);
    tickRange(1, 10);
    sieges.endSiegesBetweenNations(gameState, 'na', 'nb', eventBus, 10);
    const hpAtEnd = city.getHealth();

    // Last besieged on tick 10 → regen may resume from tick 10 + cooldown, at the next pulse.
    const firstHealTick = Math.ceil((10 + CITY_SIEGE_HEAL_COOLDOWN_TICKS) / CITY_REGEN_INTERVAL) * CITY_REGEN_INTERVAL;
    tickRange(11, firstHealTick - 1);
    expect(city.getHealth()).toBe(hpAtEnd);

    tickRange(firstHealTick, firstHealTick);
    expect(city.getHealth()).toBe(hpAtEnd + CITY_REGEN_AMOUNT);
  });

  it('counts the cooldown from the last besieged tick (e.g. ranged bombardment)', () => {
    city.markBesieged(100);
    tickRange(101, 100 + CITY_SIEGE_HEAL_COOLDOWN_TICKS - 1);
    expect(city.getHealth()).toBe(100);
    tickRange(100 + CITY_SIEGE_HEAL_COOLDOWN_TICKS, 100 + CITY_SIEGE_HEAL_COOLDOWN_TICKS + CITY_REGEN_INTERVAL);
    expect(city.getHealth()).toBe(100 + CITY_REGEN_AMOUNT);
  });

  it('persists the last besieged tick across save/load, and old saves load without it', () => {
    city.markBesieged(1234);
    const restored = GameState.fromJSON(gameState.toJSON());
    expect(restored.getCity('city-b')?.getLastBesiegedTick()).toBe(1234);

    const json = gameState.toJSON();
    for (const c of json.cities as Array<{ lastBesiegedTick?: number | null }>) delete c.lastBesiegedTick;
    expect(GameState.fromJSON(json).getCity('city-b')?.getLastBesiegedTick()).toBeNull();
  });

  it('a restored cooldown still blocks healing', () => {
    city.markBesieged(1000);
    const restored = GameState.fromJSON(gameState.toJSON());
    const restoredCity = restored.getCity('city-b')!;
    const fresh = new CitySiegeSystem(() => 0.5);
    fresh.tick(restored, movement, eventBus, 1000 + CITY_REGEN_INTERVAL); // inside the cooldown
    expect(restoredCity.getHealth()).toBe(100);
  });
});
