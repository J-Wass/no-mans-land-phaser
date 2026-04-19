import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MovementSystem } from './MovementSystem';
import { GameState } from '@/managers/GameState';
import { Infantry } from '@/entities/units/Infantry';
import { Cavalry } from '@/entities/units/Cavalry';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { TerrainType } from '@/systems/grid/Territory';

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

    // 2-step path on PLAINS: stepCost = ceil(10/2) = 5 ticks each => 10 total
    movementSystem.issueOrder(unit, [{ row: 0, col: 1 }, { row: 0, col: 2 }]);

    tickN(10);

    expect(unit.position).toEqual({ row: 0, col: 2 });
    expect(movementSystem.isMoving('unit-1')).toBe(false);
  });

  it('unit reaches first tile after exactly 5 ticks on PLAINS (speed=2)', () => {
    const unit = new Infantry('unit-1', 'nation-1', { row: 0, col: 0 });
    gameState.addUnit(unit);

    movementSystem.issueOrder(unit, [{ row: 0, col: 1 }, { row: 0, col: 2 }]);

    tickN(4); // not there yet
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
    tickN(5);

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
    tickN(5);

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

    // In FOREST, cavalry effective speed=1: cost = ceil(20/1) = 20 ticks
    tickN(19);
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
});
