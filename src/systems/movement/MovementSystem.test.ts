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
import { FRIENDLY_BLOCK_GRACE_TICKS } from '@/config/constants';
import type { GameEventMap } from '@/systems/events/GameEventBus';

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

  describe('friendly units in the way', () => {
    function collectBlocked(): GameEventMap['unit:move-blocked'][] {
      const events: GameEventMap['unit:move-blocked'][] = [];
      eventBus.on('unit:move-blocked', e => events.push(e));
      return events;
    }

    it('swaps places with an idle friendly on its path and still arrives', () => {
      const blocked = collectBlocked();
      const mover = new Infantry('mover', 'nation-1', { row: 0, col: 0 });
      const parked = new Infantry('parked', 'nation-1', { row: 0, col: 1 });
      gameState.addUnit(mover);
      gameState.addUnit(parked);

      const steps: string[] = [];
      eventBus.on('unit:step-complete', ({ unitId, to }) => steps.push(`${unitId}>${to.row},${to.col}`));
      movementSystem.issueOrder(mover, [{ row: 0, col: 1 }, { row: 0, col: 2 }]);
      tickN(200);

      expect(mover.position).toEqual({ row: 0, col: 2 });
      expect(parked.position).toEqual({ row: 0, col: 0 });
      expect(steps.slice(0, 2)).toEqual(['parked>0,0', 'mover>0,1']);
      expect(movementSystem.isMoving('mover')).toBe(false);
      expect(blocked).toHaveLength(0);
    });

    it('never swaps with a friendly that is fighting', () => {
      const mover = new Infantry('mover', 'nation-1', { row: 0, col: 0 });
      const fighter = new Infantry('fighter', 'nation-1', { row: 0, col: 1 });
      fighter.setEngagedInBattle(true);
      gameState.addUnit(mover);
      gameState.addUnit(fighter);

      movementSystem.issueOrder(mover, [{ row: 0, col: 1 }, { row: 0, col: 2 }]);
      tickN(200);

      expect(fighter.position).toEqual({ row: 0, col: 1 });
      expect(mover.position).not.toEqual({ row: 0, col: 1 });
    });

    it('re-paths in the battle-aware tick too', () => {
      gameState.addNation(new Nation('na', 'A', '#f00'));
      const mover = new Infantry('mover', 'na', { row: 0, col: 0 });
      gameState.addUnit(mover);
      gameState.addUnit(new Infantry('parked', 'na', { row: 0, col: 1 }));
      const battle = new BattleSystem(() => 0.5);
      const siege = new CitySiegeSystem(() => 0.5);
      const terr = new TerritoryBattleSystem(() => 0.5);

      movementSystem.issueOrder(mover, [{ row: 0, col: 1 }, { row: 0, col: 2 }]);
      for (let t = 1; t <= 200; t++) movementSystem.tickWithBattles(gameState, eventBus, t, battle, siege, terr);

      expect(mover.position).toEqual({ row: 0, col: 2 });
    });

    it('stops next to a destination held by a parked friendly and reports it', () => {
      const blocked = collectBlocked();
      const mover = new Infantry('mover', 'nation-1', { row: 0, col: 0 });
      gameState.addUnit(mover);
      gameState.addUnit(new Infantry('parked', 'nation-1', { row: 0, col: 1 }));

      movementSystem.issueOrder(mover, [{ row: 0, col: 1 }]);
      tickN(25 + FRIENDLY_BLOCK_GRACE_TICKS);

      expect(mover.position).toEqual({ row: 0, col: 0 });
      expect(movementSystem.isMoving('mover')).toBe(false);
      expect(blocked).toEqual([expect.objectContaining({
        unitId:        'mover',
        position:      { row: 0, col: 0 },
        blockedAt:     { row: 0, col: 1 },
        blockerUnitId: 'parked',
        reason:        'destination-occupied',
      })]);
    });

    it('swaps past an idle friendly but stops short of one parked on the destination', () => {
      const blocked = collectBlocked();
      const mover = new Infantry('mover', 'nation-1', { row: 0, col: 0 });
      const inWay = new Infantry('in-way', 'nation-1', { row: 0, col: 1 });
      gameState.addUnit(mover);
      gameState.addUnit(inWay);
      gameState.addUnit(new Infantry('at-dest', 'nation-1', { row: 0, col: 3 }));

      movementSystem.issueOrder(mover, [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }]);
      tickN(200);

      expect(inWay.position).toEqual({ row: 0, col: 0 });
      expect(mover.position).toEqual({ row: 0, col: 2 });
      expect(movementSystem.isMoving('mover')).toBe(false);
      expect(blocked[0]).toMatchObject({
        blockedAt: { row: 0, col: 3 }, blockerUnitId: 'at-dest', reason: 'destination-occupied',
      });
    });

    it('gets a whole column through a one-tile corridor past an idle friendly', () => {
      const blocked = collectBlocked();
      // A one-tile-wide corridor along row 0.
      for (let r = 1; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          gameState.getGrid().getTerritory({ row: r, col: c })?.setTerrainType(TerrainType.WATER);
        }
      }
      const lead = new Infantry('lead', 'nation-1', { row: 0, col: 1 });
      const tail = new Infantry('tail', 'nation-1', { row: 0, col: 0 });
      const parked = new Infantry('parked', 'nation-1', { row: 0, col: 2 });
      gameState.addUnit(lead);
      gameState.addUnit(tail);
      gameState.addUnit(parked);

      movementSystem.issueOrder(lead, [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }]);
      movementSystem.issueOrder(tail, [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }]);
      tickN(400);

      expect(lead.position).toEqual({ row: 0, col: 4 });
      expect(tail.position).toEqual({ row: 0, col: 3 });
      expect(blocked).toHaveLength(0);
    });

    it('waits behind a fighting friendly in a corridor instead of swapping or giving up', () => {
      const blocked = collectBlocked();
      for (let r = 1; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          gameState.getGrid().getTerritory({ row: r, col: c })?.setTerrainType(TerrainType.WATER);
        }
      }
      const mover = new Infantry('mover', 'nation-1', { row: 0, col: 0 });
      const fighter = new Infantry('fighter', 'nation-1', { row: 0, col: 1 });
      fighter.setEngagedInBattle(true);
      gameState.addUnit(mover);
      gameState.addUnit(fighter);

      movementSystem.issueOrder(mover, [{ row: 0, col: 1 }, { row: 0, col: 2 }]);
      tickN(200);

      // A fighting friendly is waited for (it may fall or win and move on), never swapped.
      expect(fighter.position).toEqual({ row: 0, col: 1 });
      expect(mover.position).toEqual({ row: 0, col: 0 });
      expect(blocked).toHaveLength(0);
    });

    it('waits (without giving up) for a friendly that is moving off the tile', () => {
      const blocked = collectBlocked();
      // The blocker's own step is slow (forest: 50 ticks), well past the grace period.
      gameState.getGrid().getTerritory({ row: 1, col: 1 })?.setTerrainType(TerrainType.FOREST);
      const mover = new Infantry('mover', 'nation-1', { row: 0, col: 0 });
      const leaving = new Infantry('leaving', 'nation-1', { row: 0, col: 1 });
      gameState.addUnit(mover);
      gameState.addUnit(leaving);

      movementSystem.issueOrder(mover, [{ row: 0, col: 1 }]);
      movementSystem.issueOrder(leaving, [{ row: 1, col: 1 }]);
      tickN(60);

      expect(leaving.position).toEqual({ row: 1, col: 1 });
      expect(mover.position).toEqual({ row: 0, col: 1 });
      expect(blocked).toHaveLength(0);
    });

    it('keeps waiting behind a friendly that is fighting (it may fall and free the tile)', () => {
      const blocked = collectBlocked();
      const mover = new Infantry('mover', 'nation-1', { row: 0, col: 0 });
      const fighter = new Infantry('fighter', 'nation-1', { row: 0, col: 1 });
      fighter.setEngagedInBattle(true);
      gameState.addUnit(mover);
      gameState.addUnit(fighter);

      movementSystem.issueOrder(mover, [{ row: 0, col: 1 }]);
      const t = tickN(200);

      expect(movementSystem.isMoving('mover')).toBe(true);
      expect(blocked).toHaveLength(0);

      gameState.removeUnit('fighter'); // the besieger fell
      tickN(2, t);
      expect(mover.position).toEqual({ row: 0, col: 1 });
    });

    it('two friendlies ordered onto each other’s tiles do not freeze forever', () => {
      const blocked = collectBlocked();
      gameState.addUnit(new Infantry('a', 'nation-1', { row: 0, col: 0 }));
      gameState.addUnit(new Infantry('b', 'nation-1', { row: 0, col: 1 }));

      movementSystem.issueOrder(gameState.getUnit('a')!, [{ row: 0, col: 1 }]);
      movementSystem.issueOrder(gameState.getUnit('b')!, [{ row: 0, col: 0 }]);
      tickN(25 + FRIENDLY_BLOCK_GRACE_TICKS + 1);

      expect(movementSystem.isMoving('a')).toBe(false);
      expect(movementSystem.isMoving('b')).toBe(false);
      expect(blocked.map(e => e.unitId).sort()).toEqual(['a', 'b']);
    });

    it('isAdvancing is false while a unit waits behind a friendly', () => {
      const mover = new Infantry('mover', 'nation-1', { row: 0, col: 0 });
      gameState.addUnit(mover);
      gameState.addUnit(new Infantry('parked', 'nation-1', { row: 0, col: 1 }));

      movementSystem.issueOrder(mover, [{ row: 0, col: 1 }]);
      const t = tickN(24);
      expect(movementSystem.isAdvancing('mover')).toBe(true);
      tickN(1, t);
      expect(movementSystem.isMoving('mover')).toBe(true);
      expect(movementSystem.isAdvancing('mover')).toBe(false);
    });

    it('restores the blocked-tick counter from a save, and loads older saves without it', () => {
      movementSystem.restoreStates([
        { unitId: 'u1', path: [{ row: 0, col: 1 }], ticksRemainingOnStep: 1, blockedTicks: 3 },
        { unitId: 'u2', path: [{ row: 1, col: 1 }], ticksRemainingOnStep: 4 },
      ]);
      expect(movementSystem.getState('u1')?.blockedTicks).toBe(3);
      expect(movementSystem.getState('u2')?.blockedTicks).toBeUndefined();
      expect(movementSystem.isAdvancing('u2')).toBe(true);
    });
  });
});
