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
const GREEN = '#44dd99';

const PW = 720; const PH = 500;
const ROW_H = 38;

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
    const cy = H / 2 - 28;
    const px = cx - PW / 2;
    const py = cy - PH / 2;

    this.add.rectangle(0, 0, W, H, BG, 0.5).setOrigin(0, 0).setInteractive();
    this.add.rectangle(cx, cy, PW, PH, PANEL).setStrokeStyle(1, ACCENT);

    // ── Header ────────────────────────────────────────────────────────────────
    const HDR_H = 50;
    this.add.rectangle(cx, py + HDR_H / 2, PW, HDR_H, HEADER).setOrigin(0.5, 0.5);

    const territory = this.gameState.getGrid().getTerritory(this.position);
    const ownerId   = territory?.getControllingNation() ?? null;
    const nation    = ownerId ? this.gameState.getNation(ownerId) : null;
    const colorHex  = nation?.getColor() ?? '#ffffff';
    const color     = parseInt(colorHex.replace('#', ''), 16);

    this.add.circle(px + 26, py + HDR_H / 2, 9, color);
    const terrain = territory?.getTerrainType() ?? 'UNKNOWN';
    this.add.text(px + 46, py + HDR_H / 2,
      `Territory (${this.position.row}, ${this.position.col}) — ${terrain}`, {
        fontSize: '17px', color: WHITE, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
    this.add.text(px + 46 + 380, py + HDR_H / 2,
      nation ? `— ${nation.getName()}` : '— Unclaimed', {
        fontSize: '14px', color: DIM, fontFamily: 'monospace',
      }).setOrigin(0, 0.5);

    // Close
    const closeBg = this.add.rectangle(px + PW - 30, py + HDR_H / 2, 48, 36, RED_BTN)
      .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
    this.add.text(px + PW - 30, py + HDR_H / 2, '✕', {
      fontSize: '18px', color: '#ff9999', fontFamily: 'monospace',
    }).setOrigin(0.5);
    closeBg.on('pointerup',   () => this.close());
    closeBg.on('pointerover', () => closeBg.setFillStyle(RED_H));
    closeBg.on('pointerout',  () => closeBg.setFillStyle(RED_BTN));
    this.input.keyboard!.once('keydown-ESC', () => this.close());

    // ── Current buildings ─────────────────────────────────────────────────────
    const secY = py + HDR_H + 14;
    this.add.text(px + 18, secY, 'CURRENT BUILDINGS', {
      fontSize: '12px', color: DIM, fontFamily: 'monospace', letterSpacing: 2,
    });

    const buildings = territory?.getBuildings() ?? [];
    const builtStr  = buildings.length === 0
      ? 'None'
      : buildings.map(b => `${BUILDING_MAP_ICON[b]} ${b}`).join('  ');
    this.add.text(px + 18, secY + 22, builtStr, {
      fontSize: '14px', color: GREEN, fontFamily: 'monospace',
    });

    // ── Available buildings list ───────────────────────────────────────────────
    const listTop = secY + 58;
    this.add.rectangle(cx, listTop, PW - 16, 1, ACCENT).setOrigin(0.5, 0);
    this.add.text(px + 18,  listTop + 10, 'BUILDING', { fontSize: '12px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 });
    this.add.text(px + 290, listTop + 10, 'COST',     { fontSize: '12px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 });
    this.add.text(px + 440, listTop + 10, 'REQ',      { fontSize: '12px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 });

    const rowStartY = listTop + 32;

    const listable = TERRITORY_BUILDING_CATALOG.filter(
      b => b.type !== TerritoryBuildingType.OUTPOST,
    );

    listable.forEach((def, i) => {
      const ry = rowStartY + i * ROW_H;

      const rowBg = this.add.rectangle(cx, ry + ROW_H / 2 - 2, PW - 10, ROW_H - 2, 0)
        .setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
      rowBg.on('pointerover', () => rowBg.setFillStyle(0x1e2240));
      rowBg.on('pointerout',  () => rowBg.setFillStyle(0));

      this.add.text(px + 18, ry + ROW_H / 2,
        `${BUILDING_MAP_ICON[def.type]} ${def.label}`, {
          fontSize: '15px', color: LT, fontFamily: 'monospace',
        }).setOrigin(0, 0.5);

      const costLbl = this.add.text(px + 290, ry + ROW_H / 2,
        formatCost(def.cost as Record<string, number>), {
          fontSize: '14px', color: DIM, fontFamily: 'monospace',
        }).setOrigin(0, 0.5);

      const reqText = def.requiresTech ?? (def.requires ? def.requires : '—');
      this.add.text(px + 440, ry + ROW_H / 2, String(reqText), {
        fontSize: '12px', color: '#8a8aaa', fontFamily: 'monospace',
      }).setOrigin(0, 0.5);

      const btnX    = px + PW - 58;
      const btn     = this.add.rectangle(btnX, ry + ROW_H / 2, 84, 26, BTN)
        .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
      const btnText = this.add.text(btnX, ry + ROW_H / 2, 'BUILD', {
        fontSize: '13px', color: LT, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);

      btn.on('pointerover', () => { if (btn.getData('enabled')) btn.setFillStyle(BTN_HOV); });
      btn.on('pointerout',  () => { if (btn.getData('enabled')) btn.setFillStyle(BTN); });
      btn.on('pointerup',   () => { if (btn.getData('enabled')) this.build(def); });

      this.buildingRows.push({ def, btn, btnText, costLbl });
    });

    this.feedbackText = this.add.text(cx, py + PH - 20, '', {
      fontSize: '14px', color: GOLD_C, fontFamily: 'monospace',
    }).setOrigin(0.5);

    const onRefresh = () => this.refreshButtons();
    this.eventBus.on('territory:building-built', onRefresh);
    this.eventBus.on('territory:claimed',        onRefresh);

    this.events.once('shutdown', () => {
      this.eventBus.off('territory:building-built', onRefresh);
      this.eventBus.off('territory:claimed',        onRefresh);
    });

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
    const ownerId  = territory.getControllingNation();
    const nation   = ownerId ? this.gameState.getNation(ownerId) : null;
    const treasury = nation?.getTreasury();

    for (const row of this.buildingRows) {
      const alreadyBuilt = territory.hasBuilding(row.def.type);
      const prereqMet    = !row.def.requires || territory.hasBuilding(row.def.requires);
      const techMet      = !row.def.requiresTech || (nation?.hasResearched(row.def.requiresTech) ?? false);
      const canAfford    = treasury?.hasResources(row.def.cost) ?? false;
      const owned        = ownerId !== null;
      const enabled      = owned && !alreadyBuilt && prereqMet && techMet && canAfford;

      row.btn.setData('enabled', enabled);
      row.btn.setFillStyle(enabled ? BTN : 0x0e101e);
      row.btn.setStrokeStyle(1, enabled ? ACCENT : 0x2a2a44);
      row.btnText.setColor(enabled ? LT : '#444466');
      row.btnText.setText(alreadyBuilt ? 'BUILT' : 'BUILD');
      row.costLbl.setColor(canAfford ? DIM : '#995555');
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
