/**
 * Core AI types shared across all AI components.
 */

import type { EntityId } from '@/types/common';
import type { GameState } from '@/managers/GameState';
import type { CommandProcessor } from '@/commands/CommandProcessor';
import type { MovementSystem } from '@/systems/movement/MovementSystem';
import type { Pathfinder } from '@/systems/pathfinding/Pathfinder';

export type AILevel = 'noob' | 'basic' | 'advanced';
export type GoalStatus = 'ongoing' | 'complete' | 'failed';

/** Snapshot of everything an AI goal or strategy needs to act. */
export interface AIContext {
  readonly nationId:          EntityId;
  readonly playerId:          string;
  readonly gameState:         GameState;
  readonly commandProcessor:  CommandProcessor;
  readonly movementSystem:    MovementSystem;
  readonly pathfinder:        Pathfinder;
  readonly currentTick:       number;
}

/**
 * An atomic AI objective.
 * Goals are stateless — the controller generates them fresh each evaluation cycle.
 */
export interface AIGoal {
  readonly id: string;
  /** 0–100; higher value = executed first. */
  priority(ctx: AIContext): number;
  /** False means skip this goal entirely this cycle. */
  isFeasible(ctx: AIContext): boolean;
  /** Dispatch the command(s) needed to pursue the goal. */
  execute(ctx: AIContext): GoalStatus;
}
