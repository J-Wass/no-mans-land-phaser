import { describe, it, expect, beforeEach } from '@jest/globals';
import { CommandProcessor } from './CommandProcessor';
import { GameState } from '@/managers/GameState';
import { MovementSystem } from '@/systems/movement/MovementSystem';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { Nation } from '@/entities/nations/Nation';
import { Player } from '@/entities/players/Player';
import { Infantry } from '@/entities/units/Infantry';

describe('CommandProcessor', () => {
  let gameState: GameState;
  let movementSystem: MovementSystem;
  let eventBus: GameEventBus;
  let processor: CommandProcessor;
  let nation: Nation;
  let player: Player;
  let unit: Infantry;

  beforeEach(() => {
    gameState = new GameState({ rows: 5, cols: 5 });
    movementSystem = new MovementSystem();
    eventBus = new GameEventBus();
    processor = new CommandProcessor(gameState, movementSystem, eventBus);

    nation = new Nation('nation-1', 'Rome', '#FF0000');
    gameState.addNation(nation);

    player = new Player('player-1', 'Player One', 'nation-1', true);
    nation.setControlledBy('player-1');
    gameState.addPlayer(player);

    unit = new Infantry('unit-1', 'nation-1', { row: 0, col: 0 });
    gameState.addUnit(unit);
  });

  it('dispatches a valid MOVE_UNIT command successfully', () => {
    const result = processor.dispatch({
      type: 'MOVE_UNIT',
      playerId: 'player-1',
      unitId: 'unit-1',
      path: [{ row: 0, col: 1 }],
      issuedAtTick: 1,
    });

    expect(result.success).toBe(true);
    expect(movementSystem.isMoving('unit-1')).toBe(true);
  });

  it('rejects command when player not found', () => {
    const result = processor.dispatch({
      type: 'MOVE_UNIT',
      playerId: 'nonexistent-player',
      unitId: 'unit-1',
      path: [{ row: 0, col: 1 }],
      issuedAtTick: 1,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/player not found/i);
  });

  it('rejects command when unit not found', () => {
    const result = processor.dispatch({
      type: 'MOVE_UNIT',
      playerId: 'player-1',
      unitId: 'nonexistent-unit',
      path: [{ row: 0, col: 1 }],
      issuedAtTick: 1,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/unit not found/i);
  });

  it('rejects command when player does not own the unit', () => {
    // Create a second nation/player that doesn't own unit-1
    const nation2 = new Nation('nation-2', 'Persia', '#0000FF');
    gameState.addNation(nation2);
    const player2 = new Player('player-2', 'Player Two', 'nation-2', false);
    nation2.setControlledBy('player-2');
    gameState.addPlayer(player2);

    const result = processor.dispatch({
      type: 'MOVE_UNIT',
      playerId: 'player-2',
      unitId: 'unit-1', // owned by nation-1, not nation-2
      path: [{ row: 0, col: 1 }],
      issuedAtTick: 1,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/does not belong/i);
  });

  it('rejects command with empty path', () => {
    const result = processor.dispatch({
      type: 'MOVE_UNIT',
      playerId: 'player-1',
      unitId: 'unit-1',
      path: [],
      issuedAtTick: 1,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/path is empty/i);
  });

  it('rejects command for a dead unit', () => {
    unit.takeDamage(100);

    const result = processor.dispatch({
      type: 'MOVE_UNIT',
      playerId: 'player-1',
      unitId: 'unit-1',
      path: [{ row: 0, col: 1 }],
      issuedAtTick: 1,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/dead/i);
  });

  it('emits unit:move-ordered event on success', () => {
    const events: unknown[] = [];
    eventBus.on('unit:move-ordered', e => events.push(e));

    processor.dispatch({
      type: 'MOVE_UNIT',
      playerId: 'player-1',
      unitId: 'unit-1',
      path: [{ row: 0, col: 1 }],
      issuedAtTick: 1,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ unitId: 'unit-1', playerId: 'player-1' });
  });
});
