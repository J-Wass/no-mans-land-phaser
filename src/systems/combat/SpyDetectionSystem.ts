/**
 * SpyDetectionSystem — once per second, each undercover Scout (spy) standing near
 * a non-allied enemy unit risks being caught. Catch chance rises the closer the
 * enemy is and the more the enemy out-XPs the spy (counter-intel vs stealth). A
 * caught spy is destroyed on the spot.
 *
 * Uses the shared deterministic RNG (like BattleSystem) so detection replays
 * identically in lockstep multiplayer.
 */

import type { GameState } from '@/managers/GameState';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import { chebyshev } from '@/systems/grid/geometry';
import { TICK_RATE } from '@/config/constants';

/** A detection roll happens once per this many ticks (1 s at TICK_RATE=10). */
export const SPY_DETECTION_INTERVAL_TICKS = TICK_RATE;

/** Per-pass base catch chance by Chebyshev distance from an enemy unit. */
export const SPY_DETECTION_BASE = { onTile: 0.5, adjacent: 0.25, near: 0.1 } as const;

/** Each point of (enemy XP − spy XP) shifts the catch chance by this. */
export const SPY_DETECTION_XP_WEIGHT = 0.01;
export const SPY_DETECTION_MIN_CHANCE = 0.02;
export const SPY_DETECTION_MAX_CHANCE = 0.95;

/** Max Chebyshev distance at which an enemy can detect a spy. */
export const SPY_DETECTION_RADIUS = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function baseChanceFor(distance: number): number {
  if (distance <= 0) return SPY_DETECTION_BASE.onTile;
  if (distance === 1) return SPY_DETECTION_BASE.adjacent;
  return SPY_DETECTION_BASE.near;
}

export class SpyDetectionSystem {
  constructor(private readonly random: () => number = Math.random) {}

  public tick(gameState: GameState, eventBus: GameEventBus, currentTick: number): void {
    if (currentTick % SPY_DETECTION_INTERVAL_TICKS !== 0) return;

    const allUnits = [...gameState.getAllUnits()];
    const spies = allUnits.filter(u => u.isAlive() && u.isSpy());
    if (spies.length === 0) return;

    for (const spy of spies) {
      const spyNation = gameState.getNation(spy.getOwnerId());

      // Spies are only at risk on enemy-controlled soil. In neutral no-man's-land
      // (unowned), on their own territory, or on allied territory there's no hostile
      // population to give them away, so they can't be caught there.
      const tileOwner = gameState.getGrid().getTerritory(spy.position)?.getControllingNation() ?? null;
      if (tileOwner === null
          || tileOwner === spy.getOwnerId()
          || (spyNation?.isAlly(tileOwner) ?? false)) {
        continue;
      }

      for (const other of allUnits) {
        if (!other.isAlive()) continue;
        if (other.getOwnerId() === spy.getOwnerId()) continue;
        if (spyNation?.isAlly(other.getOwnerId())) continue;

        const dist = chebyshev(spy.position, other.position);
        if (dist > SPY_DETECTION_RADIUS) continue;

        const chance = clamp(
          baseChanceFor(dist) + (other.getXP() - spy.getXP()) * SPY_DETECTION_XP_WEIGHT,
          SPY_DETECTION_MIN_CHANCE,
          SPY_DETECTION_MAX_CHANCE,
        );
        if (this.random() >= chance) continue;

        // Caught — the spy is destroyed.
        const position = { ...spy.position };
        const ownerNationId = spy.getOwnerId();
        gameState.removeUnit(spy.id);
        eventBus.emit('spy:detected', {
          spyUnitId: spy.id,
          ownerNationId,
          byNationId: other.getOwnerId(),
          byUnitId: other.id,
          position,
          tick: currentTick,
        });
        eventBus.emit('unit:destroyed', {
          unitId: spy.id,
          byUnitId: other.id,
          ownerNationId,
          position,
          tick: currentTick,
          unitName: spy.getFullName(),
          cause: 'spy-detected',
        });
        break; // this spy is gone; move on to the next one
      }
    }
  }
}
