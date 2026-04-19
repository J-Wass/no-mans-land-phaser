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
const GREENISH = 0x204020;

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
    const panelW = 760; const panelH = 640;
    this.add.rectangle(cx, cy, panelW, panelH, PANEL_BG)
      .setStrokeStyle(1, ACCENT);

    // Title
    this.add.text(cx, cy - 286, 'PAUSED', {
      fontSize: '32px', color: '#ffffff',
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.rectangle(cx, cy - 252, 220, 1, ACCENT);

    this.buildTopButtons(cx, cy - 210);
    this.buildSaveSlots(cx, cy - 128);
    this.buildTransferButtons(cx, cy + 222);

    // Feedback line (save confirmation, errors)
    this.feedbackText = this.add.text(cx, cy + 282, '', {
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

  private buildTopButtons(cx: number, y: number): void {
    const btnW = 150;
    const btnH = 40;
    const gap = 18;
    const buttons: Array<{ label: string; x: number; action: () => void; color?: number }> = [
      { label: 'RESUME', x: cx - btnW - gap, action: () => this.resume() },
      { label: 'MAIN MENU', x: cx + btnW + gap, action: () => this.goToMenu(), color: 0x2a1010 },
    ];

    buttons.unshift({ label: 'LOCAL SLOTS', x: cx, action: () => void 0, color: 0x101828 });

    buttons.forEach((btn, index) => {
      const interactive = index !== 1;
      const bg = this.add.rectangle(btn.x, y, btnW, btnH, btn.color ?? BTN_NORM)
        .setStrokeStyle(1, ACCENT);
      if (interactive) bg.setInteractive({ useHandCursor: true });
      this.add.text(btn.x, y, btn.label, {
        fontSize: '16px', color: TEXT_LT,
        fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);
      if (interactive) {
        bg.on('pointerover', () => bg.setFillStyle(BTN_HOV));
        bg.on('pointerout', () => bg.setFillStyle(btn.color ?? BTN_NORM));
        bg.on('pointerup', btn.action);
      }
    });
  }

  private buildSaveSlots(cx: number, startY: number): void {
    const rowH = 42;
    const labelX = cx - 274;
    const metaX = cx - 160;
    const saveX = cx + 188;
    const loadX = cx + 286;
    const slots = SaveSystem.listSlots();

    this.add.text(labelX, startY - 34, 'Slot', {
      fontSize: '14px', color: '#8ea6d8', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.add.text(metaX, startY - 34, 'Saved State', {
      fontSize: '14px', color: '#8ea6d8', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    slots.forEach(({ slot, saveData }, index) => {
      const y = startY + index * rowH;
      const bgColor = index % 2 === 0 ? 0x11182a : 0x0c1321;
      this.add.rectangle(cx, y, 680, 34, bgColor, 0.92).setStrokeStyle(1, 0x22365c, 0.6);
      this.add.text(labelX, y, `Slot ${slot}`, {
        fontSize: '14px', color: '#dbe6ff', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0, 0.5);

      const meta = saveData
        ? `${new Date(saveData.savedAt).toLocaleString()}  Day ${Math.floor(saveData.currentTick / 100) + 1}  ${saveData.setup.gameMode}`
        : 'Empty';
      this.add.text(metaX, y, meta, {
        fontSize: '13px', color: saveData ? '#aebdde' : '#5d6d88', fontFamily: 'monospace',
      }).setOrigin(0, 0.5);

      this.makeSlotButton(saveX, y, 'SAVE', 74, 28, () => this.saveGame(slot), BTN_NORM);
      this.makeSlotButton(loadX, y, 'LOAD', 74, 28, () => this.loadGame(slot), saveData ? GREENISH : 0x1a1f2a, !!saveData);
    });
  }

  private buildTransferButtons(cx: number, y: number): void {
    this.makeSlotButton(cx - 110, y, 'EXPORT FILE', 150, 34, () => this.exportSave(), 0x20324a, true);
    this.makeSlotButton(cx + 110, y, 'IMPORT FILE', 150, 34, () => { void this.importSave(); }, 0x20324a, true);
    this.add.text(cx, y - 34, 'All 10 slots live in local storage. Export/import moves a save between computers.', {
      fontSize: '13px', color: '#9eb0d0', fontFamily: 'monospace',
    }).setOrigin(0.5);
  }

  private makeSlotButton(
    x: number,
    y: number,
    label: string,
    w: number,
    h: number,
    onClick: () => void,
    fill: number,
    enabled = true,
  ): void {
    const bg = this.add.rectangle(x, y, w, h, fill)
      .setStrokeStyle(1, ACCENT);
    this.add.text(x, y, label, {
      fontSize: '13px', color: enabled ? TEXT_LT : '#667088',
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    if (!enabled) return;
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(BTN_HOV));
    bg.on('pointerout', () => bg.setFillStyle(fill));
    bg.on('pointerup', onClick);
  }

  private saveGame(slot: number): void {
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

    SaveSystem.save(slot, saveData);
    this.showFeedback(`Saved to slot ${slot}.`, '#88ff88');
    this.scene.restart({
      gameState: this.gameState,
      tickEngine: this.tickEngine,
      movementSystem: this.movementSystem,
      diplomacySystem: this.diplomacySystem,
      setup: this.setup,
    });
  }

  private loadGame(slot: number): void {
    const saveData = SaveSystem.load(slot);
    if (!saveData) {
      this.showFeedback(`Slot ${slot} is empty.`, '#ff8888');
      return;
    }
    this.scene.stop('UIScene');
    this.scene.stop('PauseScene');
    this.scene.start('GameScene', { saveData, setup: saveData.setup });
  }

  private exportSave(): void {
    const slot = SaveSystem.listSlots().find(summary => summary.saveData)?.slot;
    if (!slot) {
      this.showFeedback('Save a slot before exporting.', '#ff8888');
      return;
    }
    const saveData = SaveSystem.load(slot);
    if (!saveData) {
      this.showFeedback('No save found to export.', '#ff8888');
      return;
    }

    const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `phaser-rts-save-slot-${slot}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.showFeedback(`Exported slot ${slot} to file.`, '#88ff88');
  }

  private async importSave(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const raw = await file.text();
        const parsed = JSON.parse(raw) as GameSaveData;
        if (parsed.version !== 1) throw new Error('Unsupported save version');
        const targetSlot = SaveSystem.listSlots().find(summary => !summary.saveData)?.slot ?? 10;
        SaveSystem.save(targetSlot, parsed);
        this.showFeedback(`Imported save into slot ${targetSlot}.`, '#88ff88');
        this.scene.restart({
          gameState: this.gameState,
          tickEngine: this.tickEngine,
          movementSystem: this.movementSystem,
          diplomacySystem: this.diplomacySystem,
          setup: this.setup,
        });
      } catch {
        this.showFeedback('Import failed.', '#ff8888');
      }
    };
    input.click();
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
