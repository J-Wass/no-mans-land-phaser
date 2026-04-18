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
import { MAX_WALLS_LEVEL } from '@/systems/grid/Territory';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import type { NetworkAdapter } from '@/network/NetworkAdapter';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import { UI } from '@/config/uiTheme';
import { formatCost } from '@/utils/uiHelpers';

export interface TerritoryMenuSceneData {
  position:       GridCoordinates;
  gameState:      GameState;
  networkAdapter: NetworkAdapter;
  eventBus:       GameEventBus;
}

// ── Palette ───────────────────────────────────────────────────────────────────
const { BG, PANEL, HEADER, ACCENT, BTN, BTN_HOV, RED_BTN, RED_H, DIM, LT, WHITE, GOLD_C } = UI;
const GREEN = '#44dd99';

const PW = 720; const PH = 500;
const ROW_H = 38;

export class TerritoryMenuScene extends Phaser.Scene {
  private position!:         GridCoordinates;
  private gameState!:        GameState;
  private networkAdapter!: NetworkAdapter;
  private eventBus!:         GameEventBus;
  private playerId!:         string;

  private buildingRows: Array<{
    def:        TerritoryBuildingDef;
    btn:        Phaser.GameObjects.Rectangle;
    btnText:    Phaser.GameObjects.Text;
    costLbl:    Phaser.GameObjects.Text;
    upgradeBtn: Phaser.GameObjects.Rectangle | null;
    upgradeTxt: Phaser.GameObjects.Text | null;
    levelLbl:   Phaser.GameObjects.Text | null;
  }> = [];

  private feedbackText!: Phaser.GameObjects.Text;
  private hoverHintText!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'TerritoryMenuScene' }); }

  init(data: TerritoryMenuSceneData): void {
    this.position         = data.position;
    this.gameState        = data.gameState;
    this.networkAdapter = data.networkAdapter;
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

    // Hover hint — shown when mousing over a locked row
    this.hoverHintText = this.add.text(cx, py + PH - 30, '', {
      fontSize: '12px', color: '#aa99cc', fontFamily: 'monospace', fontStyle: 'italic',
    }).setOrigin(0.5).setDepth(10);

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

    // ── Resource deposit (shown in header band) ───────────────────────────────
    const deposit = territory?.getResourceDeposit();
    if (deposit) {
      const DEPOSIT_LABEL: Record<TerritoryResourceType, string> = {
        [TerritoryResourceType.COPPER]:         '⊛ Copper deposit',
        [TerritoryResourceType.IRON]:           '⊗ Iron deposit',
        [TerritoryResourceType.FIRE_GLASS]:     '◈ Fire Glass deposit',
        [TerritoryResourceType.SILVER]:         '◇ Silver deposit',
        [TerritoryResourceType.GOLD_DEPOSIT]:   '◆ Gold deposit',
        [TerritoryResourceType.WATER_MANA]:     '~ Water Mana',
        [TerritoryResourceType.FIRE_MANA]:      '▲ Fire Mana',
        [TerritoryResourceType.LIGHTNING_MANA]: '⚡ Lightning Mana',
        [TerritoryResourceType.EARTH_MANA]:     '◉ Earth Mana',
        [TerritoryResourceType.AIR_MANA]:       '≋ Air Mana',
        [TerritoryResourceType.SHADOW_MANA]:    '◐ Shadow Mana',
      };
      this.add.text(px + PW - 160, py + HDR_H / 2, DEPOSIT_LABEL[deposit], {
        fontSize: '13px', color: '#ffe066', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
    }

    // ── Current buildings ─────────────────────────────────────────────────────
    const secY = py + HDR_H + 14;
    this.add.text(px + 18, secY, 'CURRENT BUILDINGS', {
      fontSize: '12px', color: DIM, fontFamily: 'monospace', letterSpacing: 2,
    });

    const buildings = territory?.getBuildings() ?? [];
    const builtStr  = buildings.length === 0
      ? 'None'
      : buildings.map(b => {
          const lvl = territory?.getBuildingLevel(b) ?? 1;
          const lvlTag = (b === TerritoryBuildingType.WALLS) ? ` Lvl${lvl}` : '';
          return `${BUILDING_MAP_ICON[b]} ${b.replace(/_/g, ' ')}${lvlTag}`;
        }).join('   ');
    this.add.text(px + 18, secY + 22, builtStr, {
      fontSize: '13px', color: GREEN, fontFamily: 'monospace',
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
      rowBg.on('pointerover', () => {
        rowBg.setFillStyle(0x1e2240);
        const hint = this.getLockReasonForBuilding(def);
        if (hint) this.hoverHintText.setText(hint).setVisible(true);
      });
      rowBg.on('pointerout', () => {
        rowBg.setFillStyle(0);
        this.hoverHintText.setVisible(false);
      });

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

      const btnX    = px + PW - 100;
      const btn     = this.add.rectangle(btnX, ry + ROW_H / 2, 80, 26, BTN)
        .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
      const btnText = this.add.text(btnX, ry + ROW_H / 2, 'BUILD', {
        fontSize: '13px', color: LT, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);

      btn.on('pointerover', () => { if (btn.getData('enabled')) btn.setFillStyle(BTN_HOV); });
      btn.on('pointerout',  () => { if (btn.getData('enabled')) btn.setFillStyle(BTN); });
      btn.on('pointerup',   () => { this.build(def); });

      // Upgrade button (only for upgradeable buildings like WALLS)
      let upgradeBtn: Phaser.GameObjects.Rectangle | null = null;
      let upgradeTxt: Phaser.GameObjects.Text | null = null;
      let levelLbl:   Phaser.GameObjects.Text | null = null;

      if (def.maxLevel > 1) {
        const upX = px + PW - 18;
        upgradeBtn = this.add.rectangle(upX, ry + ROW_H / 2, 70, 26, 0x1a2a1a)
          .setStrokeStyle(1, 0x33aa55).setInteractive({ useHandCursor: true });
        upgradeTxt = this.add.text(upX, ry + ROW_H / 2, '▲ UP', {
          fontSize: '12px', color: '#77ee99', fontFamily: 'monospace', fontStyle: 'bold',
        }).setOrigin(0.5);
        upgradeBtn.on('pointerover', () => { if (upgradeBtn!.getData('enabled')) upgradeBtn!.setFillStyle(0x284428); });
        upgradeBtn.on('pointerout',  () => { if (upgradeBtn!.getData('enabled')) upgradeBtn!.setFillStyle(0x1a2a1a); });
        upgradeBtn.on('pointerup',   () => { this.upgrade(def); });

        levelLbl = this.add.text(px + 560, ry + ROW_H / 2, '', {
          fontSize: '12px', color: '#aaddcc', fontFamily: 'monospace',
        }).setOrigin(0, 0.5);
      }

      this.buildingRows.push({ def, btn, btnText, costLbl, upgradeBtn, upgradeTxt, levelLbl });
    });

    this.feedbackText = this.add.text(cx, py + PH - 20, '', {
      fontSize: '14px', color: GOLD_C, fontFamily: 'monospace',
    }).setOrigin(0.5);

    const onRefresh = () => this.refreshButtons();
    this.eventBus.on('territory:building-built',    onRefresh);
    this.eventBus.on('territory:building-upgraded', onRefresh);
    this.eventBus.on('territory:claimed',           onRefresh);

    this.events.once('shutdown', () => {
      this.eventBus.off('territory:building-built',    onRefresh);
      this.eventBus.off('territory:building-upgraded', onRefresh);
      this.eventBus.off('territory:claimed',           onRefresh);
    });

    this.refreshButtons();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async upgrade(def: TerritoryBuildingDef): Promise<void> {
    const result = await this.networkAdapter.sendCommand({
      type:         'UPGRADE_TERRITORY',
      playerId:     this.playerId,
      position:     this.position,
      building:     def.type,
      issuedAtTick: 0,
    });
    if (result.success) {
      const territory = this.gameState.getGrid().getTerritory(this.position);
      const lvl = territory?.getBuildingLevel(def.type) ?? 1;
      this.showFeedback(`Upgraded: ${def.label} → Lvl ${lvl}`, '#88ffcc');
    } else {
      this.showFeedback(result.reason ?? 'Cannot upgrade', '#cc4444');
    }
    this.refreshButtons();
  }

  private async build(def: TerritoryBuildingDef): Promise<void> {
    const result = await this.networkAdapter.sendCommand({
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

      // Upgrade button state
      if (row.upgradeBtn && row.upgradeTxt && row.levelLbl) {
        const curLevel  = territory.getBuildingLevel(row.def.type);
        const maxLevel  = row.def.type === TerritoryBuildingType.WALLS ? MAX_WALLS_LEVEL : row.def.maxLevel;
        const atMax     = curLevel >= maxLevel;
        const canUpgrade = alreadyBuilt && !atMax && (treasury?.hasResources(row.def.upgradeCost) ?? false);

        row.upgradeBtn.setData('enabled', canUpgrade);
        row.upgradeBtn.setVisible(alreadyBuilt);
        row.upgradeTxt.setVisible(alreadyBuilt);
        row.upgradeBtn.setFillStyle(canUpgrade ? 0x1a2a1a : 0x0e130e);
        row.upgradeBtn.setStrokeStyle(1, canUpgrade ? 0x33aa55 : 0x223322);
        row.upgradeTxt.setColor(canUpgrade ? '#77ee99' : '#336633');
        row.upgradeTxt.setText(atMax ? 'MAX' : '▲ UP');

        if (alreadyBuilt) {
          row.levelLbl.setText(`Lvl ${curLevel}/${maxLevel}`).setVisible(true);
          row.levelLbl.setColor(atMax ? '#88ddcc' : '#aaddaa');
        } else {
          row.levelLbl.setVisible(false);
        }
      }
    }
  }

  private showFeedback(msg: string, color: string): void {
    this.feedbackText.setText(msg).setColor(color);
    this.time.delayedCall(2500, () => this.feedbackText.setText(''));
  }

  private getLockReasonForBuilding(def: TerritoryBuildingDef): string {
    const territory = this.gameState.getGrid().getTerritory(this.position);
    if (!territory) return '';
    if (territory.hasBuilding(def.type)) return '';  // "BUILT" label already makes this obvious
    const ownerId = territory.getControllingNation();
    if (!ownerId) return '⚠  territory is not owned — build an outpost first';
    const nation = this.gameState.getNation(ownerId);
    if (def.requires !== null && !territory.hasBuilding(def.requires))
      return `⚠  requires ${def.requires.replace(/_/g, ' ').toLowerCase()} on this tile first`;
    if (def.requiresTech !== null && !nation?.hasResearched(def.requiresTech))
      return `⚠  requires research: ${def.requiresTech.replace(/_/g, ' ').toLowerCase()}`;
    if (def.type === TerritoryBuildingType.MANA_MINE) {
      const deposit = territory.getResourceDeposit();
      const isMana = deposit === TerritoryResourceType.WATER_MANA   ||
                     deposit === TerritoryResourceType.FIRE_MANA     ||
                     deposit === TerritoryResourceType.LIGHTNING_MANA ||
                     deposit === TerritoryResourceType.EARTH_MANA    ||
                     deposit === TerritoryResourceType.AIR_MANA      ||
                     deposit === TerritoryResourceType.SHADOW_MANA;
      if (!isMana) return '⚠  requires a mana deposit on this tile';
    } else if (def.requiresDeposit !== null) {
      if (territory.getResourceDeposit() !== def.requiresDeposit)
        return `⚠  requires a ${def.requiresDeposit.replace(/_/g, ' ').toLowerCase()} deposit on this tile`;
    }
    if (!nation?.getTreasury().hasResources(def.cost)) return '⚠  insufficient resources';
    return '';
  }

  private close(): void {
    this.scene.stop('TerritoryMenuScene');
  }
}
