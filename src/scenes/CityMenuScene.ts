/**
 * CityMenuScene — production management overlay for a single city.
 * Tabs: UNITS (train units) | BUILDINGS (construct city buildings).
 * Launched on top of GameScene (game keeps ticking while open).
 */

import Phaser from 'phaser';
import type { City } from '@/entities/cities/City';
import type { GameState } from '@/managers/GameState';
import type { NetworkAdapter } from '@/network/NetworkAdapter';
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
  city:           City;
  gameState:      GameState;
  networkAdapter: NetworkAdapter;
  eventBus:       GameEventBus;
}

// ── Resource emoji map ────────────────────────────────────────────────────────
export const RESOURCE_EMOJI: Record<ResourceType, string> = {
  [ResourceType.FOOD]:         '🍎',
  [ResourceType.RAW_MATERIAL]: '🪨',
  [ResourceType.GOLD]:         '🪙',
  [ResourceType.RESEARCH]:     '🔍',
};

// ── Palette ───────────────────────────────────────────────────────────────────
const { BG, PANEL, HEADER, ACCENT, BTN, BTN_HOV, RED_BTN, RED_H, DIM, LT, WHITE, GOLD_C } = UI;
const TAB_ACT = 0x2a2e60;

const PW = 860; const PH = 620;
const ROW_H = 38;

type Tab = 'units' | 'buildings';

export class CityMenuScene extends Phaser.Scene {
  private city!:             City;
  private gameState!:        GameState;
  private networkAdapter!: NetworkAdapter;
  private eventBus!:         GameEventBus;
  private playerId!:         string;

  private activeTab: Tab = 'units';

  private progressBar!:         Phaser.GameObjects.Rectangle;
  private progressBg!:          Phaser.GameObjects.Rectangle;
  private progressLabel!:       Phaser.GameObjects.Text;
  private currentOrderLabel!:   Phaser.GameObjects.Text;
  private resourceTexts:        Partial<Record<ResourceType, Phaser.GameObjects.Text>> = {};

  private unitRows: Array<{
    entry:     CatalogEntry;
    btn:       Phaser.GameObjects.Rectangle;
    btnText:   Phaser.GameObjects.Text;
    costLabel: Phaser.GameObjects.Text;
    container: Phaser.GameObjects.GameObject[];
    baseY:     number;
  }> = [];

  private buildingRows: Array<{
    def:       CityBuildingDef;
    btn:       Phaser.GameObjects.Rectangle;
    btnText:   Phaser.GameObjects.Text;
    costLabel: Phaser.GameObjects.Text;
    container: Phaser.GameObjects.GameObject[];
    baseY:     number;
  }> = [];

  private tabUnitsBtn!:     Phaser.GameObjects.Rectangle;
  private tabBuildingsBtn!: Phaser.GameObjects.Rectangle;
  private hoverHintText!:   Phaser.GameObjects.Text;
  private listViewportTop   = 0;
  private listViewportBottom = 0;
  private unitScrollOffset  = 0;
  private buildingScrollOffset = 0;
  private unitScrollMax     = 0;
  private buildingScrollMax = 0;

  constructor() { super({ key: 'CityMenuScene' }); }

  init(data: CityMenuSceneData): void {
    this.city             = data.city;
    this.gameState        = data.gameState;
    this.networkAdapter = data.networkAdapter;
    this.eventBus         = data.eventBus;
    this.unitRows         = [];
    this.buildingRows     = [];
    this.resourceTexts    = {};
    this.activeTab        = 'units';
    this.listViewportTop  = 0;
    this.listViewportBottom = 0;
    this.unitScrollOffset = 0;
    this.buildingScrollOffset = 0;
    this.unitScrollMax    = 0;
    this.buildingScrollMax = 0;

    const lp   = this.gameState.getLocalPlayer();
    this.playerId = lp?.getId() ?? '';
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

    // Hover hint — shown when mousing over a locked/unavailable row
    this.hoverHintText = this.add.text(cx, py + PH - 11, '', {
      fontSize: '12px', color: '#aa99cc', fontFamily: 'monospace', fontStyle: 'italic',
    }).setOrigin(0.5).setDepth(10);

    // ── Header ────────────────────────────────────────────────────────────────
    const HDR_H = 50;
    this.add.rectangle(cx, py + HDR_H / 2, PW, HDR_H, HEADER).setOrigin(0.5);

    const nation      = this.gameState.getNation(this.city.getOwnerId());
    const nationColor = nation ? parseInt(nation.getColor().replace('#', ''), 16) : 0xffffff;
    this.add.circle(px + 26, py + HDR_H / 2, 9, nationColor);
    this.add.text(px + 46, py + HDR_H / 2, this.city.getName(), {
      fontSize: '20px', color: WHITE, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.add.text(px + 300, py + HDR_H / 2, `— ${nation?.getName() ?? ''}`, {
      fontSize: '15px', color: DIM, fontFamily: 'monospace',
    }).setOrigin(0, 0.5);

    const builtStr = this.city.getBuildings().join('  ');
    this.add.text(px + 480, py + HDR_H / 2, builtStr, {
      fontSize: '13px', color: '#55dd99', fontFamily: 'monospace',
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

    // ── Current production ────────────────────────────────────────────────────
    const secY = py + HDR_H + 12;
    this.add.text(px + 18, secY, 'CURRENT PRODUCTION', {
      fontSize: '12px', color: DIM, fontFamily: 'monospace', letterSpacing: 2,
    });
    this.currentOrderLabel = this.add.text(px + 18, secY + 26, '— Idle —', {
      fontSize: '16px', color: DIM, fontFamily: 'monospace', fontStyle: 'bold',
    });

    const barW = PW / 2 - 44;
    this.progressBg  = this.add.rectangle(px + 18, secY + 58, barW, 16, 0x1a1e3a)
      .setOrigin(0, 0.5).setStrokeStyle(1, ACCENT);
    this.progressBar = this.add.rectangle(px + 18, secY + 58, 0, 12, ACCENT)
      .setOrigin(0, 0.5);
    this.progressLabel = this.add.text(px + 18 + barW / 2, secY + 58, '', {
      fontSize: '12px', color: LT, fontFamily: 'monospace',
    }).setOrigin(0.5);

    const cancelBg = this.add.rectangle(px + 80, secY + 86, 132, 30, RED_BTN)
      .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
    this.add.text(px + 80, secY + 86, 'CANCEL', {
      fontSize: '13px', color: '#ff9999', fontFamily: 'monospace',
    }).setOrigin(0.5);
    cancelBg.on('pointerup',   () => { this.city.cancelOrder(); this.refresh(); });
    cancelBg.on('pointerover', () => cancelBg.setFillStyle(RED_H));
    cancelBg.on('pointerout',  () => cancelBg.setFillStyle(RED_BTN));

    // ── Nation resources ──────────────────────────────────────────────────────
    const resX = px + PW / 2 + 18;
    this.add.text(resX, secY, 'NATION RESOURCES', {
      fontSize: '12px', color: DIM, fontFamily: 'monospace', letterSpacing: 2,
    });
    const shown: Array<{ type: ResourceType; color: string }> = [
      { type: ResourceType.FOOD,         color: '#88dd88' },
      { type: ResourceType.RAW_MATERIAL, color: '#ddaa66' },
      { type: ResourceType.GOLD,         color: GOLD_C    },
      { type: ResourceType.RESEARCH,     color: '#99bbff' },
    ];
    shown.forEach(({ type, color }, i) => {
      this.add.text(resX,      secY + 26 + i * 22, `${RESOURCE_EMOJI[type]}`, {
        fontSize: '17px', fontFamily: 'monospace',
      });
      this.add.text(resX + 32, secY + 26 + i * 22,
        `${ResourceType[type as keyof typeof ResourceType] ?? type}`, {
          fontSize: '13px', color: DIM, fontFamily: 'monospace',
        });
      this.resourceTexts[type] = this.add.text(resX + 164, secY + 26 + i * 22, '0', {
        fontSize: '15px', color, fontFamily: 'monospace', fontStyle: 'bold',
      });
    });

    // ── Tabs ──────────────────────────────────────────────────────────────────
    const tabY = secY + 124;
    this.add.rectangle(cx, tabY, PW - 16, 1, ACCENT).setOrigin(0.5, 0);

    const tabH = 34;
    const tabW = 132;
    this.tabUnitsBtn = this.add.rectangle(px + tabW / 2 + 18, tabY + tabH / 2, tabW, tabH, TAB_ACT)
      .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
    this.add.text(px + tabW / 2 + 18, tabY + tabH / 2, 'UNITS', {
      fontSize: '13px', color: LT, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.tabBuildingsBtn = this.add.rectangle(px + tabW * 1.5 + 28, tabY + tabH / 2, tabW, tabH, BTN)
      .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
    this.add.text(px + tabW * 1.5 + 28, tabY + tabH / 2, 'BUILDINGS', {
      fontSize: '13px', color: DIM, fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.tabUnitsBtn.on('pointerup',     () => this.switchTab('units'));
    this.tabBuildingsBtn.on('pointerup', () => this.switchTab('buildings'));

    // ── List area ─────────────────────────────────────────────────────────────
    const listTop   = tabY + tabH + 6;
    const rowStartY = listTop + 4;
    this.listViewportTop = rowStartY + 4;
    this.listViewportBottom = py + PH - 42;

    // Column headers
    const unitHdr  = this.add.container(0, 0);
    const buildHdr = this.add.container(0, 0);
    unitHdr.add([
      this.add.text(px + 18,  listTop, 'UNIT',  { fontSize: '12px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 }),
      this.add.text(px + 310, listTop, 'COST',  { fontSize: '12px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 }),
      this.add.text(px + 540, listTop, 'TIME',  { fontSize: '12px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 }),
      this.add.text(px + 620, listTop, 'STATS', { fontSize: '12px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 }),
    ]);
    buildHdr.add([
      this.add.text(px + 18,  listTop, 'BUILDING', { fontSize: '12px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 }),
      this.add.text(px + 310, listTop, 'COST',     { fontSize: '12px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 }),
      this.add.text(px + 540, listTop, 'TIME',     { fontSize: '12px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 }),
      this.add.text(px + 620, listTop, 'PERKS',    { fontSize: '12px', color: DIM, fontFamily: 'monospace', letterSpacing: 2 }),
    ]);
    buildHdr.setVisible(false);

    // ── Unit rows ─────────────────────────────────────────────────────────────
    PRODUCTION_CATALOG.forEach((entry, i) => {
      const ry = rowStartY + i * ROW_H + 18;
      const rowBg = this.add.rectangle(cx, ry + ROW_H / 2 - 2, PW - 10, ROW_H - 2, 0)
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      rowBg.on('pointerover', () => {
        rowBg.setFillStyle(0x1e2240);
        const hint = this.getLockReasonForUnit(entry);
        if (hint) this.hoverHintText.setText(hint).setVisible(true);
      });
      rowBg.on('pointerout', () => {
        rowBg.setFillStyle(0);
        this.hoverHintText.setVisible(false);
      });

      const nameText  = this.add.text(px + 18, ry + ROW_H / 2,
        entry.label, { fontSize: '15px', color: LT, fontFamily: 'monospace' }).setOrigin(0, 0.5);
      const costLabel = this.add.text(px + 310, ry + ROW_H / 2,
        formatCost(entry.cost as Record<string, number>), { fontSize: '14px', color: DIM, fontFamily: 'monospace' }).setOrigin(0, 0.5);
      const secs      = (entry.ticks / TICK_RATE).toFixed(1);
      const timeText  = this.add.text(px + 540, ry + ROW_H / 2,
        `${secs}s`, { fontSize: '14px', color: DIM, fontFamily: 'monospace' }).setOrigin(0, 0.5);
      const detText   = this.add.text(px + 620, ry + ROW_H / 2,
        entry.detail, { fontSize: '12px', color: '#9090aa', fontFamily: 'monospace' }).setOrigin(0, 0.5);

      const btnX    = px + PW - 58;
      const btn     = this.add.rectangle(btnX, ry + ROW_H / 2, 84, 26, BTN)
        .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
      const btnText = this.add.text(btnX, ry + ROW_H / 2, 'BUILD', {
        fontSize: '13px', color: LT, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);

      btn.on('pointerover', () => { if (btn.getData('enabled')) btn.setFillStyle(BTN_HOV); });
      btn.on('pointerout',  () => { if (btn.getData('enabled')) btn.setFillStyle(BTN); });
      btn.on('pointerup',   () => { if (btn.getData('enabled')) this.startProduction(entry); });

      const container = [rowBg, nameText, costLabel, timeText, detText, btn, btnText];
      container.forEach(o => o.setData('baseY', (o as Phaser.GameObjects.Components.Transform).y));
      this.unitRows.push({ entry, btn, btnText, costLabel, container, baseY: ry + ROW_H / 2 });
    });

    // ── Building rows ─────────────────────────────────────────────────────────
    const buildable = CITY_BUILDING_CATALOG.filter(b => b.ticks > 0);
    buildable.forEach((def, i) => {
      const ry = rowStartY + i * ROW_H + 18;
      const rowBg = this.add.rectangle(cx, ry + ROW_H / 2 - 2, PW - 10, ROW_H - 2, 0)
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      rowBg.on('pointerover', () => {
        rowBg.setFillStyle(0x1e2240);
        const hint = this.getLockReasonForBuilding(def);
        if (hint) this.hoverHintText.setText(hint).setVisible(true);
      });
      rowBg.on('pointerout', () => {
        rowBg.setFillStyle(0);
        this.hoverHintText.setVisible(false);
      });

      const nameText  = this.add.text(px + 18, ry + ROW_H / 2,
        def.label, { fontSize: '15px', color: LT, fontFamily: 'monospace' }).setOrigin(0, 0.5);
      const costLabel = this.add.text(px + 310, ry + ROW_H / 2,
        formatCost(def.cost as Record<string, number>), { fontSize: '14px', color: DIM, fontFamily: 'monospace' }).setOrigin(0, 0.5);
      const secs      = (def.ticks / TICK_RATE).toFixed(1);
      const timeText  = this.add.text(px + 540, ry + ROW_H / 2,
        `${secs}s`, { fontSize: '14px', color: DIM, fontFamily: 'monospace' }).setOrigin(0, 0.5);
      const perksText = this.add.text(px + 620, ry + ROW_H / 2,
        def.perks, { fontSize: '12px', color: '#9090aa', fontFamily: 'monospace' }).setOrigin(0, 0.5);

      const btnX    = px + PW - 58;
      const btn     = this.add.rectangle(btnX, ry + ROW_H / 2, 84, 26, BTN)
        .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
      const btnText = this.add.text(btnX, ry + ROW_H / 2, 'BUILD', {
        fontSize: '13px', color: LT, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);

      btn.on('pointerover', () => { if (btn.getData('enabled')) btn.setFillStyle(BTN_HOV); });
      btn.on('pointerout',  () => { if (btn.getData('enabled')) btn.setFillStyle(BTN); });
      btn.on('pointerup',   () => { if (btn.getData('enabled')) this.buildCityBuilding(def); });

      const container = [rowBg, nameText, costLabel, timeText, perksText, btn, btnText];
      container.forEach(o => o.setData('baseY', (o as Phaser.GameObjects.Components.Transform).y));
      this.buildingRows.push({ def, btn, btnText, costLabel, container, baseY: ry + ROW_H / 2 });
      container.forEach(o => (o as Phaser.GameObjects.GameObject & { setVisible: (v: boolean) => void }).setVisible(false));
    });

    const viewportHeight = this.listViewportBottom - this.listViewportTop;
    this.unitScrollMax = Math.max(0, this.unitRows.length * ROW_H - viewportHeight + 20);
    this.buildingScrollMax = Math.max(0, this.buildingRows.length * ROW_H - viewportHeight + 20);

    const makeScrollBtn = (x: number, y: number, label: string, onClick: () => void) => {
      const bg = this.add.rectangle(x, y, 32, 28, BTN)
        .setStrokeStyle(1, ACCENT)
        .setInteractive({ useHandCursor: true });
      this.add.text(x, y, label, {
        fontSize: '16px', color: LT, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);
      bg.on('pointerover', () => bg.setFillStyle(BTN_HOV));
      bg.on('pointerout',  () => bg.setFillStyle(BTN));
      bg.on('pointerup',   onClick);
    };

    makeScrollBtn(px + PW - 24, this.listViewportTop + 14, '^', () => this.scrollList(-1));
    makeScrollBtn(px + PW - 24, this.listViewportBottom - 14, 'v', () => this.scrollList(1));

    const onWheel = (
      pointer: Phaser.Input.Pointer,
      _gos: unknown,
      _dx: number,
      dy: number,
    ) => {
      const withinX = pointer.x >= px + 8 && pointer.x <= px + PW - 8;
      const withinY = pointer.y >= this.listViewportTop && pointer.y <= this.listViewportBottom;
      if (!withinX || !withinY) return;
      this.scrollList(dy > 0 ? 1 : -1);
    };
    this.input.on('wheel', onWheel);

    // Store header refs for tab switching
    this.data.set('unitHdr',  unitHdr);
    this.data.set('buildHdr', buildHdr);

    const onRefresh = () => this.refreshBuildButtons();
    this.eventBus.on('city:unit-spawned',        onRefresh);
    this.eventBus.on('city:building-built',      onRefresh);
    this.eventBus.on('city:production-complete', onRefresh);
    this.eventBus.on('nation:research-complete', onRefresh);

    this.events.once('shutdown', () => {
      this.eventBus.off('city:unit-spawned',        onRefresh);
      this.eventBus.off('city:building-built',      onRefresh);
      this.eventBus.off('city:production-complete', onRefresh);
      this.eventBus.off('nation:research-complete', onRefresh);
      this.input.off('wheel', onWheel);
    });

    this.refresh();
  }

  override update(): void {
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

    this.applyListScroll();
    this.refreshBuildButtons();
  }

  private refresh(): void {
    this.refreshProduction();
    this.refreshResources();
    this.applyListScroll();
    this.refreshBuildButtons();
  }

  private scrollList(direction: -1 | 1): void {
    const delta = direction * ROW_H;
    if (this.activeTab === 'units') {
      this.unitScrollOffset = Phaser.Math.Clamp(this.unitScrollOffset + delta, 0, this.unitScrollMax);
    } else {
      this.buildingScrollOffset = Phaser.Math.Clamp(this.buildingScrollOffset + delta, 0, this.buildingScrollMax);
    }
    this.applyListScroll();
  }

  private applyListScroll(): void {
    const isUnits = this.activeTab === 'units';

    for (const row of this.unitRows) {
      this.positionRow(row.container, row.baseY, this.unitScrollOffset, isUnits);
    }
    for (const row of this.buildingRows) {
      this.positionRow(row.container, row.baseY, this.buildingScrollOffset, !isUnits);
    }
  }

  private positionRow(
    objects: Phaser.GameObjects.GameObject[],
    baseY: number,
    offset: number,
    enabled: boolean,
  ): void {
    const rowY = baseY - offset;
    const visible = enabled && rowY >= this.listViewportTop && rowY <= this.listViewportBottom;

    for (const obj of objects) {
      const baseObjY = obj.getData('baseY');
      if (typeof baseObjY === 'number' && 'setY' in obj) {
        (obj as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform).setY(baseObjY - offset);
      }
      if ('setVisible' in obj) {
        (obj as Phaser.GameObjects.GameObject & { setVisible: (v: boolean) => void }).setVisible(visible);
      }
    }
  }

  private async startProduction(entry: CatalogEntry): Promise<void> {
    const result = await this.networkAdapter.sendCommand({
      type:         'START_CITY_PRODUCTION',
      playerId:     this.playerId,
      cityId:       this.city.id,
      unitType:     (entry.makeOrder() as UnitOrder).unitType,
      issuedAtTick: 0,
    });
    if (result.success) this.refresh();
  }

  private async buildCityBuilding(def: CityBuildingDef): Promise<void> {
    const result = await this.networkAdapter.sendCommand({
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
      const deposits = nation ? this.gameState.getNationActiveDeposits(nation.getId()) : new Set();
      for (const row of this.unitRows) {
        const canAfford   = treasury?.hasResources(row.entry.cost) ?? false;
        const techsOk     = row.entry.requiresTechs.every(t => nation?.hasResearched(t) ?? false);
        const buildingOk  = !row.entry.requiresBuilding || this.city.hasBuilding(row.entry.requiresBuilding);
        const depositOk   = !row.entry.requiresDeposit || deposits.has(row.entry.requiresDeposit);
        const enabled     = !busy && canAfford && techsOk && buildingOk && depositOk;
        row.btn.setData('enabled', enabled);
        row.btn.setFillStyle(enabled ? BTN : 0x0e101e);
        row.btn.setStrokeStyle(1, enabled ? ACCENT : 0x2a2a44);
        row.btnText.setColor(enabled ? LT : '#444466');
        row.btnText.setText(techsOk && buildingOk && depositOk ? 'BUILD' : 'LOCKED');
        row.costLabel.setColor(canAfford ? DIM : '#995555');
      }
    } else {
      for (const row of this.buildingRows) {
        const alreadyBuilt = this.city.hasBuilding(row.def.type);
        const techOk       = !row.def.requiresTech || (nation?.hasResearched(row.def.requiresTech) ?? false);
        const canAfford    = treasury?.hasResources(row.def.cost) ?? false;
        const enabled      = !alreadyBuilt && !busy && techOk && canAfford;
        row.btn.setData('enabled', enabled);
        row.btn.setFillStyle(enabled ? BTN : 0x0e101e);
        row.btn.setStrokeStyle(1, enabled ? ACCENT : 0x2a2a44);
        row.btnText.setColor(enabled ? LT : '#444466');
        row.btnText.setText(alreadyBuilt ? 'BUILT' : techOk ? 'BUILD' : 'LOCKED');
        row.costLabel.setColor(canAfford ? DIM : '#995555');
      }
    }
  }

  private getLockReasonForUnit(entry: CatalogEntry): string {
    const nation = this.gameState.getNation(this.city.getOwnerId());
    if (this.city.getCurrentOrder()) return '⚠  city is already producing something';
    const missing = entry.requiresTechs.filter(t => !nation?.hasResearched(t));
    if (missing.length) return `⚠  requires research: ${missing.map(t => t.replace(/_/g, ' ').toLowerCase()).join(', ')}`;
    if (entry.requiresBuilding !== null && !this.city.hasBuilding(entry.requiresBuilding))
      return `⚠  requires ${entry.requiresBuilding.replace(/_/g, ' ').toLowerCase()} in this city`;
    if (entry.requiresDeposit) {
      const deposits = nation ? this.gameState.getNationActiveDeposits(nation.getId()) : new Set();
      if (!deposits.has(entry.requiresDeposit))
        return `⚠  requires active ${entry.requiresDeposit.replace(/_/g, ' ').toLowerCase()} mine`;
    }
    if (!nation?.getTreasury().hasResources(entry.cost)) return '⚠  insufficient resources';
    return '';
  }

  private getLockReasonForBuilding(def: CityBuildingDef): string {
    if (this.city.hasBuilding(def.type)) return '';  // "BUILT" label already makes this obvious
    const nation = this.gameState.getNation(this.city.getOwnerId());
    if (this.city.getCurrentOrder()) return '⚠  city is already producing something';
    if (def.requiresTech !== null && !nation?.hasResearched(def.requiresTech))
      return `⚠  requires research: ${def.requiresTech.replace(/_/g, ' ').toLowerCase()}`;
    if (!nation?.getTreasury().hasResources(def.cost)) return '⚠  insufficient resources';
    return '';
  }

  private close(): void {
    this.scene.stop('CityMenuScene');
  }
}
