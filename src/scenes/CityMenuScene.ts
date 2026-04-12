/**
 * CityMenuScene — production management overlay for a single city.
 * Tabs: UNITS (train units) | BUILDINGS (construct city buildings).
 * Launched on top of GameScene (game keeps ticking while open).
 */

import Phaser from 'phaser';
import type { City } from '@/entities/cities/City';
import type { GameState } from '@/managers/GameState';
import type { CommandProcessor } from '@/commands/CommandProcessor';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import { PRODUCTION_CATALOG } from '@/systems/production/ProductionCatalog';
import type { CatalogEntry } from '@/systems/production/ProductionCatalog';
import type { UnitOrder } from '@/systems/production/ProductionOrder';
import { CITY_BUILDING_CATALOG } from '@/systems/territory/CityBuilding';
import type { CityBuildingDef } from '@/systems/territory/CityBuilding';
import { ResourceType } from '@/systems/resources/ResourceType';
import { TICK_RATE } from '@/config/constants';
import { UI } from '@/config/uiTheme';
import { formatCost } from '@/utils/uiHelpers';

export interface CityMenuSceneData {
  city:             City;
  gameState:        GameState;
  commandProcessor: CommandProcessor;
  eventBus:         GameEventBus;
}

// ── Resource emoji map ────────────────────────────────────────────────────────
export const RESOURCE_EMOJI: Record<ResourceType, string> = {
  [ResourceType.FOOD]:         '🍎',
  [ResourceType.RAW_MATERIAL]: '🪨',
  [ResourceType.GOLD]:         '🪙',
  [ResourceType.RESEARCH]:     '🔍',
  [ResourceType.HAPPINESS]:    '🙂',
  [ResourceType.CORRUPTION]:   '⚠️',
};

// ── Palette ───────────────────────────────────────────────────────────────────
const { BG, PANEL, HEADER, ACCENT, BTN, BTN_HOV, RED_BTN, RED_H, DIM, LT, WHITE, GOLD_C } = UI;
const TAB_ACT = 0x2a2a55;

const PW = 820; const PH = 560;

type Tab = 'units' | 'buildings';

export class CityMenuScene extends Phaser.Scene {
  private city!:             City;
  private gameState!:        GameState;
  private commandProcessor!: CommandProcessor;
  private eventBus!:         GameEventBus;
  private playerId!:         string;

  private activeTab: Tab = 'units';

  private progressBar!:         Phaser.GameObjects.Rectangle;
  private progressBg!:          Phaser.GameObjects.Rectangle;
  private progressLabel!:       Phaser.GameObjects.Text;
  private currentOrderLabel!:   Phaser.GameObjects.Text;
  private resourceTexts:        Partial<Record<ResourceType, Phaser.GameObjects.Text>> = {};

  // Unit tab rows
  private unitRows: Array<{
    entry:     CatalogEntry;
    btn:       Phaser.GameObjects.Rectangle;
    btnText:   Phaser.GameObjects.Text;
    costLabel: Phaser.GameObjects.Text;
    container: Phaser.GameObjects.GameObject[];
  }> = [];

  // Building tab rows
  private buildingRows: Array<{
    def:       CityBuildingDef;
    btn:       Phaser.GameObjects.Rectangle;
    btnText:   Phaser.GameObjects.Text;
    costLabel: Phaser.GameObjects.Text;
    container: Phaser.GameObjects.GameObject[];
  }> = [];

  // Tab buttons
  private tabUnitsBtn!:     Phaser.GameObjects.Rectangle;
  private tabBuildingsBtn!: Phaser.GameObjects.Rectangle;

  constructor() { super({ key: 'CityMenuScene' }); }

  init(data: CityMenuSceneData): void {
    this.city             = data.city;
    this.gameState        = data.gameState;
    this.commandProcessor = data.commandProcessor;
    this.eventBus         = data.eventBus;
    this.unitRows         = [];
    this.buildingRows     = [];
    this.resourceTexts    = {};
    this.activeTab        = 'units';

    const lp   = this.gameState.getLocalPlayer();
    this.playerId = lp?.getId() ?? '';
  }

  create(): void {
    const W  = this.scale.width;
    const H  = this.scale.height;
    const cx = W / 2;
    const cy = H / 2 - 20;
    const px = cx - PW / 2;
    const py = cy - PH / 2;

    this.add.rectangle(0, 0, W, H, BG, 0.55).setOrigin(0, 0).setInteractive();
    this.add.rectangle(cx, cy, PW, PH, PANEL).setStrokeStyle(1, ACCENT);

    // ── Header ────────────────────────────────────────────────────────────────
    this.add.rectangle(cx, py + 22, PW, 44, HEADER).setOrigin(0.5);
    const nation      = this.gameState.getNation(this.city.getOwnerId());
    const nationColor = nation ? parseInt(nation.getColor().replace('#', ''), 16) : 0xffffff;
    this.add.circle(px + 22, py + 22, 8, nationColor);
    this.add.text(px + 40, py + 22, this.city.getName(), {
      fontSize: '18px', color: WHITE, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.add.text(px + 260, py + 22, `— ${nation?.getName() ?? ''}`, {
      fontSize: '14px', color: DIM, fontFamily: 'monospace',
    }).setOrigin(0, 0.5);

    // Buildings owned (compact)
    const builtStr = this.city.getBuildings().join(' ');
    this.add.text(px + 440, py + 22, builtStr, {
      fontSize: '11px', color: '#44cc88', fontFamily: 'monospace',
    }).setOrigin(0, 0.5);

    // Close
    const closeBg = this.add.rectangle(px + PW - 28, py + 22, 44, 32, RED_BTN)
      .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
    this.add.text(px + PW - 28, py + 22, '✕', { fontSize: '16px', color: '#ff8888', fontFamily: 'monospace' }).setOrigin(0.5);
    closeBg.on('pointerup',   () => this.close());
    closeBg.on('pointerover', () => closeBg.setFillStyle(RED_H));
    closeBg.on('pointerout',  () => closeBg.setFillStyle(RED_BTN));
    this.input.keyboard!.once('keydown-ESC', () => this.close());

    // ── Current production ────────────────────────────────────────────────────
    const secY = py + 56;
    this.add.text(px + 16, secY, 'CURRENT PRODUCTION', { fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 });
    this.currentOrderLabel = this.add.text(px + 16, secY + 22, '— Idle —', { fontSize: '14px', color: DIM, fontFamily: 'monospace', fontStyle: 'bold' });

    const barW = PW / 2 - 40;
    this.progressBg  = this.add.rectangle(px + 16, secY + 52, barW, 14, 0x222240).setOrigin(0, 0.5).setStrokeStyle(1, ACCENT);
    this.progressBar = this.add.rectangle(px + 16, secY + 52, 0, 10, ACCENT).setOrigin(0, 0.5);
    this.progressLabel = this.add.text(px + 16 + barW / 2, secY + 52, '', { fontSize: '11px', color: LT, fontFamily: 'monospace' }).setOrigin(0.5);

    const cancelBg = this.add.rectangle(px + 74, secY + 78, 120, 26, RED_BTN).setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
    this.add.text(px + 74, secY + 78, 'CANCEL', { fontSize: '12px', color: '#ff8888', fontFamily: 'monospace' }).setOrigin(0.5);
    cancelBg.on('pointerup',   () => { this.city.cancelOrder(); this.refresh(); });
    cancelBg.on('pointerover', () => cancelBg.setFillStyle(RED_H));
    cancelBg.on('pointerout',  () => cancelBg.setFillStyle(RED_BTN));

    // ── Nation resources ──────────────────────────────────────────────────────
    const resX = px + PW / 2 + 16;
    this.add.text(resX, secY, 'NATION RESOURCES', { fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 });
    const shown: Array<{ type: ResourceType; color: string }> = [
      { type: ResourceType.FOOD,         color: '#88cc88' },
      { type: ResourceType.RAW_MATERIAL, color: '#cc8844' },
      { type: ResourceType.GOLD,         color: GOLD_C    },
      { type: ResourceType.RESEARCH,     color: '#88aaff' },
    ];
    shown.forEach(({ type, color }, i) => {
      this.add.text(resX,      secY + 22 + i * 20, `${RESOURCE_EMOJI[type]}`, { fontSize: '14px', fontFamily: 'monospace' });
      this.add.text(resX + 28, secY + 22 + i * 20, `${ResourceType[type as keyof typeof ResourceType] ?? type}`, { fontSize: '12px', color: DIM, fontFamily: 'monospace' });
      this.resourceTexts[type] = this.add.text(resX + 150, secY + 22 + i * 20, '0', { fontSize: '13px', color, fontFamily: 'monospace', fontStyle: 'bold' });
    });

    // ── Tabs ──────────────────────────────────────────────────────────────────
    const tabY = secY + 108;
    this.add.rectangle(cx, tabY, PW - 16, 1, ACCENT).setOrigin(0.5, 0);

    const tabH = 28;
    const tabW = 120;
    this.tabUnitsBtn = this.add.rectangle(px + tabW / 2 + 16, tabY + 14, tabW, tabH, TAB_ACT)
      .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
    this.add.text(px + tabW / 2 + 16, tabY + 14, 'UNITS', { fontSize: '12px', color: LT, fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(0.5);

    this.tabBuildingsBtn = this.add.rectangle(px + tabW * 1.5 + 24, tabY + 14, tabW, tabH, BTN)
      .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
    this.add.text(px + tabW * 1.5 + 24, tabY + 14, 'BUILDINGS', { fontSize: '12px', color: DIM, fontFamily: 'monospace' }).setOrigin(0.5);

    this.tabUnitsBtn.on('pointerup',     () => this.switchTab('units'));
    this.tabBuildingsBtn.on('pointerup', () => this.switchTab('buildings'));

    // ── List area ─────────────────────────────────────────────────────────────
    const listTop    = tabY + tabH + 4;
    const rowH       = 30;
    const rowStartY  = listTop + 2;

    // Column headers
    const unitHdr    = this.add.container(0, 0);
    const buildHdr   = this.add.container(0, 0);
    unitHdr.add([
      this.add.text(px + 16,  listTop, 'UNIT',  { fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 }),
      this.add.text(px + 290, listTop, 'COST',  { fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 }),
      this.add.text(px + 500, listTop, 'TIME',  { fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 }),
      this.add.text(px + 580, listTop, 'STATS', { fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 }),
    ]);
    buildHdr.add([
      this.add.text(px + 16,  listTop, 'BUILDING', { fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 }),
      this.add.text(px + 290, listTop, 'COST',     { fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 }),
      this.add.text(px + 500, listTop, 'TIME',     { fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 }),
      this.add.text(px + 580, listTop, 'PERKS',    { fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 }),
    ]);
    buildHdr.setVisible(false);

    // ── Unit rows ─────────────────────────────────────────────────────────────
    PRODUCTION_CATALOG.forEach((entry, i) => {
      const ry = rowStartY + i * rowH + 16;
      const rowBg = this.add.rectangle(cx, ry + rowH / 2 - 2, PW - 8, rowH - 2, 0).setOrigin(0.5).setInteractive({ useHandCursor: true });
      rowBg.on('pointerover', () => rowBg.setFillStyle(0x1c1c38));
      rowBg.on('pointerout',  () => rowBg.setFillStyle(0));

      const nameText  = this.add.text(px + 16, ry + rowH / 2, entry.label, { fontSize: '13px', color: LT, fontFamily: 'monospace' }).setOrigin(0, 0.5);
      const costLabel = this.add.text(px + 290, ry + rowH / 2, formatCost(entry.cost as Record<string, number>), { fontSize: '12px', color: DIM, fontFamily: 'monospace' }).setOrigin(0, 0.5);
      const secs      = (entry.ticks / TICK_RATE).toFixed(1);
      const timeText  = this.add.text(px + 500, ry + rowH / 2, `${secs}s`, { fontSize: '12px', color: DIM, fontFamily: 'monospace' }).setOrigin(0, 0.5);
      const detText   = this.add.text(px + 580, ry + rowH / 2, entry.detail, { fontSize: '11px', color: '#888899', fontFamily: 'monospace' }).setOrigin(0, 0.5);

      const btnX   = px + PW - 56;
      const btn    = this.add.rectangle(btnX, ry + rowH / 2, 76, 22, BTN).setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
      const btnText = this.add.text(btnX, ry + rowH / 2, 'BUILD', { fontSize: '12px', color: LT, fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(0.5);

      btn.on('pointerover', () => { if (btn.getData('enabled')) btn.setFillStyle(BTN_HOV); });
      btn.on('pointerout',  () => { if (btn.getData('enabled')) btn.setFillStyle(BTN); });
      btn.on('pointerup',   () => { if (btn.getData('enabled')) this.startProduction(entry); });

      const container = [rowBg, nameText, costLabel, timeText, detText, btn, btnText];
      this.unitRows.push({ entry, btn, btnText, costLabel, container });
    });

    // ── Building rows ─────────────────────────────────────────────────────────
    const buildable = CITY_BUILDING_CATALOG.filter(b => b.ticks > 0); // skip CITY_HALL (built-in)
    buildable.forEach((def, i) => {
      const ry = rowStartY + i * rowH + 16;
      const rowBg = this.add.rectangle(cx, ry + rowH / 2 - 2, PW - 8, rowH - 2, 0).setOrigin(0.5).setInteractive({ useHandCursor: true });
      rowBg.on('pointerover', () => rowBg.setFillStyle(0x1c1c38));
      rowBg.on('pointerout',  () => rowBg.setFillStyle(0));

      const nameText  = this.add.text(px + 16, ry + rowH / 2, def.label, { fontSize: '13px', color: LT, fontFamily: 'monospace' }).setOrigin(0, 0.5);
      const costLabel = this.add.text(px + 290, ry + rowH / 2, formatCost(def.cost as Record<string, number>), { fontSize: '12px', color: DIM, fontFamily: 'monospace' }).setOrigin(0, 0.5);
      const secs      = (def.ticks / TICK_RATE).toFixed(1);
      const timeText  = this.add.text(px + 500, ry + rowH / 2, `${secs}s`, { fontSize: '12px', color: DIM, fontFamily: 'monospace' }).setOrigin(0, 0.5);
      const perksText = this.add.text(px + 580, ry + rowH / 2, def.perks, { fontSize: '11px', color: '#888899', fontFamily: 'monospace' }).setOrigin(0, 0.5);

      const btnX    = px + PW - 56;
      const btn     = this.add.rectangle(btnX, ry + rowH / 2, 76, 22, BTN).setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
      const btnText = this.add.text(btnX, ry + rowH / 2, 'BUILD', { fontSize: '12px', color: LT, fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(0.5);

      btn.on('pointerover', () => { if (btn.getData('enabled')) btn.setFillStyle(BTN_HOV); });
      btn.on('pointerout',  () => { if (btn.getData('enabled')) btn.setFillStyle(BTN); });
      btn.on('pointerup',   () => { if (btn.getData('enabled')) this.buildCityBuilding(def); });

      const container = [rowBg, nameText, costLabel, timeText, perksText, btn, btnText];
      this.buildingRows.push({ def, btn, btnText, costLabel, container });

      // Start hidden
      container.forEach(o => (o as Phaser.GameObjects.GameObject & { setVisible: (v: boolean) => void }).setVisible(false));
    });

    // Store header refs for tab switching
    (unitHdr  as unknown as { __ref: string }).__ref = 'unit';
    (buildHdr as unknown as { __ref: string }).__ref = 'build';
    this.data.set('unitHdr',  unitHdr);
    this.data.set('buildHdr', buildHdr);

    // Refresh buttons when game state changes (replaces frame-polling)
    this.eventBus.on('city:unit-spawned',       () => this.refreshBuildButtons());
    this.eventBus.on('city:building-built',     () => this.refreshBuildButtons());
    this.eventBus.on('city:production-complete',() => this.refreshBuildButtons());
    this.eventBus.on('nation:research-complete',() => this.refreshBuildButtons());

    this.refresh();
  }

  override update(): void {
    // Progress bar updates every frame for smooth animation.
    // Button states refresh via event subscriptions.
    this.refreshProduction();
    this.refreshResources();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private switchTab(tab: Tab): void {
    this.activeTab = tab;

    const isUnits = tab === 'units';
    this.tabUnitsBtn.setFillStyle(isUnits ? TAB_ACT : BTN);
    this.tabBuildingsBtn.setFillStyle(isUnits ? BTN : TAB_ACT);

    const unitHdr  = this.data.get('unitHdr')  as Phaser.GameObjects.Container;
    const buildHdr = this.data.get('buildHdr') as Phaser.GameObjects.Container;
    unitHdr.setVisible(isUnits);
    buildHdr.setVisible(!isUnits);

    this.unitRows.forEach(r =>
      r.container.forEach(o => (o as Phaser.GameObjects.GameObject & { setVisible: (v: boolean) => void }).setVisible(isUnits))
    );
    this.buildingRows.forEach(r =>
      r.container.forEach(o => (o as Phaser.GameObjects.GameObject & { setVisible: (v: boolean) => void }).setVisible(!isUnits))
    );

    this.refreshBuildButtons();
  }

  private refresh(): void {
    this.refreshProduction();
    this.refreshResources();
    this.refreshBuildButtons();
  }

  private startProduction(entry: CatalogEntry): void {
    const result = this.commandProcessor.dispatch({
      type:         'START_CITY_PRODUCTION',
      playerId:     this.playerId,
      cityId:       this.city.id,
      unitType:     (entry.makeOrder() as UnitOrder).unitType,
      issuedAtTick: 0,
    });
    if (result.success) this.refresh();
  }

  private buildCityBuilding(def: CityBuildingDef): void {
    const result = this.commandProcessor.dispatch({
      type:         'BUILD_CITY_BUILDING',
      playerId:     this.playerId,
      cityId:       this.city.id,
      building:     def.type,
      issuedAtTick: 0,
    });
    if (result.success) this.refresh();
  }

  private refreshProduction(): void {
    const order = this.city.getCurrentOrder();
    if (!order) {
      this.currentOrderLabel.setText('— Idle —').setColor(DIM);
      this.progressBar.setDisplaySize(0, this.progressBar.displayHeight);
      this.progressLabel.setText('');
    } else {
      this.currentOrderLabel.setText(order.label).setColor(GOLD_C);
      const pct  = this.city.getProgressFraction();
      const barW = Math.round((this.progressBg.displayWidth - 4) * pct);
      this.progressBar.setDisplaySize(Math.max(0, barW), this.progressBar.displayHeight);
      this.progressLabel.setText(`${(order.ticksRemaining / TICK_RATE).toFixed(1)}s remaining`);
    }
  }

  private refreshResources(): void {
    const treasury = this.gameState.getNation(this.city.getOwnerId())?.getTreasury();
    if (!treasury) return;
    for (const [type, text] of Object.entries(this.resourceTexts)) {
      text?.setText(String(treasury.getAmount(type as ResourceType)));
    }
  }

  private refreshBuildButtons(): void {
    const nation   = this.gameState.getNation(this.city.getOwnerId());
    const busy     = this.city.getCurrentOrder() !== null;
    const treasury = nation?.getTreasury();

    if (this.activeTab === 'units') {
      for (const row of this.unitRows) {
        const canAfford     = treasury?.hasResources(row.entry.cost) ?? false;
        const techsOk       = row.entry.requiresTechs.every(t => nation?.hasResearched(t) ?? false);
        const buildingOk    = !row.entry.requiresBuilding || this.city.hasBuilding(row.entry.requiresBuilding);
        const enabled       = !busy && canAfford && techsOk && buildingOk;
        row.btn.setData('enabled', enabled);
        row.btn.setFillStyle(enabled ? BTN : 0x111122);
        row.btn.setStrokeStyle(1, enabled ? ACCENT : 0x333355);
        row.btnText.setColor(enabled ? LT : '#444455');
        row.btnText.setText(techsOk && buildingOk ? 'BUILD' : 'LOCKED');
        row.costLabel.setColor(canAfford ? DIM : '#884444');
      }
    } else {
      for (const row of this.buildingRows) {
        const alreadyBuilt = this.city.hasBuilding(row.def.type);
        const techOk       = !row.def.requiresTech || (nation?.hasResearched(row.def.requiresTech) ?? false);
        const canAfford    = treasury?.hasResources(row.def.cost) ?? false;
        const enabled      = !alreadyBuilt && !busy && techOk && canAfford;
        row.btn.setData('enabled', enabled);
        row.btn.setFillStyle(enabled ? BTN : 0x111122);
        row.btn.setStrokeStyle(1, enabled ? ACCENT : 0x333355);
        row.btnText.setColor(enabled ? LT : '#444455');
        row.btnText.setText(alreadyBuilt ? 'BUILT' : techOk ? 'BUILD' : 'LOCKED');
        row.costLabel.setColor(canAfford ? DIM : '#884444');
      }
    }
  }

  private close(): void {
    this.scene.stop('CityMenuScene');
  }
}

