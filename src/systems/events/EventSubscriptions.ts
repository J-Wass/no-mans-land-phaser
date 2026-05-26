/**
 * EventSubscriptions — tracks a set of GameEventBus listeners so a scene or
 * modal can tear them all down at once.
 *
 * Subscribing directly with `eventBus.on(...)` and forgetting to `off(...)` on
 * shutdown leaks the handler (and everything its closure captures: the dead
 * scene, a stale gameState). Routing subscriptions through one of these and
 * calling `disposeAll()` on SHUTDOWN guarantees cleanup, and stays correct even
 * if the bus is ever promoted to a long-lived/shared instance.
 */

import type { GameEventBus, GameEventMap } from './GameEventBus';

export class EventSubscriptions {
  private disposers: Array<() => void> = [];

  constructor(private readonly bus: GameEventBus) {}

  /** Subscribe and remember the handler so disposeAll() can remove it. */
  public on<K extends keyof GameEventMap>(
    event: K,
    handler: (payload: GameEventMap[K]) => void,
  ): void {
    this.bus.on(event, handler);
    this.disposers.push(() => this.bus.off(event, handler));
  }

  /** Remove every subscription registered through this tracker. */
  public disposeAll(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
  }
}
