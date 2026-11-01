import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MovementSystem } from './MovementSystem';
import { GameState } from '@/managers/GameState';
import { Infantry } from '@/entities/units/Infantry';
import { Cavalry } from '@/entities/units/Cavalry';
import { Scout } from '@/entities/units/Scout';
import { Nation } from '@/entities/nations/Nation';
import { BattleSystem } from '@/systems/combat/BattleSystem';
import { CitySiegeSystem } from '@/systems/combat/CitySiegeSystem';
import { TerritoryBattleSystem } from '@/systems/combat/TerritoryBattleSystem';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { TerrainType } from '@/systems/grid/Territory';
import { City } from '@/entities/cities/City';

describe('MovementSystem', () => {
  let gameState: GameState;
  let movementSystem: MovementSystem;
  let eventBus: GameEventBus;

  beforeEach(() => {
    gameState = new GameState({ rows: 5, cols: 5 });
    movementSystem = new MovementSystem();
    eventBus = new GameEventBus();
  });

  function tickN(n: number, tick = 0): number {
    let t = tick;
    for (let i = 0; i < n; i++) {
      movementSystem.tick(gameState, eventBus, ++t);
    }
    return t;
  }

  it('unit arrives at destination after correct ticks (2-step PLAINS, speed=2)', () => {
    const unit = new Infantry('unit-1', 'nation-1', { row: 0, col: 0 });
    gameState.addUnit(unit);

    // 2-step path on PLAINS: stepCost = ceil(50/2) = 25 ticks each => 50 total
    movementSystem.issueOrder(unit, [{ row: 0, col: 1 }, { row: 0, col: 2 }]);

    tickN(50);

    expect(unit.position).toEqual({ row: 0, col: 2 });
    expect(movementSystem.isMoving('unit-1')).toBe(false);
  });

  it('a spy moves onto an enemy unit without starting a battle', () => {
    gameState.addNation(new Nation('na', 'A', '#f00'));
    gameState.addNation(new Nation('nb', 'B', '#00f'));
    const spy = new Scout('spy', 'na', { row: 1, col: 0 });
    spy.setSpy(true);
    gameState.addUnit(spy);
    gameState.addUnit(new Infantry('enemy', 'nb', { row: 1, col: 1 }));
    const battle = new BattleSystem(() => 0.5);
    const siege = new CitySiegeSystem(() => 0.5);
    const terr = new TerritoryBattleSystem(() => 0.5);

    movementSystem.issueOrder(spy, [{ row: 1, col: 1 }]);
    for (let t = 1; t <= 25; t++) movementSystem.tickWithBattles(gameState, eventBus, t, battle, siege, terr);

    expect(spy.position).toEqual({ row: 1, col: 1 });   // coexists on the enemy's tile
    expect(spy.isEngagedInBattle()).toBe(false);
    expect(battle.getBattleForUnit('spy')).toBeNull();
  });

  it('a normal Scout DOES start a battle entering an enemy unit (control)', () => {
    gameState.addNation(new Nation('na', 'A', '#f00'));
    gameState.addNation(new Nation('nb', 'B', '#00f'));
    const scout = new Scout('scout', 'na', { row: 1, col: 0 });
    gameState.addUnit(scout);
    gameState.addUnit(new Infantry('enemy', 'nb', { row: 1, col: 1 }));
    const battle = new BattleSystem(() => 0.5);
    const siege = new CitySiegeSystem(() => 0.5);
    const terr = new TerritoryBattleSystem(() => 0.5);

    movementSystem.issueOrder(scout, [{ row: 1, col: 1 }]);
    for (let t = 1; t <= 25; t++) movementSystem.tickWithBattles(gameState, eventBus, t, battle, siege, terr);

    expect(battle.getBattleForUnit('scout')).not.toBeNull();
  });

  it('an enemy unit moving onto a stationary spy does not start a battle (no auto-war)', () => {
    gameState.addNation(new Nation('na', 'A', '#f00'));
    gameState.addNation(new Nation('nb', 'B', '#00f'));
    const spy = new Scout('spy', 'na', { row: 2, col: 1 });
    spy.setSpy(true);
    gameState.addUnit(spy);
    const enemy = new Infantry('enemy', 'nb', { row: 2, col: 0 });
    gameState.addUnit(enemy);
    const battle = new BattleSystem(() => 0.5);
    const siege = new CitySiegeSystem(() => 0.5);
    const terr = new TerritoryBattleSystem(() => 0.5);

    movementSystem.issueOrder(enemy, [{ row: 2, col: 1 }]); // enemy walks onto the spy
    for (let t = 1; t <= 25; t++) movementSystem.tickWithBattles(gameState, eventBus, t, battle, siege, terr);

    expect(enemy.position).toEqual({ row: 2, col: 1 }); // coexists on the spy's tile
    expect(battle.getBattleForUnit('enemy')).toBeNull();
    expect(battle.getBattleForUnit('spy')).toBeNull();
    expect(enemy.isEngagedInBattle()).toBe(false);
  });

  it('unit reaches first tile after exactly 25 ticks on PLAINS (speed=2)', () => {
    const unit = new Infantry('unit-1', 'nation-1', { row: 0, col: 0 });
    gameState.addUnit(unit);

    movementSystem.issueOrder(unit, [{ row: 0, col: 1 }, { row: 0, col: 2 }]);

    tickN(24); // not there yet
    expect(unit.position).toEqual({ row: 0, col: 0 });

    tickN(1); // step completes
    expect(unit.position).toEqual({ row: 0, col: 1 });
  });

  it('cancel order stops movement', () => {
    const unit = new Infantry('unit-1', 'nation-1', { row: 0, col: 0 });
    gameState.addUnit(unit);

    movementSystem.issueOrder(unit, [{ row: 0, col: 1 }]);
    movementSystem.cancelOrder('unit-1');

    tickN(10);
    expect(unit.position).toEqual({ row: 0, col: 0 });
    expect(movementSystem.isMoving('unit-1')).toBe(false);
  });

  it('emits unit:step-complete event when unit moves a tile', () => {
    const unit = new Infantry('unit-1', 'nation-1', { row: 0, col: 0 });
    gameState.addUnit(unit);

    const handler = jest.fn();
    eventBus.on('unit:step-complete', handler);

    movementSystem.issueOrder(unit, [{ row: 0, col: 1 }]);
    tickN(25);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        unitId: 'unit-1',
        from: { row: 0, col: 0 },
        to: { row: 0, col: 1 },
      })
    );
  });

  it('emits unit:move-complete event when full path done', () => {
    const unit = new Infantry('unit-1', 'nation-1', { row: 0, col: 0 });
    gameState.addUnit(unit);

    const handler = jest.fn();
    eventBus.on('unit:move-complete', handler);

    movementSystem.issueOrder(unit, [{ row: 0, col: 1 }]);
    tickN(25);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ unitId: 'unit-1', destination: { row: 0, col: 1 } })
    );
  });

  it('cavalry has movement penalty in FOREST (effective speed=1)', () => {
    // Set all tiles to FOREST
    for (let c = 0; c < 5; c++) {
      gameState.getGrid().getTerritory({ row: 0, col: c })?.setTerrainType(TerrainType.FOREST);
    }
    const cavalry = new Cavalry('unit-c', 'nation-1', { row: 0, col: 0 });
    gameState.addUnit(cavalry);

    movementSystem.issueOrder(cavalry, [{ row: 0, col: 1 }]);

    // In FOREST, cavalry effective speed=1: cost = ceil(100/1) = 100 ticks
    tickN(99);
    expect(cavalry.position).toEqual({ row: 0, col: 0 });

    tickN(1);
    expect(cavalry.position).toEqual({ row: 0, col: 1 });
  });

  it('dead unit movement is cancelled automatically', () => {
    const unit = new Infantry('unit-1', 'nation-1', { row: 0, col: 0 });
    gameState.addUnit(unit);

    movementSystem.issueOrder(unit, [{ row: 0, col: 1 }]);
    unit.takeDamage(100); // kill it

    tickN(10);
    expect(movementSystem.isMoving('unit-1')).toBe(false);
    expect(unit.position).toEqual({ row: 0, col: 0 });
  });

  describe('engagement policy', () => {
    function setup(): { battle: BattleSystem; siege: CitySiegeSystem; terr: TerritoryBattleSystem } {
      gameState.addNation(new Nation('na', 'A', '#f00'));
      gameState.addNation(new Nation('nb', 'B', '#00f'));
      return {
        battle: new BattleSystem(() => 0.5),
        siege: new CitySiegeSystem(() => 0.5),
        terr: new TerritoryBattleSystem(() => 0.5),
      };
    }

    it('moving onto an allied unit shares the tile instead of starting a battle', () => {
      const { battle, siege, terr } = setup();
      gameState.getNation('na')!.formAlliance('nb');
      gameState.getNation('nb')!.formAlliance('na');
      const mover = new Infantry('mover', 'na', { row: 1, col: 0 });
      const ally = new Infantry('ally', 'nb', { row: 1, col: 1 });
      gameState.addUnit(mover);
      gameState.addUnit(ally);

      movementSystem.issueOrder(mover, [{ row: 1, col: 1 }]);
      for (let t = 1; t <= 25; t++) movementSystem.tickWithBattles(gameState, eventBus, t, battle, siege, terr);

      expect(mover.position).toEqual({ row: 1, col: 1 });
      expect(mover.isEngagedInBattle()).toBe(false);
      expect(ally.isEngagedInBattle()).toBe(false);
    });

    it('moving onto an allied city does not besiege it', () => {
      const { battle, siege, terr } = setup();
      gameState.getNation('na')!.formAlliance('nb');
      gameState.getNation('nb')!.formAlliance('na');
      gameState.addCity(new City('c', 'Ally Town', 'nb', { row: 1, col: 1 }));
      const mover = new Infantry('mover', 'na', { row: 1, col: 0 });
      gameState.addUnit(mover);

      movementSystem.issueOrder(mover, [{ row: 1, col: 1 }]);
      for (let t = 1; t <= 25; t++) movementSystem.tickWithBattles(gameState, eventBus, t, battle, siege, terr);

      expect(mover.isEngagedInBattle()).toBe(false);
      expect(siege.getSiegeForUnit('mover')).toBeNull();
    });

    it('does not start a battle when the policy forbids it (e.g. a peace cooldown)', () => {
      const { battle, siege, terr } = setup();
      const mover = new Infantry('mover', 'na', { row: 1, col: 0 });
      const neutral = new Infantry('neutral', 'nb', { row: 1, col: 1 });
      gameState.addUnit(mover);
      gameState.addUnit(neutral);

      movementSystem.issueOrder(mover, [{ row: 1, col: 1 }]);
      for (let t = 1; t <= 25; t++) {
        movementSystem.tickWithBattles(gameState, eventBus, t, battle, siege, terr, () => false);
      }

      expect(mover.isEngagedInBattle()).toBe(false);
      expect(battle.getBattleForUnit('mover')).toBeNull();
    });

    it('still fights a neutral unit by default (auto-war)', () => {
      const { battle, siege, terr } = setup();
      const mover = new Infantry('mover', 'na', { row: 1, col: 0 });
      gameState.addUnit(mover);
      gameState.addUnit(new Infantry('neutral', 'nb', { row: 1, col: 1 }));

      movementSystem.issueOrder(mover, [{ row: 1, col: 1 }]);
      for (let t = 1; t <= 25; t++) movementSystem.tickWithBattles(gameState, eventBus, t, battle, siege, terr);

      expect(battle.getBattleForUnit('mover')).not.toBeNull();
    });
  });
});
