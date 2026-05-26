/**
 * AISystem — master coordinator for all AI-controlled nations.
 *
 * Created by GameScene and ticked alongside TickEngine.
 * Assigns a profile (difficulty-based) to each AI nation and dispatches
 * one AIController per nation per tick.
 */

import type { GameState } from '@/managers/GameState';
import type { CommandProcessor } from '@/commands/CommandProcessor';
import type { MovementSystem } from '@/systems/movement/MovementSystem';
import type { Pathfinder } from '@/systems/pathfinding/Pathfinder';
import type { Difficulty } from '@/types/gameSetup';
import { AIController } from './AIController';
import type { AIContext } from './AITypes';
import { NoobProfile } from './profiles/NoobProfile';
import { BasicProfile } from './profiles/BasicProfile';
import { AdvancedProfile } from './profiles/AdvancedProfile';
import type { AIProfile } from './profiles/AIProfile';

export class AISystem {
  private controllers: Map<string, AIController> = new Map(); // nationId → controller

  constructor(
    private readonly gameState:        GameState,
    private readonly commandProcessor: CommandProcessor,
    private readonly movementSystem:   MovementSystem,
    private readonly pathfinder:       Pathfinder,
    private difficulty:                Difficulty,
  ) {
    this.initControllers();
  }

  public setDifficulty(difficulty: Difficulty): void {
    // Idempotent: rebuilding controllers resets each AdvancedProfile's strategy and
    // every controller's evaluation phase, so skip when nothing actually changed.
    if (difficulty === this.difficulty) return;
    this.difficulty = difficulty;
    this.controllers.clear();
    this.initControllers();
  }

  public tick(currentTick: number): void {
    for (const [nationId, controller] of this.controllers) {
      const nation = this.gameState.getNation(nationId);
      if (!nation?.isAIControlled()) continue;

      const playerId = nation.getControlledBy();
      if (!playerId) continue;

      const ctx: AIContext = {
        nationId,
        playerId,
        gameState:        this.gameState,
        commandProcessor: this.commandProcessor,
        movementSystem:   this.movementSystem,
        pathfinder:       this.pathfinder,
        currentTick,
      };

      // Isolate each nation: a thrown goal must not abort the AI for the rest.
      try {
        controller.tick(ctx);
      } catch (err) {
        console.error(`[AISystem] controller for ${nationId} threw`, err);
      }
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private initControllers(): void {
    if (this.difficulty === 'sandbox') return; // AI is entirely passive in sandbox mode
    let aiIndex = 0;
    for (const nation of this.gameState.getAllNations()) {
      if (!nation.isAIControlled()) continue;
      const profile = this.createProfile();
      // Stagger evaluations: spread nations across the profile's interval so they
      // don't all run their heavy goal scans on the same tick.
      const phaseOffset = aiIndex * 7;
      this.controllers.set(nation.getId(), new AIController(profile, phaseOffset));
      aiIndex++;
    }
  }

  private createProfile(): AIProfile {
    switch (this.difficulty) {
      case 'easy':   return new NoobProfile();
      case 'medium': return new BasicProfile();
      case 'hard':   return new AdvancedProfile();
      default:       return new BasicProfile();
    }
  }
}
