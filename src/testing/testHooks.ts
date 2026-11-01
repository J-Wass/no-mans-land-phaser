/**
 * testHooks — the only test-harness code that ships in every build.
 *
 * Scenes call these optional hooks; they are no-ops unless the dev-only
 * TestHarness (src/testing/TestHarness.ts, loaded by main.ts when `?test=1`)
 * has installed itself. Keeping this module dependency-free means production
 * bundles never pull the harness in.
 */

import type Phaser from 'phaser';
import type { GameState } from '@/managers/GameState';
import type { GameSetup } from '@/types/gameSetup';
import type { TickEngine } from '@/systems/tick/TickEngine';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import type { NetworkAdapter } from '@/network/NetworkAdapter';
import type { MovementSystem } from '@/systems/movement/MovementSystem';
import type { DiplomacySystem } from '@/systems/diplomacy/DiplomacySystem';
import type { VisionSystem } from '@/systems/vision/VisionSystem';
import type { Pathfinder } from '@/systems/pathfinding/Pathfinder';
import type { PhaserUIBridge } from '@/ui/PhaserUIBridge';

/** Everything the harness needs from a running GameScene. */
export interface GameSceneHandles {
  scene:           Phaser.Scene;
  gameState:       GameState;
  setup:           GameSetup;
  tickEngine:      TickEngine;
  eventBus:        GameEventBus;
  networkAdapter:  NetworkAdapter;
  movementSystem:  MovementSystem;
  diplomacySystem: DiplomacySystem;
  visionSystem:    VisionSystem;
  pathfinder:      Pathfinder;
  bridge:          PhaserUIBridge;
  /** True when the local player sees the whole map (sandbox, tutorial). */
  fogDisabled:     boolean;
  /** Advance the simulation exactly one tick (TickEngine + AI), as `update()` does. */
  step:            () => void;
}

export const testHooks: {
  /** While true, GameScene.update() renders but never advances simulation time. */
  holdTime: boolean;
  /** Prefix for save-slot storage keys, so test sessions never touch a player's real saves. */
  storageNamespace: string;
  onGameSceneReady: ((handles: GameSceneHandles) => void) | null;
} = {
  holdTime: false,
  storageNamespace: '',
  onGameSceneReady: null,
};
