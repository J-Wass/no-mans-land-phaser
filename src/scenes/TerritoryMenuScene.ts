/**
 * TerritoryMenuScene — building management overlay for a single territory tile.
 * Launched by GameScene when the player clicks on a friendly-owned territory.
 * Shows existing buildings and allows constructing new ones (instant, costs resources).
 */

import Phaser from 'phaser';
import type { GameState } from '@/managers/GameState';
import type { GridCoordinates } from '@/types/common';
import { TERRITORY_BUILDING_CATALOG, BUILDING_MAP_ICON } from '@/systems/territory/TerritoryBuilding';
import type { TerritoryBuildingDef } from '@/systems/territory/TerritoryBuilding';
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import type { CommandProcessor } from '@/commands/CommandProcessor';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import { UI } from '@/config/uiTheme';
import { formatCost } from '@/utils/uiHelpers';

export interface TerritoryMenuSceneData {
  position:         GridCoordinates;
  gameState:        GameState;
  commandProcessor: CommandProcessor;
  eventBus:         GameEventBus;
}

// ── Palette ───────────────────────────────────────────────────────────────────
const { BG, PANEL, HEADER, ACCENT, BTN, BTN_HOV, RED_BTN, RED_H, DIM, LT, WHITE, GOLD_C } = UI;
const GREEN = '#44cc88';

const PW = 700; const PH = 460;

export class TerritoryMenuScene extends Phaser.Scene {
  private position!:         GridCoordinates;
  private gameState!:        GameState;
  private commandProcessor!: CommandProcessor;
  private eventBus!:         GameEventBus;
  private playerId!:         string;

  private buildingRows: Array<{
    def:     TerritoryBuildingDef;
    btn:     Phaser.GameObjects.Rectangle;
    btnText: Phaser.GameObjects.Text;
    costLbl: Phaser.GameObjects.Text;
  }> = [];

  private feedbackText!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'TerritoryMenuScene' }); }

  init(data: TerritoryMenuSceneData): void {
    this.position         = data.position;
    this.gameState        = data.gameState;
    this.commandProcessor = data.commandProcessor;
    this.eventBus         = data.eventBus;
    this.buildingRows     = [];

    const localPlayer = this.gameState.getLocalPlayer();
    this.playerId     = localPlayer?.getId() ?? '';
  }

  create(): void {
    const W  = this.scale.width;
    const H  = this.scale.height;
    const cx = W / 2;
    const cy = H / 2 - 20;
    const px = cx - PW / 2;
    const py = cy - PH / 2;

    // Backdrop
    this.add.rectangle(0, 0, W, H, BG, 0.55).setOrigin(0, 0).setInteractive();

    // Panel
    this.add.rectangle(cx, cy, PW, PH, PANEL).setStrokeStyle(1, ACCENT);

    // ── Header ────────────────────────────────────────────────────────────────
    this.add.rectangle(cx, py + 22, PW, 44, HEADER).setOrigin(0.5, 0.5);

    const territory = this.gameState.getGrid().getTerritory(this.position);
    const ownerId   = territory?.getControllingNation() ?? null;
    const nation    = ownerId ? this.gameState.getNation(ownerId) : null;
    const colorHex  = nation?.getColor() ?? '#ffffff';
    const color     = parseInt(colorHex.replace('#', ''), 16);

    this.add.circle(px + 22, py + 22, 8, color);
    const terrain = territory?.getTerrainType() ?? 'UNKNOWN';
    this.add.text(px + 40, py + 22,
      `Territory (${this.position.row}, ${this.position.col}) — ${terrain}`, {
        fontSize: '16px', color: WHITE, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
    this.add.text(px + 40 + 340, py + 22, nation ? `— ${nation.getName()}` : '— Unclaimed', {
      fontSize: '13px', color: DIM, fontFamily: 'monospace',
    }).setOrigin(0, 0.5);

    // Close
    const closeBg = this.add.rectangle(px + PW - 28, py + 22, 44, 32, RED_BTN)
      .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
    this.add.text(px + PW - 28, py + 22, '✕', {
      fontSize: '16px', color: '#ff8888', fontFamily: 'monospace',
    }).setOrigin(0.5);
    closeBg.on('pointerup', () => this.close());
    closeBg.on('pointerover', () => closeBg.setFillStyle(RED_H));
    closeBg.on('pointerout',  () => closeBg.setFillStyle(RED_BTN));
    this.input.keyboard!.once('keydown-ESC', () => this.close());

    // ── Current buildings ─────────────────────────────────────────────────────
    const secY = py + 56;
    this.add.text(px + 16, secY, 'CURRENT BUILDINGS', {
      fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2,
    });

    const buildings = territory?.getBuildings() ?? [];
    const builtStr  = buildings.length === 0
      ? 'None'
      : buildings.map(b => `${BUILDING_MAP_ICON[b]} ${b}`).join('  ');
    this.add.text(px + 16, secY + 20, builtStr, {
      fontSize: '12px', color: GREEN, fontFamily: 'monospace',
    });

    // ── Available buildings list ───────────────────────────────────────────────
    const listTop = secY + 50;
    this.add.rectangle(cx, listTop, PW - 16, 1, ACCENT).setOrigin(0.5, 0);
    this.add.text(px + 16,  listTop + 8, 'BUILDING', { fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 });
    this.add.text(px + 280, listTop + 8, 'COST',     { fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 });
    this.add.text(px + 420, listTop + 8, 'REQ',      { fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 });

    const rowH      = 30;
    const rowStartY = listTop + 28;

    // Only show non-OUTPOST buildings (outpost handled by UIScene button)
    const listable = TERRITORY_BUILDING_CATALOG.filter(
      b => b.type !== TerritoryBuildingType.OUTPOST,
    );

    listable.forEach((def, i) => {
      const ry = rowStartY + i * rowH;

      const rowBg = this.add.rectangle(cx, ry + rowH / 2 - 2, PW - 8, rowH - 2, 0)
        .setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
      rowBg.on('pointerover', () => rowBg.setFillStyle(0x1c1c38));
      rowBg.on('pointerout',  () => rowBg.setFillStyle(0));

      this.add.text(px + 16, ry + rowH / 2,
        `${BUILDING_MAP_ICON[def.type]} ${def.label}`, {
          fontSize: '13px', color: LT, fontFamily: 'monospace',
        }).setOrigin(0, 0.5);

      const costLbl = this.add.text(px + 280, ry + rowH / 2,
        formatCost(def.cost as Record<string, number>), {
          fontSize: '12px', color: DIM, fontFamily: 'monospace',
        }).setOrigin(0, 0.5);

      const reqText = def.requiresTech ?? (def.requires ? def.requires : '—');
      this.add.text(px + 420, ry + rowH / 2, String(reqText), {
        fontSize: '11px', color: '#888899', fontFamily: 'monospace',
      }).setOrigin(0, 0.5);

      const btnX   = px + PW - 56;
      const btn    = this.add.rectangle(btnX, ry + rowH / 2, 76, 22, BTN)
        .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
      const btnText = this.add.text(btnX, ry + rowH / 2, 'BUILD', {
        fontSize: '12px', color: LT, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);

      btn.on('pointerover', () => { if (btn.getData('enabled')) btn.setFillStyle(BTN_HOV); });
      btn.on('pointerout',  () => { if (btn.getData('enabled')) btn.setFillStyle(BTN); });
      btn.on('pointerup',   () => { if (btn.getData('enabled')) this.build(def); });

      this.buildingRows.push({ def, btn, btnText, costLbl });
    });

    // Feedback line
    this.feedbackText = this.add.text(cx, py + PH - 18, '', {
      fontSize: '12px', color: GOLD_C, fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Subscribe to rebuild-borders event
    this.eventBus.on('territory:building-built', () => this.refreshButtons());
    this.eventBus.on('territory:claimed',        () => this.refreshButtons());

    this.refreshButtons();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private build(def: TerritoryBuildingDef): void {
    const result = this.commandProcessor.dispatch({
      type:         'BUILD_TERRITORY',
      playerId:     this.playerId,
      position:     this.position,
      building:     def.type,
      issuedAtTick: 0,
    });
    if (result.success) {
      this.showFeedback(`Built: ${def.label}`, GREEN);
    } else {
      this.showFeedback(result.reason ?? 'Cannot build', '#cc4444');
    }
    this.refreshButtons();
  }

  private refreshButtons(): void {
    const territory = this.gameState.getGrid().getTerritory(this.position);
    if (!territory) return;
    const ownerId = territory.getControllingNation();
    const nation  = ownerId ? this.gameState.getNation(ownerId) : null;
    const treasury = nation?.getTreasury();

    for (const row of this.buildingRows) {
      const alreadyBuilt   = territory.hasBuilding(row.def.type);
      const prereqMet      = !row.def.requires || territory.hasBuilding(row.def.requires);
      const techMet        = !row.def.requiresTech || (nation?.hasResearched(row.def.requiresTech) ?? false);
      const canAfford      = treasury?.hasResources(row.def.cost) ?? false;
      const owned          = ownerId !== null;
      const enabled        = owned && !alreadyBuilt && prereqMet && techMet && canAfford;

      row.btn.setData('enabled', enabled);
      row.btn.setFillStyle(enabled ? BTN : 0x111122);
      row.btn.setStrokeStyle(1, enabled ? ACCENT : 0x333355);
      row.btnText.setColor(enabled ? LT : '#444455');
      row.btnText.setText(alreadyBuilt ? 'BUILT' : 'BUILD');
      row.costLbl.setColor(canAfford ? DIM : '#884444');
    }
  }

  private showFeedback(msg: string, color: string): void {
    this.feedbackText.setText(msg).setColor(color);
    this.time.delayedCall(2500, () => this.feedbackText.setText(''));
  }

  private close(): void {
    this.scene.stop('TerritoryMenuScene');
  }
}

