/**
 * WarConfirmScene - lightweight confirmation popup.
 */

import Phaser from 'phaser';
import { UI } from '@/config/uiTheme';
import {
  createBackdrop,
  createButton,
  createPanelSizer,
  createText,
  getUiMetrics,
} from '@/utils/rexUiHelpers';

export interface WarConfirmSceneData {
  nationNames: string[];
  onConfirm: () => void;
}

export class WarConfirmScene extends Phaser.Scene {
  private onConfirm!: () => void;

  constructor() {
    super({ key: 'WarConfirmScene' });
  }

  init(data: WarConfirmSceneData): void {
    this.onConfirm = data.onConfirm;
    this.data.set('nationNames', data.nationNames);
  }

  create(): void {
    const nationNames = this.data.get('nationNames') as string[];
    const metrics = getUiMetrics(this);
    const cx = metrics.width / 2;
    const cy = metrics.height / 2;
    const panelWidth = Math.min(Math.round(metrics.width * 0.86), Math.round(560 * metrics.scale));
    const panelHeight = Math.min(Math.round(metrics.height * 0.72), Math.round((250 + nationNames.length * 42) * metrics.scale));

    createBackdrop(this, 0.76);

    const panel = createPanelSizer(this, metrics, panelWidth, panelHeight, 'y', UI.PANEL);
    panel.add(createText(this, 'DECLARE WAR?', metrics, 'heading', {
      fontFamily: UI.FONT_DISPLAY,
      fontStyle: 'bold',
      color: UI.DANGER,
    }), { align: 'center' });

    panel.add(createText(this, 'Moving this unit will pull the following nations into open conflict.', metrics, 'body', {
      color: UI.DIM,
      align: 'center',
      wordWrap: { width: panelWidth - metrics.pad * 2 },
    }).setOrigin(0.5), { align: 'center' });

    const list = this.rexUI.add.sizer({
      orientation: 'y',
      space: { item: metrics.smallGap },
    });

    nationNames.forEach((name) => {
      list.add(createText(this, `- ${name}`, metrics, 'body', {
        fontFamily: UI.FONT_DATA,
        color: UI.GOLD_C,
        fontStyle: 'bold',
      }), { align: 'center' });
    });

    panel.add(list, { expand: true, align: 'center' });

    const actionRow = this.rexUI.add.sizer({
      orientation: metrics.stacked ? 'y' : 'x',
      space: { item: metrics.gap },
    });

    const buttonWidth = metrics.stacked
      ? panelWidth - metrics.pad * 2
      : Math.round((panelWidth - metrics.pad * 2 - metrics.gap) / 2);

    const cancelButton = createButton(this, metrics, 'CANCEL', () => this.scene.stop('WarConfirmScene'), {
      variant: 'secondary',
      width: buttonWidth,
    });
    const confirmButton = createButton(this, metrics, 'DECLARE WAR & MOVE', () => {
      this.scene.stop('WarConfirmScene');
      this.onConfirm();
    }, {
      variant: 'danger',
      width: buttonWidth,
    });

    actionRow.add(cancelButton.root, { proportion: metrics.stacked ? 0 : 1, expand: !metrics.stacked });
    actionRow.add(confirmButton.root, { proportion: metrics.stacked ? 0 : 1, expand: !metrics.stacked });
    panel.add(actionRow, { expand: true });

    panel.setPosition(cx, cy).layout();
    this.input.keyboard?.once('keydown-ESC', () => this.scene.stop('WarConfirmScene'));
  }
}
