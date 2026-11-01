import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  BasicProfile,
  BASIC_MAX_SCOUTS,
  BASIC_MIN_TICK_TO_ATTACK,
  BASIC_STRIKE_FORCE,
} from './BasicProfile';
import type { AIContext, AIGoal } from '../AITypes';
import { GameState } from '@/managers/GameState';
import { Nation } from '@/entities/nations/Nation';
import { Player } from '@/entities/players/Player';
import { City } from '@/entities/cities/City';
import { Infantry } from '@/entities/units/Infantry';
import { Scout } from '@/entities/units/Scout';
import { Longbowman } from '@/entities/units/Longbowman';
import { UnitType } from '@/entities/units/Unit';
import type { Unit } from '@/entities/units/Unit';
import { CommandProcessor } from '@/commands/CommandProcessor';
import { MovementSystem } from '@/systems/movement/MovementSystem';
import { Pathfinder } from '@/systems/pathfinding/Pathfinder';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { ResourceType } from '@/systems/resources/ResourceType';
import { CityBuildingType } from '@/systems/territory/CityBuilding';

describe('BasicProfile (Medium AI)', () => {
  let gameState: GameState;
  let movementSystem: MovementSystem;
  let commandProcessor: CommandProcessor;
  let pathfinder: Pathfinder;
  let nation: Nation;
  let city: City;
  let serial = 0;

  beforeEach(() => {
    gameState = new GameState({ rows: 10, cols: 10 });
    movementSystem = new MovementSystem();
    commandProcessor = new CommandProcessor(gameState, movementSystem, new GameEventBus());
    pathfinder = new Pathfinder(gameState.getGrid(), movementSystem);

    nation = new Nation('ai', 'Valdris', '#f00', true);
    nation.setControlledBy('player-ai');
    gameState.addNation(nation);
    gameState.addPlayer(new Player('player-ai', 'Valdris', 'ai', false));

    const enemy = new Nation('foe', 'Player', '#00f');
    gameState.addNation(enemy);
    gameState.addCity(new City('foe-city', 'Grimholt', 'foe', { row: 9, col: 9 }));

    city = new City('ai-city', 'Valdrak', 'ai', { row: 0, col: 0 });
    city.addBuilding(CityBuildingType.BARRACKS);
    gameState.addCity(city);
    serial = 0;
  });

  const ctxAt = (tick: number): AIContext => ({
    nationId: 'ai', playerId: 'player-ai', gameState, commandProcessor,
    movementSystem, pathfinder, currentTick: tick,
  });

  const goal = (id: string, tick: number): AIGoal | undefined =>
    new BasicProfile().generateGoals(ctxAt(tick)).find(g => g.id === id);

  /** Place units of a type on row 1 (each on its own tile). */
  function add(type: 'inf' | 'scout' | 'bow', count: number): Unit[] {
    const made: Unit[] = [];
    for (let i = 0; i < count; i++) {
      const pos = { row: 1 + Math.floor(serial / 8), col: serial % 8 };
      const id = `${type}-${serial++}`;
      const unit = type === 'inf' ? new Infantry(id, 'ai', pos)
        : type === 'scout' ? new Scout(id, 'ai', pos)
          : new Longbowman(id, 'ai', pos);
      gameState.addUnit(unit);
      made.push(unit);
    }
    return made;
  }

  function give(gold: number, food: number, rawMaterial: number): void {
    const t = nation.getTreasury();
    t.addResource(ResourceType.GOLD, gold);
    t.addResource(ResourceType.FOOD, food);
    t.addResource(ResourceType.RAW_MATERIAL, rawMaterial);
  }

  describe('unit mix', () => {
    it(`trains Scouts only up to ${BASIC_MAX_SCOUTS}`, () => {
      give(1000, 1000, 0); // Scouts need no Raw Material; nothing else is affordable
      add('scout', BASIC_MAX_SCOUTS - 1);
      const produce = goal('produce-unit', 100)!;
      expect(produce.isFeasible(ctxAt(100))).toBe(true);
      produce.execute(ctxAt(100));
      expect(city.getCurrentOrder()).toMatchObject({ kind: 'unit', unitType: UnitType.SCOUT });

      // The Scout in training counts toward the cap.
      const second = new City('ai-city-2', 'Stoneholt', 'ai', { row: 0, col: 9 });
      second.addBuilding(CityBuildingType.BARRACKS);
      gameState.addCity(second);
      expect(goal('produce-unit', 130)!.isFeasible(ctxAt(130))).toBe(false);
    });

    it('trains Infantry as the core of its army', () => {
      give(1000, 1000, 1000);
      add('scout', BASIC_MAX_SCOUTS);
      goal('produce-unit', 100)!.execute(ctxAt(100));
      expect(city.getCurrentOrder()).toMatchObject({ kind: 'unit', unitType: UnitType.INFANTRY });
    });

    it('saves up for a Longbowman once Hunting and Barracks 2 are in, one per Infantry', () => {
      nation.setResearchedTechs(['hunting']);
      city.setBuildingLevel(CityBuildingType.BARRACKS, 2);
      add('scout', BASIC_MAX_SCOUTS);
      add('inf', 1);
      give(1000, 1000, 300); // enough for Infantry, not yet for a Longbowman
      expect(goal('produce-unit', 100)!.isFeasible(ctxAt(100))).toBe(false);

      give(0, 0, 50);
      goal('produce-unit', 100)!.execute(ctxAt(100));
      expect(city.getCurrentOrder()).toMatchObject({ kind: 'unit', unitType: UnitType.LONGBOWMAN });
    });

    it('pushes one city to Barracks 2 once Hunting is researched', () => {
      nation.setResearchedTechs(['hunting']);
      give(1000, 1000, 1000);
      const goals = new BasicProfile().generateGoals(ctxAt(100)).filter(g => g.id === 'build-building');
      expect(goals).toHaveLength(2);
    });
  });

  describe('attacking', () => {
    it(`never attacks before tick ${BASIC_MIN_TICK_TO_ATTACK}`, () => {
      add('inf', BASIC_STRIKE_FORCE);
      expect(goal('attack-target', BASIC_MIN_TICK_TO_ATTACK - 1)!.isFeasible(ctxAt(BASIC_MIN_TICK_TO_ATTACK - 1))).toBe(false);
      expect(goal('attack-target', BASIC_MIN_TICK_TO_ATTACK)!.isFeasible(ctxAt(BASIC_MIN_TICK_TO_ATTACK))).toBe(true);
    });

    it(`waits for a strike force of ${BASIC_STRIKE_FORCE} combat units — Scouts don't count`, () => {
      const tick = BASIC_MIN_TICK_TO_ATTACK + 500;
      add('inf', BASIC_STRIKE_FORCE - 1);
      add('scout', BASIC_MAX_SCOUTS);
      expect(goal('attack-target', tick)!.isFeasible(ctxAt(tick))).toBe(false);

      add('bow', 1);
      expect(goal('attack-target', tick)!.isFeasible(ctxAt(tick))).toBe(true);
    });

    it('sends the whole strike force together and keeps its Scouts back', () => {
      const tick = BASIC_MIN_TICK_TO_ATTACK + 30;
      const army = add('inf', BASIC_STRIKE_FORCE);
      const scouts = add('scout', BASIC_MAX_SCOUTS);
      goal('attack-target', tick)!.execute(ctxAt(tick));

      for (const u of army) expect(movementSystem.isMoving(u.id)).toBe(true);
      for (const u of scouts) expect(movementSystem.isMoving(u.id)).toBe(false);
    });

    it('a busy (moving) unit does not count toward the strike force', () => {
      const tick = BASIC_MIN_TICK_TO_ATTACK + 30;
      const army = add('inf', BASIC_STRIKE_FORCE);
      movementSystem.issueOrder(army[0]!, [{ row: 2, col: 0 }]);
      expect(goal('attack-target', tick)!.isFeasible(ctxAt(tick))).toBe(false);
    });
  });

  describe('mustering', () => {
    it('keeps Raw Material for the army while it is below the strike force', () => {
      // Walls cost 90 RM; on war footing a unit's worth must stay in hand on top.
      add('scout', BASIC_MAX_SCOUTS);
      nation.setResearchedTechs(['masonry']);
      give(1000, 1000, 200);
      expect(goal('build-building', 1000)!.isFeasible(ctxAt(1000))).toBe(true);  // before war footing
      expect(goal('build-building', 1500)!.isFeasible(ctxAt(1500))).toBe(false); // war footing
      add('inf', BASIC_STRIKE_FORCE);
      expect(goal('build-building', 1500)!.isFeasible(ctxAt(1500))).toBe(true);  // army mustered
    });

    it('ranks training above city buildings until the army is built', () => {
      add('scout', BASIC_MAX_SCOUTS);
      add('inf', 2);
      expect(goal('produce-unit', 2000)!.priority(ctxAt(2000)))
        .toBeGreaterThan(goal('build-building', 2000)!.priority(ctxAt(2000)));
    });

    it('only sends Scouts out to claim land once the attack window opens', () => {
      const [inf] = add('inf', 1);
      add('scout', 1);
      // Make every Scout busy: the only idle unit is the Infantry.
      for (const u of gameState.getUnitsByNation('ai')) {
        if (u.getUnitType() === UnitType.SCOUT) movementSystem.issueOrder(u, [{ row: 5, col: 5 }]);
      }
      // Rows 0-1 are ours (nobody stands on unclaimed land); row 2 is open to claim.
      for (let r = 0; r <= 1; r++) {
        for (let c = 0; c < 10; c++) gameState.getGrid().getTerritory({ row: r, col: c })?.setControllingNation('ai');
      }
      give(1000, 1000, 1000);

      expect(goal('claim-territory', 1000)!.isFeasible(ctxAt(1000))).toBe(true);
      expect(goal('claim-territory', BASIC_MIN_TICK_TO_ATTACK)!.isFeasible(ctxAt(BASIC_MIN_TICK_TO_ATTACK))).toBe(false);
      expect(movementSystem.isMoving(inf!.id)).toBe(false);
    });
  });
});
