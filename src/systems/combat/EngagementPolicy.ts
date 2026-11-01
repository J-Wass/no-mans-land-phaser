/**
 * EngagementPolicy — decides whether a unit of one nation may start combat
 * (melee battle, city siege, ranged fire at a preferred target) against
 * another nation at a given tick.
 *
 * TickEngine owns the active policy and hands it to MovementSystem and the
 * combat systems. GameScene installs DiplomacySystem.canEngage so peace
 * cooldowns are respected; without diplomacy (tests, headless use) the
 * default only rules out self-targeting and allies.
 */

import type { EntityId } from '@/types/common';
import type { GameState } from '@/managers/GameState';

export type EngagementPolicy = (
  attackerNationId: EntityId,
  targetNationId:   EntityId,
  currentTick:      number,
) => boolean;

export function defaultEngagementPolicy(gameState: GameState): EngagementPolicy {
  return (attackerNationId, targetNationId) => {
    if (attackerNationId === targetNationId) return false;
    return !(gameState.getNation(attackerNationId)?.isAlly(targetNationId) ?? false);
  };
}
