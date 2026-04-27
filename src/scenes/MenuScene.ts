/**
 * MenuScene - start screen.
 * Player picks skirmish settings, or launches a fixed single-player scenario.
 */

import Phaser from 'phaser';
import { SaveSystem } from '@/systems/save/SaveSystem';
import { DEFAULT_SCENARIO_ID, SCENARIOS, getScenarioById } from '@/config/scenarios';
import { normalizeGameSetup } from '@/types/gameSetup';
import type { Difficulty, GameSetup } from '@/types/gameSetup';
import { UI } from '@/config/uiTheme';
import {
  colorString,
  createButton,
  createPanelSizer,
  createText,
  fitPanel,
  getUiMetrics,
  type ButtonParts,
} from '@/utils/rexUiHelpers';

export class MenuScene extends Phaser.Scene {
  private setup: GameSetup = normalizeGameSetup({
    opponentCount: 1,
    difficulty: 'medium',
    gameMode: 'skirmish',
    scenarioId: DEFAULT_SCENARIO_ID,
  });
  // Standard match difficulty never shows sandbox (that's its own mode)
  private get standardDifficulty(): Difficulty {
    return this.setup.difficulty === 'sandbox' ? 'medium' : this.setup.difficulty;
  }

  private scenarioBtns: Array<{ button: ButtonParts; value: string }> = [];
  private opponentBtns: Array<{ button: ButtonParts; value: number }> = [];
  private diffBtns: Array<{ button: ButtonParts; value: Difficulty }> = [];
  private standardSummaryText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: 'MenuScene' });
  }

  init(): void {
    this.scenarioBtns = [];
    this.opponentBtns = [];
    this.diffBtns = [];
    this.standardSummaryText = null;
  }

  create(): void {
    const metrics = getUiMetrics(this);
    const scenario = getScenarioById(this.setup.scenarioId);
    const cx = metrics.width / 2;
    const cy = metrics.height / 2;

    this.add.rectangle(0, 0, metrics.width, metrics.height, UI.BG).setOrigin(0, 0);
    this.add.rectangle(0, 0, metrics.width, Math.max(6, Math.round(metrics.scale * 6)), UI.ACCENT_SOFT).setOrigin(0, 0);

    const size = fitPanel(metrics.width, metrics.height, 0.9, 1160, 920);
    const root = createPanelSizer(this, metrics, size.width, size.height, 'y', UI.PANEL);

    root.add(this.buildHeader(metrics), { expand: true });
    const scenarioDesc = scenario
      ? (() => {
          const player = scenario.nations.find(n => n.isPlayer);
          const aiNames = scenario.nations.filter(n => !n.isPlayer).map(n => n.name).join(', ');
          return `${scenario.description}\nPlayer: ${player?.name ?? '?'} vs ${aiNames}`;
        })()
      : 'Add a scenario preset in src/config/scenarios.json to enable scenario mode.';
    root.add(this.buildModeSplit(metrics, size.width, scenario?.name ?? 'No scenario configured', scenarioDesc), { expand: true });
    root.add(this.buildLoadArea(metrics, size.width), { expand: true });
    root.add(createText(this, 'v0.1', metrics, 'caption', {
      fontFamily: UI.FONT_DATA,
      color: UI.MUTED,
    }).setOrigin(1, 1), { align: 'right' });

    root.setPosition(cx, cy).layout();

    this.refreshScenarioBtns();
    this.refreshOpponentBtns();
    this.refreshDiffBtns();
  }

  private buildHeader(metrics: ReturnType<typeof getUiMetrics>): Phaser.GameObjects.GameObject {
    const header = this.rexUI.add.sizer({
      orientation: 'y',
      space: { item: metrics.smallGap },
    });

    header.add(createText(this, 'NO MAN\'S LAND', metrics, 'title', {
      fontFamily: UI.FONT_DISPLAY,
      fontStyle: 'bold',
      color: UI.WHITE,
    }).setOrigin(0.5), { align: 'center' });

    header.add(createText(this, 'Pick a preset scenario, set up a standard match, or explore freely in sandbox mode.', metrics, 'body', {
      color: UI.DIM,
      align: 'center',
      wordWrap: { width: Math.min(720, Math.round(metrics.width * 0.6)) },
    }).setOrigin(0.5), { align: 'center' });

    return header;
  }

  private buildChoiceCard<T extends number | Difficulty>(
    metrics: ReturnType<typeof getUiMetrics>,
    panelWidth: number,
    title: string,
    options: Array<{ label: string; value: T }>,
    onClick: (value: T) => void,
    sink: Array<{ button: ButtonParts; value: T }>,
  ): Phaser.GameObjects.GameObject {
    const cardWidth = metrics.stacked ? panelWidth - metrics.pad * 2 : Math.round((panelWidth - metrics.pad * 3) / 2);
    const card = createPanelSizer(this, metrics, cardWidth, Math.round(190 * metrics.scale), 'y', UI.PANEL_ALT);
    card.add(createText(this, title.toUpperCase(), metrics, 'caption', {
      color: colorString(UI.ACCENT_SOFT),
      fontFamily: UI.FONT_DATA,
      fontStyle: 'bold',
      letterSpacing: 1,
    }), { align: 'left' });

    const buttonRow = this.rexUI.add.sizer({
      orientation: metrics.stacked ? 'y' : 'x',
      space: { item: metrics.smallGap },
    });

    options.forEach(({ label, value }) => {
      const button = createButton(this, metrics, label, () => onClick(value), {
        variant: 'secondary',
        width: metrics.stacked ? cardWidth - metrics.pad * 2 : Math.round((cardWidth - metrics.pad * 2 - metrics.smallGap * (options.length - 1)) / options.length),
        height: Math.round(metrics.buttonHeight * 0.92),
      });
      buttonRow.add(button.root, { proportion: metrics.stacked ? 0 : 1, expand: !metrics.stacked });
      sink.push({ button, value });
    });

    card.add(buttonRow, { expand: true });
    card.add(createText(this, title === 'Opponents'
      ? 'Higher counts widen the front and increase late-game pressure.'
      : 'Difficulty adjusts AI aggression, expansion pace, and economy pressure.', metrics, 'caption', {
      color: UI.DIM,
      wordWrap: { width: cardWidth - metrics.pad * 2 },
    }), { expand: true });

    return card;
  }

  private buildModeSplit(
    metrics: ReturnType<typeof getUiMetrics>,
    panelWidth: number,
    title: string,
    description: string,
  ): Phaser.GameObjects.GameObject {
    const cardRow = this.rexUI.add.sizer({
      orientation: metrics.stacked ? 'y' : 'x',
      space: { item: metrics.gap },
    });
    const cardWidth = metrics.stacked
      ? panelWidth - metrics.pad * 2
      : Math.round((panelWidth - metrics.pad * 4) / 3);
    const hasScenario = Boolean(getScenarioById(this.setup.scenarioId));

    cardRow.add(this.buildScenarioSide(
      metrics,
      cardWidth,
      title,
      description,
      hasScenario,
    ), { proportion: 1, expand: true });

    cardRow.add(this.buildStandardMatchSide(
      metrics,
      cardWidth,
    ), { proportion: 1, expand: true });

    cardRow.add(this.buildSandboxSide(
      metrics,
      cardWidth,
    ), { proportion: 1, expand: true });

    return cardRow;
  }

  private buildScenarioSide(
    metrics: ReturnType<typeof getUiMetrics>,
    cardWidth: number,
    title: string,
    description: string,
    enabled: boolean,
  ): Phaser.GameObjects.GameObject {
    const cardHeight = metrics.stacked ? Math.round(340 * metrics.scale) : Math.round(430 * metrics.scale);
    const card = createPanelSizer(this, metrics, cardWidth, cardHeight, 'y', UI.PANEL_ALT);
    card.add(createText(this, 'SCENARIO PICKER', metrics, 'caption', {
      color: colorString(UI.ACCENT_SOFT),
      fontFamily: UI.FONT_DATA,
      fontStyle: 'bold',
    }), { align: 'left' });
    card.add(createText(this, title, metrics, 'heading', {
      fontFamily: UI.FONT_DISPLAY,
      fontStyle: 'bold',
      color: UI.WHITE,
      wordWrap: { width: cardWidth - metrics.pad * 2 },
    }));

    const pickerRow = this.rexUI.add.sizer({
      orientation: 'y',
      space: { item: metrics.smallGap },
    });
    pickerRow.add(createText(this, SCENARIOS.length > 1 ? 'Choose a preset scenario.' : 'Current preset scenario.', metrics, 'caption', {
      color: UI.DIM,
      wordWrap: { width: cardWidth - metrics.pad * 2 },
    }), { align: 'left' });

    const buttonRow = this.rexUI.add.sizer({
      orientation: 'y',
      space: { item: metrics.smallGap },
    });
    SCENARIOS.forEach((scenario) => {
      const button = createButton(this, metrics, scenario.name.toUpperCase(), () => {
        this.setup.scenarioId = scenario.id;
        this.scene.restart();
      }, {
        variant: 'secondary',
        width: cardWidth - metrics.pad * 2,
        height: Math.round(metrics.buttonHeight * 0.9),
      });
      this.scenarioBtns.push({ button, value: scenario.id });
      buttonRow.add(button.root, { expand: true });
    });
    pickerRow.add(buttonRow, { expand: true });
    card.add(pickerRow, { expand: true });

    card.add(createText(this, description, metrics, 'body', {
      color: UI.DIM,
      wordWrap: { width: cardWidth - metrics.pad * 2 },
      lineSpacing: Math.max(4, Math.round(metrics.scale * 4)),
    }), { proportion: 1, expand: true });

    const button = createButton(this, metrics, enabled ? 'START SCENARIO' : 'SCENARIO UNAVAILABLE', () => {
      this.scene.start('BootScene', {
        setup: {
          ...this.setup,
          opponentCount: 1,
          gameMode: 'scenario',
          scenarioId: this.setup.scenarioId ?? DEFAULT_SCENARIO_ID,
        },
      });
    }, {
      variant: 'primary',
      width: cardWidth - metrics.pad * 2,
      enabled,
    });
    card.add(button.root, { expand: true });
    return card;
  }

  private buildStandardMatchSide(
    metrics: ReturnType<typeof getUiMetrics>,
    cardWidth: number,
  ): Phaser.GameObjects.GameObject {
    const cardHeight = metrics.stacked ? Math.round(420 * metrics.scale) : Math.round(430 * metrics.scale);
    const card = createPanelSizer(this, metrics, cardWidth, cardHeight, 'y', UI.PANEL_ALT);
    card.add(createText(this, 'STANDARD MATCH', metrics, 'caption', {
      color: colorString(UI.ACCENT_SOFT),
      fontFamily: UI.FONT_DATA,
      fontStyle: 'bold',
    }), { align: 'left' });
    card.add(createText(this, 'Custom Setup', metrics, 'heading', {
      fontFamily: UI.FONT_DISPLAY,
      fontStyle: 'bold',
      color: UI.WHITE,
    }));
    card.add(createText(this, 'Tune the opponent count and difficulty, then launch a normal match.', metrics, 'caption', {
      color: UI.DIM,
      wordWrap: { width: cardWidth - metrics.pad * 2 },
    }), { expand: true });

    card.add(this.buildChoiceCard<number>(metrics, cardWidth, 'Opponents', [
      { label: '1', value: 1 },
      { label: '2', value: 2 },
      { label: '3', value: 3 },
      { label: '4', value: 4 },
    ], (value) => {
      this.setup.opponentCount = value;
      this.refreshOpponentBtns();
    }, this.opponentBtns), { expand: true });

    card.add(this.buildChoiceCard<Difficulty>(metrics, cardWidth, 'Difficulty', [
      { label: 'EASY', value: 'easy' },
      { label: 'MEDIUM', value: 'medium' },
      { label: 'HARD', value: 'hard' },
    ], (value) => {
      this.setup.difficulty = value;
      this.refreshDiffBtns();
    }, this.diffBtns), { expand: true });

    this.standardSummaryText = createText(this,
      this.getStandardMatchSummary(),
      metrics,
      'body',
      {
        color: UI.WHITE,
        fontFamily: UI.FONT_DATA,
        fontStyle: 'bold',
      });
    card.add(this.standardSummaryText, { expand: true });

    const button = createButton(this, metrics, 'START STANDARD MATCH', () => {
      this.scene.start('BootScene', {
        setup: {
          ...this.setup,
          gameMode: 'skirmish',
          difficulty: this.standardDifficulty,
          scenarioId: null,
        },
      });
    }, {
      variant: 'success',
      width: cardWidth - metrics.pad * 2,
    });
    card.add(button.root, { expand: true });
    return card;
  }

  private buildSandboxSide(
    metrics: ReturnType<typeof getUiMetrics>,
    cardWidth: number,
  ): Phaser.GameObjects.GameObject {
    const cardHeight = metrics.stacked ? Math.round(420 * metrics.scale) : Math.round(430 * metrics.scale);
    const card = createPanelSizer(this, metrics, cardWidth, cardHeight, 'y', UI.PANEL_ALT);
    card.add(createText(this, 'SANDBOX', metrics, 'caption', {
      color: '#7bd4ff',
      fontFamily: UI.FONT_DATA,
      fontStyle: 'bold',
    }), { align: 'left' });
    card.add(createText(this, 'Free Play', metrics, 'heading', {
      fontFamily: UI.FONT_DISPLAY,
      fontStyle: 'bold',
      color: UI.WHITE,
    }));
    card.add(createText(this, 'No resource costs. No fog of war. Adjust AI level and paint terrain mid-game using the left toolbar.', metrics, 'caption', {
      color: UI.DIM,
      wordWrap: { width: cardWidth - metrics.pad * 2 },
    }), { proportion: 1, expand: true });

    const button = createButton(this, metrics, 'START SANDBOX', () => {
      this.scene.start('BootScene', {
        setup: {
          ...this.setup,
          gameMode: 'sandbox',
          difficulty: 'sandbox',
          opponentCount: 1,
          scenarioId: null,
        },
      });
    }, {
      variant: 'primary',
      width: cardWidth - metrics.pad * 2,
    });
    card.add(button.root, { expand: true });
    return card;
  }

  private buildLoadArea(
    metrics: ReturnType<typeof getUiMetrics>,
    panelWidth: number,
  ): Phaser.GameObjects.GameObject {
    const firstSaveSlot = SaveSystem.listSlots().find(summary => !!summary.saveData)?.slot ?? null;
    const row = this.rexUI.add.sizer({
      orientation: metrics.stacked ? 'y' : 'x',
      space: { item: metrics.gap },
    });

    row.add(createText(this, 'Or continue from your last local save.', metrics, 'caption', {
      color: UI.DIM,
      wordWrap: { width: panelWidth - metrics.pad * 6 },
    }), { proportion: 1, expand: true, align: 'center' });

    const loadButton = createButton(this, metrics, 'LOAD SAVED GAME', () => {
      if (!firstSaveSlot) return;
      const saveData = SaveSystem.load(firstSaveSlot);
      if (!saveData) return;
      this.scene.start('GameScene', {
        saveData,
        setup: saveData.setup,
      });
    }, {
      variant: 'secondary',
      width: metrics.stacked ? panelWidth - metrics.pad * 2 : Math.round(240 * metrics.scale),
      enabled: firstSaveSlot !== null,
    });

    row.add(loadButton.root, { align: 'center' });
    return row;
  }

  private refreshOpponentBtns(): void {
    for (const btn of this.opponentBtns) {
      const active = btn.value === this.setup.opponentCount;
      btn.button.background.setFillStyle(active ? UI.BTN_ACTIVE : UI.BTN)
        .setStrokeStyle(2, active ? UI.ACCENT_SOFT : UI.ACCENT, 0.9);
      btn.button.text.setColor(active ? UI.WHITE : UI.LT);
    }
    this.standardSummaryText?.setText(this.getStandardMatchSummary());
  }

  private refreshScenarioBtns(): void {
    for (const btn of this.scenarioBtns) {
      const active = btn.value === (this.setup.scenarioId ?? DEFAULT_SCENARIO_ID);
      btn.button.background.setFillStyle(active ? UI.BTN_ACTIVE : UI.BTN)
        .setStrokeStyle(2, active ? UI.ACCENT_SOFT : UI.ACCENT, 0.9);
      btn.button.text.setColor(active ? UI.WHITE : UI.LT);
    }
  }

  private refreshDiffBtns(): void {
    for (const btn of this.diffBtns) {
      const active = btn.value === this.setup.difficulty;
      btn.button.background.setFillStyle(active ? UI.BTN_ACTIVE : UI.BTN)
        .setStrokeStyle(2, active ? UI.ACCENT_SOFT : UI.ACCENT, 0.9);
      btn.button.text.setColor(active ? UI.WHITE : UI.LT);
    }
    this.standardSummaryText?.setText(this.getStandardMatchSummary());
  }

  private getStandardMatchSummary(): string {
    return `${this.setup.opponentCount} Opponent${this.setup.opponentCount === 1 ? '' : 's'}  |  ${this.standardDifficulty.toUpperCase()}`;
  }
}
