/**
 * WarConfirmScene — lightweight confirmation popup.
 *
 * Shown when a unit is ordered to cross neutral territory or attack a neutral
 * nation.  If the player confirms, the pending move is dispatched and war is
 * auto-declared when the unit enters the foreign tile.  If they cancel, the
 * order is dropped silently.
 */

import Phaser from 'phaser';
import { UI } from '@/config/uiTheme';

export interface WarConfirmSceneData {
  /** Display names of the nations that would be drawn into war. */
  nationNames: string[];
  /** Called only if the player presses "Declare War & Move". */
  onConfirm: () => void;
}

const { PANEL, HEADER, ACCENT, BTN, BTN_HOV, RED_BTN, RED_H, DIM, LT, WHITE } = UI;

export class WarConfirmScene extends Phaser.Scene {
  private onConfirm!: () => void;

  constructor() { super({ key: 'WarConfirmScene' }); }

  init(data: WarConfirmSceneData): void {
    this.onConfirm = data.onConfirm;
    // Store nation names for create()
    this.data.set('nationNames', data.nationNames);
  }

  create(): void {
    const nationNames: string[] = this.data.get('nationNames') as string[];

    const W  = this.scale.width;
    const H  = this.scale.height;
    const cx = W / 2;
    const cy = H / 2;

    const PW = 420;
    const PH = 200 + nationNames.length * 22;
    const py = cy - PH / 2;

    // Block clicks behind the panel
    this.add.rectangle(0, 0, W, H, 0x000000, 0.45).setOrigin(0, 0).setInteractive();

    this.add.rectangle(cx, cy, PW, PH, PANEL).setStrokeStyle(2, 0xdd4422);

    // ── Header ────────────────────────────────────────────────────────────────
    this.add.rectangle(cx, py + 25, PW, 50, HEADER).setOrigin(0.5);
    this.add.text(cx, py + 25, '⚔  DECLARE WAR?', {
      fontSize: '18px', color: '#ff7755', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    // ── Body ──────────────────────────────────────────────────────────────────
    let y = py + 70;
    this.add.text(cx, y, 'Moving this unit will declare war on:', {
      fontSize: '13px', color: DIM, fontFamily: 'monospace',
    }).setOrigin(0.5);
    y += 24;

    for (const name of nationNames) {
      this.add.text(cx, y, `• ${name}`, {
        fontSize: '15px', color: '#ffcc66', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);
      y += 22;
    }

    y += 12;

    // ── Buttons ───────────────────────────────────────────────────────────────
    const BTN_W = 170; const BTN_H = 38;

    // Cancel
    const cancelBg = this.add.rectangle(cx - BTN_W / 2 - 10, y + BTN_H / 2, BTN_W, BTN_H, BTN)
      .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
    this.add.text(cx - BTN_W / 2 - 10, y + BTN_H / 2, 'CANCEL', {
      fontSize: '14px', color: LT, fontFamily: 'monospace',
    }).setOrigin(0.5);
    cancelBg.on('pointerover', () => cancelBg.setFillStyle(BTN_HOV));
    cancelBg.on('pointerout',  () => cancelBg.setFillStyle(BTN));
    cancelBg.on('pointerup',   () => this.scene.stop('WarConfirmScene'));

    // Confirm (declare war)
    const confirmBg = this.add.rectangle(cx + BTN_W / 2 + 10, y + BTN_H / 2, BTN_W, BTN_H, RED_BTN)
      .setStrokeStyle(1, 0xcc2200).setInteractive({ useHandCursor: true });
    this.add.text(cx + BTN_W / 2 + 10, y + BTN_H / 2, 'DECLARE WAR & MOVE', {
      fontSize: '12px', color: '#ff9977', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    confirmBg.on('pointerover', () => confirmBg.setFillStyle(RED_H));
    confirmBg.on('pointerout',  () => confirmBg.setFillStyle(RED_BTN));
    confirmBg.on('pointerup',   () => {
      this.scene.stop('WarConfirmScene');
      this.onConfirm();
    });

    // ESC = cancel
    this.input.keyboard!.once('keydown-ESC', () => this.scene.stop('WarConfirmScene'));

    void (WHITE); // suppress unused import lint
  }
}
