/**
 * MenuScene - start screen.
 * Player picks skirmish settings, or launches a fixed single-player scenario.
 */

import Phaser from 'phaser';
import { SaveSystem } from '@/systems/save/SaveSystem';
import { DEFAULT_SCENARIO_ID, getScenarioById } from '@/config/scenarios';
import { normalizeGameSetup } from '@/types/gameSetup';
import type { Difficulty, GameSetup } from '@/types/gameSetup';

const BG        = 0x0d0d1a;
const PANEL     = 0x1a1a2e;
const ACCENT    = 0x4444aa;
const SELECTED  = 0x6655cc;
const HOVER     = 0x333366;
const TEXT_DIM  = '#666688';
const BTN_TEXT  = '#e0e0ff';

export class MenuScene extends Phaser.Scene {
  private setup: GameSetup = normalizeGameSetup({
    opponentCount: 1,
    difficulty: 'medium',
    gameMode: 'skirmish',
    scenarioId: DEFAULT_SCENARIO_ID,
  });

  private opponentBtns: Array<{ bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text; value: number }> = [];
  private diffBtns: Array<{ bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text; value: Difficulty }> = [];

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const scenario = getScenarioById(this.setup.scenarioId);

    this.add.rectangle(0, 0, W, H, BG).setOrigin(0, 0);
    this.add.rectangle(0, 0, W, 6, SELECTED).setOrigin(0, 0);

    this.add.text(cx, 140, 'NO MAN\'S LAND', {
      fontSize: '64px', color: '#ffffff',
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(cx, 210, 'LAND', {
      fontSize: '64px', color: '#8877ff',
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(cx, 275, 'Choose your skirmish, or jump into a preset scenario.', {
      fontSize: '16px', color: TEXT_DIM,
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.rectangle(cx, 315, 400, 1, ACCENT).setOrigin(0.5, 0.5);

    this.add.text(cx, 360, 'OPPONENTS', {
      fontSize: '15px', color: TEXT_DIM, fontFamily: 'monospace', letterSpacing: 3,
    }).setOrigin(0.5);

    const opponentCounts = [1, 2, 3, 4];
    const btnW = 76;
    const btnH = 44;
    const gap = 16;
    const totalOpW = opponentCounts.length * btnW + (opponentCounts.length - 1) * gap;
    const opStartX = cx - totalOpW / 2 + btnW / 2;

    opponentCounts.forEach((n, i) => {
      const bx = opStartX + i * (btnW + gap);
      const bg = this.add.rectangle(bx, 405, btnW, btnH, PANEL)
        .setStrokeStyle(1, ACCENT)
        .setInteractive({ useHandCursor: true });
      const text = this.add.text(bx, 405, String(n), {
        fontSize: '20px', color: BTN_TEXT, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);

      bg.on('pointerover', () => { if (this.setup.opponentCount !== n) bg.setFillStyle(HOVER); });
      bg.on('pointerout',  () => { if (this.setup.opponentCount !== n) bg.setFillStyle(PANEL); });
      bg.on('pointerup',   () => { this.setup.opponentCount = n; this.refreshOpponentBtns(); });

      this.opponentBtns.push({ bg, text, value: n });
    });

    this.add.text(cx, 465, 'DIFFICULTY', {
      fontSize: '15px', color: TEXT_DIM, fontFamily: 'monospace', letterSpacing: 3,
    }).setOrigin(0.5);

    const difficulties: Array<{ label: string; value: Difficulty }> = [
      { label: 'EASY', value: 'easy' },
      { label: 'MEDIUM', value: 'medium' },
      { label: 'HARD', value: 'hard' },
      { label: 'SANDBOX', value: 'sandbox' },
    ];
    const dBtnW = 105;
    const totalDW = difficulties.length * dBtnW + (difficulties.length - 1) * gap;
    const dStartX = cx - totalDW / 2 + dBtnW / 2;

    difficulties.forEach(({ label, value }, i) => {
      const bx = dStartX + i * (dBtnW + gap);
      const bg = this.add.rectangle(bx, 510, dBtnW, btnH, PANEL)
        .setStrokeStyle(1, ACCENT)
        .setInteractive({ useHandCursor: true });
      const text = this.add.text(bx, 510, label, {
        fontSize: '16px', color: BTN_TEXT, fontFamily: 'monospace',
      }).setOrigin(0.5);

      bg.on('pointerover', () => { if (this.setup.difficulty !== value) bg.setFillStyle(HOVER); });
      bg.on('pointerout',  () => { if (this.setup.difficulty !== value) bg.setFillStyle(PANEL); });
      bg.on('pointerup',   () => { this.setup.difficulty = value; this.refreshDiffBtns(); });

      this.diffBtns.push({ bg, text, value });
    });

    this.add.rectangle(cx, 555, 400, 1, ACCENT).setOrigin(0.5, 0.5);

    this.add.text(cx, 584, 'SCENARIO', {
      fontSize: '15px', color: TEXT_DIM, fontFamily: 'monospace', letterSpacing: 3,
    }).setOrigin(0.5);

    this.add.rectangle(cx, 627, 520, 68, PANEL).setStrokeStyle(1, ACCENT);
    this.add.text(cx, 607, scenario?.name ?? 'No scenario configured', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(cx, 635,
      scenario
        ? `${scenario.description}\nPlayer: ${scenario.playerNation.name} vs ${scenario.opponentNation.name}`
        : 'Add a scenario preset in src/config/scenarios.json to enable scenario mode.',
      {
        fontSize: '13px',
        color: '#9ba4d9',
        fontFamily: 'monospace',
        align: 'center',
        wordWrap: { width: 470 },
      }).setOrigin(0.5);

    this.makeActionButton(cx, 705, 320, 56, 'START SCENARIO', 0x234425, 0x2e5d35, () => {
      this.scene.start('BootScene', {
        setup: {
          ...this.setup,
          opponentCount: 1,
          gameMode: 'scenario',
          scenarioId: this.setup.scenarioId ?? DEFAULT_SCENARIO_ID,
        },
      });
    }, !scenario);

    this.makeActionButton(cx, 775, 320, 56, 'START SKIRMISH', 0x1a4422, 0x33aa55, () => {
      this.scene.start('BootScene', {
        setup: {
          ...this.setup,
          gameMode: 'skirmish',
          scenarioId: null,
        },
      });
    });

    const firstSaveSlot = SaveSystem.listSlots().find(summary => !!summary.saveData)?.slot ?? null;
    const hasSave = firstSaveSlot !== null;
    this.makeActionButton(cx, 845, 320, 48, 'LOAD GAME', hasSave ? 0x1a2244 : 0x111122,
      hasSave ? 0x3355aa : PANEL, () => {
        if (!firstSaveSlot) return;
        const saveData = SaveSystem.load(firstSaveSlot);
        if (!saveData) return;
        this.scene.start('GameScene', {
          saveData,
          setup: saveData.setup,
        });
      }, !hasSave);

    this.refreshOpponentBtns();
    this.refreshDiffBtns();

    this.add.text(W - 8, H - 8, 'v0.1', {
      fontSize: '11px', color: TEXT_DIM, fontFamily: 'monospace',
    }).setOrigin(1, 1);
  }

  private makeActionButton(
    x: number, y: number, w: number, h: number,
    label: string,
    colorNormal: number,
    colorHover: number,
    onClick: () => void,
    disabled = false,
  ): void {
    const bg = this.add.rectangle(x, y, w, h, colorNormal)
      .setStrokeStyle(1, disabled ? 0x333355 : ACCENT);
    this.add.text(x, y, label, {
      fontSize: '18px',
      color: disabled ? TEXT_DIM : BTN_TEXT,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    if (!disabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => { bg.setFillStyle(colorHover); });
      bg.on('pointerout',  () => { bg.setFillStyle(colorNormal); });
      bg.on('pointerup',   onClick);
    }
  }

  private refreshOpponentBtns(): void {
    for (const btn of this.opponentBtns) {
      const active = btn.value === this.setup.opponentCount;
      btn.bg.setFillStyle(active ? SELECTED : PANEL);
      btn.bg.setStrokeStyle(1, active ? 0x9988ff : ACCENT);
      btn.text.setColor(active ? '#ffffff' : BTN_TEXT);
    }
  }

  private refreshDiffBtns(): void {
    for (const btn of this.diffBtns) {
      const active = btn.value === this.setup.difficulty;
      btn.bg.setFillStyle(active ? SELECTED : PANEL);
      btn.bg.setStrokeStyle(1, active ? 0x9988ff : ACCENT);
      btn.text.setColor(active ? '#ffffff' : BTN_TEXT);
    }
  }
}
