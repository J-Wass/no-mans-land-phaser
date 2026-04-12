/**
 * MenuScene — start screen.
 * Player picks opponent count and difficulty, then starts or loads a game.
 */

import Phaser from 'phaser';
import type { Difficulty, GameSetup } from '@/types/gameSetup';
import { SaveSystem } from '@/systems/save/SaveSystem';

const BG        = 0x0d0d1a;
const PANEL     = 0x1a1a2e;
const ACCENT    = 0x4444aa;
const SELECTED  = 0x6655cc;
const HOVER     = 0x333366;
const TEXT_DIM  = '#666688';
const BTN_TEXT  = '#e0e0ff';

export class MenuScene extends Phaser.Scene {
  private setup: GameSetup = { opponentCount: 1, difficulty: 'medium' };

  // Button groups for visual feedback
  private opponentBtns: Array<{ bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text; value: number }> = [];
  private diffBtns: Array<{ bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text; value: Difficulty }> = [];

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;

    // Background
    this.add.rectangle(0, 0, W, H, BG).setOrigin(0, 0);

    // Top decorative bar
    this.add.rectangle(0, 0, W, 6, SELECTED).setOrigin(0, 0);

    // Title
    this.add.text(cx, 140, 'TACTICAL', {
      fontSize: '64px', color: '#ffffff',
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(cx, 210, 'CONQUEST', {
      fontSize: '64px', color: '#8877ff',
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(cx, 275, 'Turn-Based Strategy', {
      fontSize: '16px', color: TEXT_DIM,
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Divider
    this.add.rectangle(cx, 315, 400, 1, ACCENT).setOrigin(0.5, 0.5);

    // ── OPPONENTS section ──
    this.add.text(cx, 360, 'OPPONENTS', {
      fontSize: '13px', color: TEXT_DIM, fontFamily: 'monospace', letterSpacing: 3,
    }).setOrigin(0.5);

    const opponentCounts = [1, 2, 3, 4];
    const btnW = 70; const btnH = 38; const gap = 16;
    const totalOpW = opponentCounts.length * btnW + (opponentCounts.length - 1) * gap;
    const opStartX = cx - totalOpW / 2 + btnW / 2;

    opponentCounts.forEach((n, i) => {
      const bx = opStartX + i * (btnW + gap);
      const bg = this.add.rectangle(bx, 405, btnW, btnH, PANEL)
        .setStrokeStyle(1, ACCENT)
        .setInteractive({ useHandCursor: true });
      const text = this.add.text(bx, 405, String(n), {
        fontSize: '18px', color: BTN_TEXT, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);

      bg.on('pointerover', () => { if (this.setup.opponentCount !== n) bg.setFillStyle(HOVER); });
      bg.on('pointerout',  () => { if (this.setup.opponentCount !== n) bg.setFillStyle(PANEL); });
      bg.on('pointerup',   () => { this.setup.opponentCount = n; this.refreshOpponentBtns(); });

      this.opponentBtns.push({ bg, text, value: n });
    });

    // ── DIFFICULTY section ──
    this.add.text(cx, 465, 'DIFFICULTY', {
      fontSize: '13px', color: TEXT_DIM, fontFamily: 'monospace', letterSpacing: 3,
    }).setOrigin(0.5);

    const difficulties: Array<{ label: string; value: Difficulty }> = [
      { label: 'EASY', value: 'easy' },
      { label: 'MEDIUM', value: 'medium' },
      { label: 'HARD', value: 'hard' },
    ];
    const dBtnW = 110;
    const totalDW = difficulties.length * dBtnW + (difficulties.length - 1) * gap;
    const dStartX = cx - totalDW / 2 + dBtnW / 2;

    difficulties.forEach(({ label, value }, i) => {
      const bx = dStartX + i * (dBtnW + gap);
      const bg = this.add.rectangle(bx, 510, dBtnW, btnH, PANEL)
        .setStrokeStyle(1, ACCENT)
        .setInteractive({ useHandCursor: true });
      const text = this.add.text(bx, 510, label, {
        fontSize: '14px', color: BTN_TEXT, fontFamily: 'monospace',
      }).setOrigin(0.5);

      bg.on('pointerover', () => { if (this.setup.difficulty !== value) bg.setFillStyle(HOVER); });
      bg.on('pointerout',  () => { if (this.setup.difficulty !== value) bg.setFillStyle(PANEL); });
      bg.on('pointerup',   () => { this.setup.difficulty = value; this.refreshDiffBtns(); });

      this.diffBtns.push({ bg, text, value });
    });

    // Divider
    this.add.rectangle(cx, 555, 400, 1, ACCENT).setOrigin(0.5, 0.5);

    // ── START GAME button ──
    this.makeActionButton(cx, 615, 240, 52, 'START GAME', 0x226622, 0x33aa33, () => {
      this.scene.start('BootScene', { setup: this.setup });
    });

    // ── LOAD GAME button ──
    const hasSave = SaveSystem.hasSave();
    this.makeActionButton(cx, 685, 240, 52, 'LOAD GAME', hasSave ? 0x1a2244 : 0x111122,
      hasSave ? 0x3355aa : PANEL, () => {
        if (!hasSave) return;
        const saveData = SaveSystem.load();
        if (!saveData) return;
        this.scene.start('GameScene', {
          saveData,
          setup: saveData.setup,
        });
      }, !hasSave);

    // Initial highlight
    this.refreshOpponentBtns();
    this.refreshDiffBtns();

    // Version stamp
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
    const text = this.add.text(x, y, label, {
      fontSize: '16px',
      color: disabled ? TEXT_DIM : BTN_TEXT,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    if (!disabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => { bg.setFillStyle(colorHover); });
      bg.on('pointerout',  () => { bg.setFillStyle(colorNormal); });
      bg.on('pointerup',   onClick);
      void text;
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
