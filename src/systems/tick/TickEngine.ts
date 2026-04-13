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
import { ProductionSystem } from '@/systems/production/ProductionSystem';

export class TickEngine {
  private currentTick = 0;
  private readonly productionSystem = new ProductionSystem();
  private readonly battleSystem = new BattleSystem();

  constructor(
    private gameState: GameState,
    private movementSystem: MovementSystem,
    private eventBus: GameEventBus
  ) {}

  /** Advance one tick. Returns the new tick count. */
  public advance(): number {
    this.currentTick++;
    this.movementSystem.tickWithBattles(this.gameState, this.eventBus, this.currentTick, this.battleSystem);
    this.battleSystem.tick(this.gameState, this.movementSystem, this.eventBus, this.currentTick);
    this.productionSystem.tick(this.gameState, this.eventBus, this.currentTick);
    this.eventBus.emit('game:tick', { tick: this.currentTick });
    return this.currentTick;
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

  public getBattleStates(): SavedBattleState[] {
    return this.battleSystem.toSavedStates();
  }

  public restoreBattleStates(saved: SavedBattleState[]): void {
    this.battleSystem.restore(saved, this.gameState);
  }
}
