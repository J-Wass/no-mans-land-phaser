/**
 * ResearchScene — tech tree overlay.
 * Shows all three branches (Science, Society, Arcane) as columns.
 * The local player's nation can queue one research at a time.
 */

import Phaser from 'phaser';
import type { GameState } from '@/managers/GameState';
import type { CommandProcessor } from '@/commands/CommandProcessor';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import { TECH_CATALOG } from '@/systems/research/TechTree';
import type { TechBranch, TechNode } from '@/systems/research/TechTree';
import { TICK_RATE } from '@/config/constants';
import { UI } from '@/config/uiTheme';

export interface ResearchSceneData {
  gameState:        GameState;
  commandProcessor: CommandProcessor;
  eventBus:         GameEventBus;
}

// ── Palette ───────────────────────────────────────────────────────────────────
const { BG, PANEL, HEADER, ACCENT, RED_BTN, RED_H, DIM, LT, WHITE } = UI;
const C_DONE   = '#44dd99';
const C_ACTIVE = '#ffcc44';
const C_AVAIL  = '#99aaff';
const C_LOCKED = '#444466';

const BRANCH_COLORS: Record<TechBranch, number> = {
  science: 0x4488ff,
  society: 0x44cc88,
  arcane:  0xaa66ff,
};

const PW = 980; const PH = 640;
const COL_W   = 310;
const COL_GAP = 10;
const NODE_H  = 50;
const NODE_GAP = 6;

export class ResearchScene extends Phaser.Scene {
  private gameState!:        GameState;
  private commandProcessor!: CommandProcessor;
  private eventBus!:         GameEventBus;
  private playerId!:         string;

  private nodeButtons: Array<{
    node:     TechNode;
    bg:       Phaser.GameObjects.Rectangle;
    label:    Phaser.GameObjects.Text;
    subLabel: Phaser.GameObjects.Text;
    btn:      Phaser.GameObjects.Rectangle | null;
    btnText:  Phaser.GameObjects.Text | null;
  }> = [];

  private currentResearchBar!:  Phaser.GameObjects.Rectangle;
  private currentResearchBg!:   Phaser.GameObjects.Rectangle;
  private currentResearchText!: Phaser.GameObjects.Text;
  private cancelBtn!:           Phaser.GameObjects.Rectangle;
  private cancelText!:          Phaser.GameObjects.Text;

  constructor() { super({ key: 'ResearchScene' }); }

  init(data: ResearchSceneData): void {
    this.gameState        = data.gameState;
    this.commandProcessor = data.commandProcessor;
    this.eventBus         = data.eventBus;
    this.nodeButtons      = [];
    const lp = this.gameState.getLocalPlayer();
    this.playerId = lp?.getId() ?? '';
  }

  create(): void {
    const W  = this.scale.width;
    const H  = this.scale.height;
    const cx = W / 2;
    const cy = H / 2 - 28;
    const px = cx - PW / 2;
    const py = cy - PH / 2;

    this.add.rectangle(0, 0, W, H, BG, 0.55).setOrigin(0, 0).setInteractive();
    this.add.rectangle(cx, cy, PW, PH, PANEL).setStrokeStyle(1, ACCENT);

    // ── Header ────────────────────────────────────────────────────────────────
    const HDR_H = 50;
    this.add.rectangle(cx, py + HDR_H / 2, PW, HDR_H, HEADER).setOrigin(0.5);
    this.add.text(px + 22, py + HDR_H / 2, '🔬 RESEARCH', {
      fontSize: '19px', color: WHITE, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    const closeBg = this.add.rectangle(px + PW - 30, py + HDR_H / 2, 48, 36, RED_BTN)
      .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
    this.add.text(px + PW - 30, py + HDR_H / 2, '✕', {
      fontSize: '18px', color: '#ff9999', fontFamily: 'monospace',
    }).setOrigin(0.5);
    closeBg.on('pointerup',   () => this.close());
    closeBg.on('pointerover', () => closeBg.setFillStyle(RED_H));
    closeBg.on('pointerout',  () => closeBg.setFillStyle(RED_BTN));
    this.input.keyboard!.once('keydown-ESC', () => this.close());

    // ── Current research bar ──────────────────────────────────────────────────
    const barY = py + HDR_H + 16;
    this.add.text(px + 22, barY, 'CURRENT RESEARCH:', {
      fontSize: '12px', color: DIM, fontFamily: 'monospace', letterSpacing: 2,
    }).setOrigin(0, 0.5);
    this.currentResearchText = this.add.text(px + 210, barY, '— Idle —', {
      fontSize: '14px', color: DIM, fontFamily: 'monospace',
    }).setOrigin(0, 0.5);

    const barX = px + 390; const barW = 340; const barH = 16;
    this.currentResearchBg = this.add.rectangle(barX, barY, barW, barH, 0x1a1e3a)
      .setOrigin(0, 0.5).setStrokeStyle(1, ACCENT);
    this.currentResearchBar = this.add.rectangle(barX, barY, 0, barH - 4, ACCENT)
      .setOrigin(0, 0.5);

    this.cancelBtn = this.add.rectangle(px + PW - 104, barY, 90, 26, RED_BTN)
      .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
    this.cancelText = this.add.text(px + PW - 104, barY, 'CANCEL', {
      fontSize: '13px', color: '#ff9999', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.cancelBtn.on('pointerup',   () => this.cancelResearch());
    this.cancelBtn.on('pointerover', () => this.cancelBtn.setFillStyle(RED_H));
    this.cancelBtn.on('pointerout',  () => this.cancelBtn.setFillStyle(RED_BTN));

    // ── Branch columns ────────────────────────────────────────────────────────
    const colTop = py + HDR_H + 46;
    const branches: TechBranch[] = ['science', 'society', 'arcane'];
    const branchLabels: Record<TechBranch, string> = {
      science: '⚗ SCIENCE',
      society: '📜 SOCIETY',
      arcane:  '🔮 ARCANE',
    };

    branches.forEach((branch, bi) => {
      const colX   = px + 10 + bi * (COL_W + COL_GAP);
      const nodes  = TECH_CATALOG.filter(t => t.branch === branch);
      const bColor = BRANCH_COLORS[branch];

      // Branch header
      this.add.rectangle(colX + COL_W / 2, colTop + 16, COL_W, 32, bColor, 0.18)
        .setOrigin(0.5).setStrokeStyle(1, bColor);
      this.add.text(colX + COL_W / 2, colTop + 16, branchLabels[branch], {
        fontSize: '13px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);

      nodes.forEach((node, ni) => {
        const ny = colTop + 36 + ni * (NODE_H + NODE_GAP);

        const bg = this.add.rectangle(colX + COL_W / 2, ny + NODE_H / 2, COL_W - 4, NODE_H, 0x181c30)
          .setOrigin(0.5).setStrokeStyle(1, 0x2a2e4a);

        const label = this.add.text(colX + 10, ny + 10, node.name, {
          fontSize: '14px', color: LT, fontFamily: 'monospace', fontStyle: 'bold',
        });
        const subLabel = this.add.text(colX + 10, ny + 29, '', {
          fontSize: '11px', color: DIM, fontFamily: 'monospace',
        });

        // RESEARCH button (right side)
        const btnX  = colX + COL_W - 48;
        const btn   = this.add.rectangle(btnX, ny + NODE_H / 2, 62, 26, 0x1e2244)
          .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
        const btnText = this.add.text(btnX, ny + NODE_H / 2, 'START', {
          fontSize: '12px', color: LT, fontFamily: 'monospace',
        }).setOrigin(0.5);

        btn.on('pointerover', () => { if (btn.getData('enabled')) btn.setFillStyle(0x2e3264); });
        btn.on('pointerout',  () => { if (btn.getData('enabled')) btn.setFillStyle(0x1e2244); });
        btn.on('pointerup',   () => { if (btn.getData('enabled')) this.startResearch(node); });

        this.nodeButtons.push({ node, bg, label, subLabel, btn, btnText });
      });
    });

    // Subscribe to research events so display stays live
    const onRefresh = () => this.refreshNodes();
    this.eventBus.on('nation:research-complete', onRefresh);
    this.eventBus.on('nation:research-started',  onRefresh);

    this.events.once('shutdown', () => {
      this.eventBus.off('nation:research-complete', onRefresh);
      this.eventBus.off('nation:research-started',  onRefresh);
    });

    this.refreshNodes();
  }

  override update(): void {
    this.refreshCurrentBar();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getNation() {
    const lp = this.gameState.getLocalPlayer();
    return lp ? this.gameState.getNation(lp.getControlledNationId()) : null;
  }

  private startResearch(node: TechNode): void {
    this.commandProcessor.dispatch({
      type: 'START_RESEARCH', playerId: this.playerId,
      techId: node.id, issuedAtTick: 0,
    });
    this.refreshNodes();
  }

  private cancelResearch(): void {
    this.commandProcessor.dispatch({
      type: 'CANCEL_RESEARCH', playerId: this.playerId, issuedAtTick: 0,
    });
    this.refreshNodes();
  }

  private refreshCurrentBar(): void {
    const nation = this.getNation();
    if (!nation) return;
    const cr = nation.getCurrentResearch();
    if (!cr) {
      this.currentResearchText.setText('— Idle —').setColor(DIM);
      this.currentResearchBar.setDisplaySize(0, this.currentResearchBar.displayHeight);
      this.cancelBtn.setVisible(false);
      this.cancelText.setVisible(false);
      return;
    }
    const secs = (cr.ticksRemaining / TICK_RATE).toFixed(1);
    this.currentResearchText
      .setText(`${cr.techId.replace(/_/g, ' ')}  (${secs}s)`)
      .setColor(C_ACTIVE);
    const pct  = (cr.ticksTotal - cr.ticksRemaining) / cr.ticksTotal;
    const barW = Math.round((this.currentResearchBg.displayWidth - 4) * pct);
    this.currentResearchBar.setDisplaySize(Math.max(0, barW), this.currentResearchBar.displayHeight);
    this.cancelBtn.setVisible(true);
    this.cancelText.setVisible(true);
  }

  private refreshNodes(): void {
    const nation = this.getNation();
    const busy   = !!nation?.getCurrentResearch();

    for (const row of this.nodeButtons) {
      const researched = nation?.hasResearched(row.node.id) ?? false;
      const isActive   = nation?.getCurrentResearch()?.techId === row.node.id;
      const canStart   = !busy && !researched && (nation?.canResearch(row.node.id) ?? false);

      if (researched) {
        row.bg.setFillStyle(0x142414).setStrokeStyle(2, 0x44cc88);
        row.label.setColor(C_DONE);
      } else if (isActive) {
        row.bg.setFillStyle(0x1e1a10).setStrokeStyle(2, 0xffcc44);
        row.label.setColor(C_ACTIVE);
      } else if (canStart) {
        row.bg.setFillStyle(0x181c30).setStrokeStyle(1, ACCENT);
        row.label.setColor(C_AVAIL);
      } else {
        row.bg.setFillStyle(0x181c30).setStrokeStyle(1, 0x222234);
        row.label.setColor(C_LOCKED);
      }

      if (researched) {
        row.subLabel.setText('✓ Researched').setColor(C_DONE);
      } else if (isActive) {
        row.subLabel.setText('● Researching…').setColor(C_ACTIVE);
      } else if (row.node.requires.length > 0) {
        const reqStr = row.node.requires.map(r => r.replace(/_/g, ' ')).join(', ');
        const allMet = row.node.requires.every(r => nation?.hasResearched(r));
        row.subLabel.setText(`Req: ${reqStr}`).setColor(allMet ? '#7a7a9a' : '#774444');
      } else {
        const secs = (row.node.ticks / TICK_RATE).toFixed(0);
        row.subLabel.setText(`${secs}s`).setColor(DIM);
      }

      if (row.btn && row.btnText) {
        if (researched) {
          row.btn.setData('enabled', false).setFillStyle(0x102210).setStrokeStyle(1, 0x224422);
          row.btnText.setText('DONE').setColor(C_DONE);
        } else if (isActive) {
          row.btn.setData('enabled', false).setFillStyle(0x1e1800).setStrokeStyle(1, 0x554400);
          row.btnText.setText('…').setColor(C_ACTIVE);
        } else if (canStart) {
          row.btn.setData('enabled', true).setFillStyle(0x1e2244).setStrokeStyle(1, ACCENT);
          row.btnText.setText('START').setColor(LT);
        } else {
          row.btn.setData('enabled', false).setFillStyle(0x0e1020).setStrokeStyle(1, 0x2a2a44);
          row.btnText.setText('LOCKED').setColor(C_LOCKED);
        }
      }
    }

    this.refreshCurrentBar();
  }

  private close(): void {
    this.scene.stop('ResearchScene');
  }
}
