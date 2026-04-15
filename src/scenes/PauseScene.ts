/**
 * PauseScene — in-game overlay for save / load / return to menu.
 * Launched on top of GameScene+UIScene; pauses both while open.
 */

import Phaser from 'phaser';
import type { GameState } from '@/managers/GameState';
import type { TickEngine } from '@/systems/tick/TickEngine';
import type { MovementSystem } from '@/systems/movement/MovementSystem';
import type { DiplomacySystem } from '@/systems/diplomacy/DiplomacySystem';
import type { GameSetup, GameSaveData } from '@/types/gameSetup';
import { SaveSystem } from '@/systems/save/SaveSystem';
import { UI } from '@/config/uiTheme';

export interface PauseSceneData {
  gameState:       GameState;
  tickEngine:      TickEngine;
  movementSystem:  MovementSystem;
  diplomacySystem: DiplomacySystem;
  setup:           GameSetup;
}

const { BG: OVERLAY, PANEL: PANEL_BG, ACCENT, BTN: BTN_NORM, BTN_HOV, LT: TEXT_LT } = UI;

export class PauseScene extends Phaser.Scene {
  private gameState!:       GameState;
  private tickEngine!:      TickEngine;
  private movementSystem!:  MovementSystem;
  private diplomacySystem!: DiplomacySystem;
  private setup!:           GameSetup;
  private feedbackText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'PauseScene' });
  }

  init(data: PauseSceneData): void {
    this.gameState       = data.gameState;
    this.tickEngine      = data.tickEngine;
    this.movementSystem  = data.movementSystem;
    this.diplomacySystem = data.diplomacySystem;
    this.setup           = data.setup;
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const cy = H / 2;

    // Pause the game scenes
    this.scene.pause('GameScene');
    this.scene.pause('UIScene');

    // Semi-transparent backdrop
    this.add.rectangle(0, 0, W, H, OVERLAY, 0.65).setOrigin(0, 0)
      .setInteractive(); // block clicks falling through

    // Panel
    const panelW = 340; const panelH = 360;
    this.add.rectangle(cx, cy, panelW, panelH, PANEL_BG)
      .setStrokeStyle(1, ACCENT);

    // Title
    this.add.text(cx, cy - 140, 'PAUSED', {
      fontSize: '32px', color: '#ffffff',
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.rectangle(cx, cy - 106, 220, 1, ACCENT);

    // Buttons
    const btnW = 240; const btnH = 48; const btnGap = 14;
    const btns: Array<{ label: string; action: () => void; color?: number }> = [
      { label: 'RESUME',      action: () => this.resume() },
      { label: 'SAVE GAME',   action: () => this.saveGame() },
      { label: 'LOAD GAME',   action: () => this.loadGame(), color: SaveSystem.hasSave() ? BTN_NORM : 0x111120 },
      { label: 'MAIN MENU',   action: () => this.goToMenu(), color: 0x2a1010 },
    ];

    btns.forEach((btn, i) => {
      const by = cy - 60 + i * (btnH + btnGap);
      const bg = this.add.rectangle(cx, by, btnW, btnH, btn.color ?? BTN_NORM)
        .setStrokeStyle(1, ACCENT)
        .setInteractive({ useHandCursor: true });
      this.add.text(cx, by, btn.label, {
        fontSize: '17px', color: TEXT_LT,
        fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);

      bg.on('pointerover', () => bg.setFillStyle(BTN_HOV));
      bg.on('pointerout',  () => bg.setFillStyle(btn.color ?? BTN_NORM));
      bg.on('pointerup',   btn.action);
    });

    // Feedback line (save confirmation, errors)
    this.feedbackText = this.add.text(cx, cy + 162, '', {
      fontSize: '14px', color: '#66ee88',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // ESC also resumes
    this.input.keyboard!.once('keydown-ESC', () => this.resume());
  }

  private resume(): void {
    this.scene.resume('GameScene');
    this.scene.resume('UIScene');
    this.scene.stop('PauseScene');
  }

  private saveGame(): void {
    const movementStates = Array.from(this.movementSystem.getAllStates()).map(
      ([unitId, s]) => ({ unitId, path: [...s.path], ticksRemainingOnStep: s.ticksRemainingOnStep })
    );

    const saveData: GameSaveData = {
      version:        1,
      savedAt:        Date.now(),
      setup:          this.setup,
      currentTick:    this.tickEngine.getCurrentTick(),
      state:          this.gameState.toJSON() as Record<string, unknown>,
      movementStates,
      battleStates:   this.tickEngine.getBattleStates(),
      siegeStates:    this.tickEngine.getSiegeStates(),
      peaceCooldowns: this.diplomacySystem.toSavedState(),
    };

    SaveSystem.save(saveData);
    this.showFeedback('Game saved!', '#88ff88');
  }

  private loadGame(): void {
    const saveData = SaveSystem.load();
    if (!saveData) {
      this.showFeedback('No save found.', '#ff8888');
      return;
    }
    this.scene.stop('UIScene');
    this.scene.stop('PauseScene');
    this.scene.start('GameScene', { saveData, setup: saveData.setup });
  }

  private goToMenu(): void {
    this.scene.stop('UIScene');
    this.scene.stop('GameScene');
    this.scene.start('MenuScene');
  }

  private showFeedback(msg: string, color: string): void {
    this.feedbackText.setText(msg).setColor(color);
    this.time.delayedCall(2000, () => { this.feedbackText.setText(''); });
  }
}
