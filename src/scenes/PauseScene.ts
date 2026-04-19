/**
 * PauseScene - in-game overlay for save / load / return to menu.
 */

import Phaser from 'phaser';
import type { GameState } from '@/managers/GameState';
import type { TickEngine } from '@/systems/tick/TickEngine';
import type { MovementSystem } from '@/systems/movement/MovementSystem';
import type { DiplomacySystem } from '@/systems/diplomacy/DiplomacySystem';
import type { GameSetup, GameSaveData } from '@/types/gameSetup';
import { SaveSystem } from '@/systems/save/SaveSystem';
import { UI } from '@/config/uiTheme';
import {
  colorString,
  createBackdrop,
  createButton,
  createPanelSizer,
  createScrollablePanel,
  createText,
  fitPanel,
  getUiMetrics,
} from '@/utils/rexUiHelpers';

export interface PauseSceneData {
  gameState: GameState;
  tickEngine: TickEngine;
  movementSystem: MovementSystem;
  diplomacySystem: DiplomacySystem;
  setup: GameSetup;
}

export class PauseScene extends Phaser.Scene {
  private gameState!: GameState;
  private tickEngine!: TickEngine;
  private movementSystem!: MovementSystem;
  private diplomacySystem!: DiplomacySystem;
  private setup!: GameSetup;
  private feedbackText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'PauseScene' });
  }

  init(data: PauseSceneData): void {
    this.gameState = data.gameState;
    this.tickEngine = data.tickEngine;
    this.movementSystem = data.movementSystem;
    this.diplomacySystem = data.diplomacySystem;
    this.setup = data.setup;
  }

  create(): void {
    const metrics = getUiMetrics(this);
    const cx = metrics.width / 2;
    const cy = metrics.height / 2;
    const size = fitPanel(metrics.width, metrics.height, 0.92, 1180, 980);

    this.scene.pause('GameScene');
    this.scene.pause('UIScene');

    createBackdrop(this, 0.78);

    const root = createPanelSizer(this, metrics, size.width, size.height, 'y', UI.PANEL);
    root.add(this.buildHeader(metrics, size.width), { expand: true });
    root.add(this.buildTopActions(metrics, size.width), { expand: true });
    root.add(this.buildSlotsSection(metrics, size.width, size.height), { proportion: 1, expand: true });
    root.add(this.buildTransferRow(metrics, size.width), { expand: true });
    this.feedbackText = createText(this, '', metrics, 'body', {
      color: UI.SUCCESS,
      align: 'center',
      wordWrap: { width: size.width - metrics.pad * 2 },
    }).setOrigin(0.5);
    root.add(this.feedbackText, { align: 'center' });
    root.setPosition(cx, cy).layout();

    this.input.keyboard?.once('keydown-ESC', () => this.resume());
  }

  private buildHeader(metrics: ReturnType<typeof getUiMetrics>, panelWidth: number): Phaser.GameObjects.GameObject {
    const header = this.rexUI.add.sizer({
      orientation: 'x',
      width: panelWidth - metrics.pad * 2,
      space: { item: metrics.gap },
    });
    const left = this.rexUI.add.sizer({
      orientation: 'y',
      space: { item: metrics.smallGap },
    });
    left.add(createText(this, 'Paused', metrics, 'heading', {
      fontFamily: UI.FONT_DISPLAY,
      fontStyle: 'bold',
      color: UI.WHITE,
    }));
    left.add(createText(this, 'Manage saves, import or export files, or jump back to the main menu.', metrics, 'body', {
      color: UI.DIM,
      wordWrap: { width: panelWidth - metrics.pad * 6 },
    }));
    header.add(left, { proportion: 1, expand: true });
    const resumeButton = createButton(this, metrics, 'RESUME', () => this.resume(), {
      variant: 'primary',
      width: Math.round(140 * metrics.scale),
    });
    header.add(resumeButton.root, { align: 'center' });
    return header;
  }

  private buildTopActions(metrics: ReturnType<typeof getUiMetrics>, panelWidth: number): Phaser.GameObjects.GameObject {
    const row = this.rexUI.add.sizer({
      orientation: metrics.stacked ? 'y' : 'x',
      width: panelWidth - metrics.pad * 2,
      space: { item: metrics.gap },
    });
    const buttonWidth = metrics.stacked
      ? panelWidth - metrics.pad * 2
      : Math.round((panelWidth - metrics.pad * 2 - metrics.gap) / 2);

    const localButton = createButton(this, metrics, 'LOCAL SLOTS', () => void 0, {
      variant: 'ghost',
      width: buttonWidth,
      enabled: false,
    });
    localButton.text.setColor(colorString(UI.ACCENT_SOFT));
    const menuButton = createButton(this, metrics, 'MAIN MENU', () => this.goToMenu(), {
      variant: 'danger',
      width: buttonWidth,
    });

    row.add(localButton.root, { proportion: metrics.stacked ? 0 : 1, expand: !metrics.stacked });
    row.add(menuButton.root, { proportion: metrics.stacked ? 0 : 1, expand: !metrics.stacked });
    return row;
  }

  private buildSlotsSection(
    metrics: ReturnType<typeof getUiMetrics>,
    panelWidth: number,
    panelHeight: number,
  ): Phaser.GameObjects.GameObject {
    const wrapper = createPanelSizer(this, metrics, panelWidth - metrics.pad * 2, Math.round(panelHeight * 0.56), 'y', UI.PANEL_ALT);
    wrapper.add(createText(this, 'Save Slots', metrics, 'caption', {
      fontFamily: UI.FONT_DATA,
      fontStyle: 'bold',
      color: colorString(UI.ACCENT_SOFT),
    }));
    wrapper.add(createText(this, 'All 10 slots live locally in this browser profile.', metrics, 'caption', {
      color: UI.DIM,
    }));

    const content = this.rexUI.add.sizer({
      orientation: 'y',
      width: panelWidth - metrics.pad * 4,
      space: { item: metrics.smallGap },
    });

    SaveSystem.listSlots().forEach(({ slot, saveData }) => {
      content.add(this.buildSlotRow(metrics, panelWidth - metrics.pad * 5, slot, saveData), { expand: true });
    });

    const scrollPanel = createScrollablePanel(
      this,
      metrics,
      panelWidth - metrics.pad * 2,
      Math.round(panelHeight * 0.42),
      content,
      UI.PANEL,
    );
    wrapper.add(scrollPanel, { proportion: 1, expand: true });
    return wrapper;
  }

  private buildSlotRow(
    metrics: ReturnType<typeof getUiMetrics>,
    width: number,
    slot: number,
    saveData: GameSaveData | null,
  ): Phaser.GameObjects.GameObject {
    const row = this.rexUI.add.sizer({
      width,
      height: Math.round((metrics.stacked ? 190 : 96) * metrics.scale),
      orientation: metrics.stacked ? 'y' : 'x',
      space: {
        left: metrics.smallGap,
        right: metrics.smallGap,
        top: metrics.smallGap,
        bottom: metrics.smallGap,
        item: metrics.gap,
      },
    });
    row.addBackground(this.rexUI.add.roundRectangle(0, 0, width, Math.round((metrics.stacked ? 190 : 96) * metrics.scale), metrics.radius, UI.PANEL, 1)
      .setStrokeStyle(2, 0x2f4b74, 0.85));

    const info = this.rexUI.add.sizer({
      orientation: 'y',
      width: metrics.stacked ? width - metrics.pad * 2 : Math.round(width * 0.6),
      space: { item: metrics.smallGap },
    });
    info.add(createText(this, `Slot ${slot}`, metrics, 'body', {
      fontFamily: UI.FONT_DATA,
      fontStyle: 'bold',
      color: UI.WHITE,
    }));
    info.add(createText(this, saveData
      ? `${new Date(saveData.savedAt).toLocaleString()}  |  Day ${Math.floor(saveData.currentTick / 100) + 1}  |  ${saveData.setup.gameMode}`
      : 'Empty slot', metrics, 'caption', {
      color: saveData ? UI.DIM : UI.MUTED,
      wordWrap: { width: width - metrics.pad * 4 },
    }));

    const actions = this.rexUI.add.sizer({
      orientation: metrics.stacked ? 'x' : 'x',
      space: { item: metrics.smallGap },
    });
    const buttonWidth = metrics.stacked
      ? Math.round((width - metrics.pad * 2 - metrics.smallGap) / 2)
      : Math.round(118 * metrics.scale);
    const saveButton = createButton(this, metrics, 'SAVE', () => this.saveGame(slot), {
      variant: 'primary',
      width: buttonWidth,
      height: Math.round(metrics.buttonHeight * 0.82),
    });
    const loadButton = createButton(this, metrics, 'LOAD', () => this.loadGame(slot), {
      variant: saveData ? 'success' : 'secondary',
      width: buttonWidth,
      height: Math.round(metrics.buttonHeight * 0.82),
      enabled: !!saveData,
    });
    actions.add(saveButton.root);
    actions.add(loadButton.root);

    row.add(info, { proportion: 1, expand: true });
    row.add(actions, { align: 'center' });
    return row;
  }

  private buildTransferRow(metrics: ReturnType<typeof getUiMetrics>, panelWidth: number): Phaser.GameObjects.GameObject {
    const wrapper = this.rexUI.add.sizer({
      orientation: 'y',
      width: panelWidth - metrics.pad * 2,
      space: { item: metrics.smallGap },
    });
    wrapper.add(createText(this, 'Export or import a save file to move progress between computers.', metrics, 'caption', {
      color: UI.DIM,
      align: 'center',
      wordWrap: { width: panelWidth - metrics.pad * 4 },
    }).setOrigin(0.5), { align: 'center' });

    const row = this.rexUI.add.sizer({
      orientation: metrics.stacked ? 'y' : 'x',
      space: { item: metrics.gap },
    });
    const buttonWidth = metrics.stacked
      ? panelWidth - metrics.pad * 2
      : Math.round((panelWidth - metrics.pad * 2 - metrics.gap) / 2);
    const exportButton = createButton(this, metrics, 'EXPORT FILE', () => this.exportSave(), {
      variant: 'secondary',
      width: buttonWidth,
    });
    const importButton = createButton(this, metrics, 'IMPORT FILE', () => { void this.importSave(); }, {
      variant: 'secondary',
      width: buttonWidth,
    });
    row.add(exportButton.root, { proportion: metrics.stacked ? 0 : 1, expand: !metrics.stacked });
    row.add(importButton.root, { proportion: metrics.stacked ? 0 : 1, expand: !metrics.stacked });
    wrapper.add(row, { expand: true });
    return wrapper;
  }

  private resume(): void {
    this.scene.resume('GameScene');
    this.scene.resume('UIScene');
    this.scene.stop('PauseScene');
  }

  private saveGame(slot: number): void {
    const movementStates = Array.from(this.movementSystem.getAllStates()).map(
      ([unitId, state]) => ({ unitId, path: [...state.path], ticksRemainingOnStep: state.ticksRemainingOnStep }),
    );

    const saveData: GameSaveData = {
      version: 1,
      savedAt: Date.now(),
      setup: this.setup,
      currentTick: this.tickEngine.getCurrentTick(),
      state: this.gameState.toJSON() as Record<string, unknown>,
      movementStates,
      battleStates: this.tickEngine.getBattleStates(),
      siegeStates: this.tickEngine.getSiegeStates(),
      peaceCooldowns: this.diplomacySystem.toSavedState(),
    };

    SaveSystem.save(slot, saveData);
    this.showFeedback(`Saved to slot ${slot}.`, UI.SUCCESS);
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
      this.showFeedback(`Slot ${slot} is empty.`, UI.DANGER);
      return;
    }
    this.scene.stop('UIScene');
    this.scene.stop('PauseScene');
    this.scene.start('GameScene', { saveData, setup: saveData.setup });
  }

  private exportSave(): void {
    const slot = SaveSystem.listSlots().find(summary => summary.saveData)?.slot;
    if (!slot) {
      this.showFeedback('Save a slot before exporting.', UI.DANGER);
      return;
    }
    const saveData = SaveSystem.load(slot);
    if (!saveData) {
      this.showFeedback('No save found to export.', UI.DANGER);
      return;
    }

    const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `phaser-rts-save-slot-${slot}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.showFeedback(`Exported slot ${slot}.`, UI.SUCCESS);
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
        this.showFeedback(`Imported save into slot ${targetSlot}.`, UI.SUCCESS);
        this.scene.restart({
          gameState: this.gameState,
          tickEngine: this.tickEngine,
          movementSystem: this.movementSystem,
          diplomacySystem: this.diplomacySystem,
          setup: this.setup,
        });
      } catch {
        this.showFeedback('Import failed.', UI.DANGER);
      }
    };
    input.click();
  }

  private goToMenu(): void {
    this.scene.stop('UIScene');
    this.scene.stop('GameScene');
    this.scene.start('MenuScene');
  }

  private showFeedback(message: string, color: string): void {
    this.feedbackText.setText(message).setColor(color);
    this.time.delayedCall(2200, () => this.feedbackText.setText(''));
  }
}
