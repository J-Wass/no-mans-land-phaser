/**
 * CityMenuScene - production management overlay for a single city.
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
import {
  colorString,
  createBackdrop,
  createButton,
  createPanelSizer,
  createScrollablePanel,
  createText,
  fitPanel,
  getUiMetrics,
  setButtonEnabled,
  type ButtonParts,
} from '@/utils/rexUiHelpers';
import { formatCost } from '@/utils/uiHelpers';

export interface CityMenuSceneData {
  city: City;
  gameState: GameState;
  networkAdapter: NetworkAdapter;
  eventBus: GameEventBus;
}

export const RESOURCE_EMOJI: Record<ResourceType, string> = {
  [ResourceType.FOOD]: 'F',
  [ResourceType.RAW_MATERIAL]: 'M',
  [ResourceType.GOLD]: 'G',
  [ResourceType.RESEARCH]: 'R',
};

type Tab = 'units' | 'buildings';

type UnitRow = {
  entry: CatalogEntry;
  button: ButtonParts;
  costLabel: Phaser.GameObjects.Text;
  statusLabel: Phaser.GameObjects.Text;
};

type BuildingRow = {
  def: CityBuildingDef;
  button: ButtonParts;
  costLabel: Phaser.GameObjects.Text;
  statusLabel: Phaser.GameObjects.Text;
};

export class CityMenuScene extends Phaser.Scene {
  private city!: City;
  private gameState!: GameState;
  private networkAdapter!: NetworkAdapter;
  private eventBus!: GameEventBus;
  private playerId!: string;

  private activeTab: Tab = 'units';
  private unitRows: UnitRow[] = [];
  private buildingRows: BuildingRow[] = [];
  private currentOrderLabel!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Rectangle;
  private progressBg!: Phaser.GameObjects.Rectangle;
  private resourceTexts: Partial<Record<ResourceType, Phaser.GameObjects.Text>> = {};
  private unitPanel!: Phaser.GameObjects.GameObject & { setVisible(value: boolean): unknown };
  private buildingPanel!: Phaser.GameObjects.GameObject & { setVisible(value: boolean): unknown };
  private tabButtons!: Record<Tab, ButtonParts>;

  constructor() {
    super({ key: 'CityMenuScene' });
  }

  init(data: CityMenuSceneData): void {
    this.city = data.city;
    this.gameState = data.gameState;
    this.networkAdapter = data.networkAdapter;
    this.eventBus = data.eventBus;
    this.playerId = this.gameState.getLocalPlayer()?.getId() ?? '';
    this.activeTab = 'units';
    this.unitRows = [];
    this.buildingRows = [];
    this.resourceTexts = {};
  }

  create(): void {
    const metrics = getUiMetrics(this);
    const cx = metrics.width / 2;
    const cy = metrics.height / 2;
    const size = fitPanel(metrics.width, metrics.height, 0.94, 1320, 980);

    createBackdrop(this, 0.78);

    const root = createPanelSizer(this, metrics, size.width, size.height, 'y', UI.PANEL);
    root.add(this.buildHeader(metrics, size.width), { expand: true });
    root.add(this.buildOverview(metrics, size.width), { expand: true });
    root.add(this.buildTabs(metrics, size.width), { expand: true });
    root.add(this.buildListArea(metrics, size.width, size.height), { proportion: 1, expand: true });
    root.setPosition(cx, cy).layout();

    const onRefresh = () => this.refresh();
    this.eventBus.on('city:unit-spawned', onRefresh);
    this.eventBus.on('city:building-built', onRefresh);
    this.eventBus.on('city:production-complete', onRefresh);
    this.eventBus.on('nation:research-complete', onRefresh);
    this.events.once('shutdown', () => {
      this.eventBus.off('city:unit-spawned', onRefresh);
      this.eventBus.off('city:building-built', onRefresh);
      this.eventBus.off('city:production-complete', onRefresh);
      this.eventBus.off('nation:research-complete', onRefresh);
    });

    this.input.keyboard?.once('keydown-ESC', () => this.close());
    this.refresh();
  }

  override update(): void {
    this.refreshProduction();
    this.refreshResources();
  }

  private buildHeader(metrics: ReturnType<typeof getUiMetrics>, panelWidth: number): Phaser.GameObjects.GameObject {
    const row = this.rexUI.add.sizer({
      orientation: 'x',
      width: panelWidth - metrics.pad * 2,
      space: { item: metrics.gap },
    });

    const nation = this.gameState.getNation(this.city.getOwnerId());
    const titleColumn = this.rexUI.add.sizer({
      orientation: 'y',
      width: panelWidth - metrics.pad * 4,
      space: { item: metrics.smallGap },
    });
    titleColumn.add(createText(this, this.city.getName(), metrics, 'heading', {
      fontFamily: UI.FONT_DISPLAY,
      fontStyle: 'bold',
      color: UI.WHITE,
    }));
    titleColumn.add(createText(this, nation ? nation.getName() : 'Unknown owner', metrics, 'body', {
      color: UI.DIM,
      fontFamily: UI.FONT_DATA,
    }));
    row.add(titleColumn, { proportion: 1, expand: true });

    const closeButton = createButton(this, metrics, 'CLOSE', () => this.close(), {
      variant: 'danger',
      width: Math.round(120 * metrics.scale),
      height: Math.round(metrics.buttonHeight * 0.82),
    });
    row.add(closeButton.root);
    return row;
  }

  private buildOverview(metrics: ReturnType<typeof getUiMetrics>, panelWidth: number): Phaser.GameObjects.GameObject {
    const row = this.rexUI.add.sizer({
      orientation: metrics.stacked ? 'y' : 'x',
      width: panelWidth - metrics.pad * 2,
      space: { item: metrics.gap },
    });
    const cardWidth = metrics.stacked
      ? panelWidth - metrics.pad * 2
      : Math.round((panelWidth - metrics.pad * 2 - metrics.gap) / 2);

    row.add(this.buildProductionCard(metrics, cardWidth), { proportion: 1, expand: true });
    row.add(this.buildResourceCard(metrics, cardWidth), { proportion: 1, expand: true });
    return row;
  }

  private buildProductionCard(metrics: ReturnType<typeof getUiMetrics>, width: number): Phaser.GameObjects.GameObject {
    const card = createPanelSizer(this, metrics, width, Math.round(180 * metrics.scale), 'y', UI.PANEL_ALT);
    card.add(createText(this, 'Current Production', metrics, 'caption', {
      fontFamily: UI.FONT_DATA,
      fontStyle: 'bold',
      color: colorString(UI.ACCENT_SOFT),
    }));

    this.currentOrderLabel = createText(this, 'Idle', metrics, 'body', {
      color: UI.DIM,
      fontFamily: UI.FONT_DATA,
    });
    card.add(this.currentOrderLabel, { expand: true });

    const barWidth = width - metrics.pad * 2;
    this.progressBg = this.add.rectangle(0, 0, barWidth, Math.max(18, Math.round(metrics.scale * 18)), UI.SURFACE)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, UI.ACCENT, 0.9);
    this.progressBar = this.add.rectangle(0, 0, 0, Math.max(12, Math.round(metrics.scale * 12)), UI.ACCENT_SOFT)
      .setOrigin(0, 0.5);
    card.add(this.add.container(0, 0, [this.progressBg, this.progressBar]), { expand: true, align: 'left' });

    const cancelButton = createButton(this, metrics, 'CANCEL ORDER', () => {
      this.city.cancelOrder();
      this.refresh();
    }, {
      variant: 'warning',
      width: metrics.stacked ? width - metrics.pad * 2 : Math.round(170 * metrics.scale),
      height: Math.round(metrics.buttonHeight * 0.82),
    });
    card.add(cancelButton.root, { align: 'left' });
    return card;
  }

  private buildResourceCard(metrics: ReturnType<typeof getUiMetrics>, width: number): Phaser.GameObjects.GameObject {
    const card = createPanelSizer(this, metrics, width, Math.round(180 * metrics.scale), 'y', UI.PANEL_ALT);
    card.add(createText(this, 'Nation Resources', metrics, 'caption', {
      fontFamily: UI.FONT_DATA,
      fontStyle: 'bold',
      color: colorString(UI.ACCENT_SOFT),
    }));

    [
      { type: ResourceType.FOOD, label: 'Food', color: '#8ee09d' },
      { type: ResourceType.RAW_MATERIAL, label: 'Materials', color: '#f0bf7a' },
      { type: ResourceType.GOLD, label: 'Gold', color: UI.GOLD_C },
      { type: ResourceType.RESEARCH, label: 'Research', color: '#8fb8ff' },
    ].forEach(({ type, label, color }) => {
      const line = this.rexUI.add.sizer({
        orientation: 'x',
        width: width - metrics.pad * 2,
        space: { item: metrics.smallGap },
      });
      line.add(createText(this, RESOURCE_EMOJI[type], metrics, 'body', {
        fontFamily: UI.FONT_DATA,
        fontStyle: 'bold',
        color,
      }));
      line.add(createText(this, label, metrics, 'caption', {
        color: UI.DIM,
      }), { proportion: 1, expand: true });
      this.resourceTexts[type] = createText(this, '0', metrics, 'body', {
        fontFamily: UI.FONT_DATA,
        fontStyle: 'bold',
        color,
      });
      line.add(this.resourceTexts[type]!, { align: 'right' });
      card.add(line, { expand: true });
    });
    return card;
  }

  private buildTabs(metrics: ReturnType<typeof getUiMetrics>, panelWidth: number): Phaser.GameObjects.GameObject {
    const row = this.rexUI.add.sizer({
      orientation: metrics.stacked ? 'y' : 'x',
      width: panelWidth - metrics.pad * 2,
      space: { item: metrics.gap },
    });
    const tabWidth = metrics.stacked
      ? panelWidth - metrics.pad * 2
      : Math.round((panelWidth - metrics.pad * 2 - metrics.gap) / 2);

    this.tabButtons = {
      units: createButton(this, metrics, 'UNITS', () => this.switchTab('units'), {
        variant: 'primary',
        width: tabWidth,
      }),
      buildings: createButton(this, metrics, 'BUILDINGS', () => this.switchTab('buildings'), {
        variant: 'secondary',
        width: tabWidth,
      }),
    };
    row.add(this.tabButtons.units.root, { proportion: metrics.stacked ? 0 : 1, expand: !metrics.stacked });
    row.add(this.tabButtons.buildings.root, { proportion: metrics.stacked ? 0 : 1, expand: !metrics.stacked });
    return row;
  }

  private buildListArea(
    metrics: ReturnType<typeof getUiMetrics>,
    panelWidth: number,
    panelHeight: number,
  ): Phaser.GameObjects.GameObject {
    const listHeight = Math.round(panelHeight * 0.44);
    const wrapper = this.rexUI.add.overlapSizer({
      width: panelWidth - metrics.pad * 2,
      height: listHeight,
    });

    this.unitPanel = this.buildUnitList(metrics, panelWidth - metrics.pad * 2, listHeight) as Phaser.GameObjects.GameObject & { setVisible(value: boolean): unknown };
    this.buildingPanel = this.buildBuildingList(metrics, panelWidth - metrics.pad * 2, listHeight) as Phaser.GameObjects.GameObject & { setVisible(value: boolean): unknown };
    wrapper.add(this.unitPanel, { key: 'units', expand: true, align: 'center' });
    wrapper.add(this.buildingPanel, { key: 'buildings', expand: true, align: 'center' });
    return wrapper;
  }

  private buildUnitList(metrics: ReturnType<typeof getUiMetrics>, width: number, height: number): Phaser.GameObjects.GameObject {
    const content = this.rexUI.add.sizer({
      orientation: 'y',
      width: width - metrics.pad * 2,
      space: { item: metrics.smallGap },
    });

    PRODUCTION_CATALOG.forEach((entry) => {
      const row = this.buildUnitRow(metrics, width - metrics.pad * 3, entry);
      content.add(row.container, { expand: true });
      this.unitRows.push(row.record);
    });

    return createScrollablePanel(this, metrics, width, height, content, UI.PANEL_ALT);
  }

  private buildBuildingList(metrics: ReturnType<typeof getUiMetrics>, width: number, height: number): Phaser.GameObjects.GameObject {
    const content = this.rexUI.add.sizer({
      orientation: 'y',
      width: width - metrics.pad * 2,
      space: { item: metrics.smallGap },
    });

    CITY_BUILDING_CATALOG.filter(def => def.ticks > 0).forEach((def) => {
      const row = this.buildBuildingRow(metrics, width - metrics.pad * 3, def);
      content.add(row.container, { expand: true });
      this.buildingRows.push(row.record);
    });

    const panel = createScrollablePanel(this, metrics, width, height, content, UI.PANEL_ALT);
    panel.setVisible(false);
    return panel;
  }

  private buildUnitRow(
    metrics: ReturnType<typeof getUiMetrics>,
    width: number,
    entry: CatalogEntry,
  ): { container: Phaser.GameObjects.GameObject; record: UnitRow } {
    const row = createPanelSizer(this, metrics, width, Math.round((metrics.compact ? 168 : 138) * metrics.scale), 'y', UI.PANEL);
    row.add(createText(this, entry.label, metrics, 'body', {
      fontStyle: 'bold',
      color: UI.WHITE,
    }));
    row.add(createText(this, entry.detail, metrics, 'caption', {
      color: UI.DIM,
      wordWrap: { width: width - metrics.pad * 2 },
    }));

    const meta = this.rexUI.add.sizer({
      orientation: metrics.compact ? 'y' : 'x',
      width: width - metrics.pad * 2,
      space: { item: metrics.smallGap },
    });
    const secs = (entry.ticks / TICK_RATE).toFixed(1);
    const costLabel = createText(this, formatCost(entry.cost as Record<string, number>), metrics, 'caption', {
      color: UI.DIM,
      fontFamily: UI.FONT_DATA,
    });
    const statsLabel = createText(this, `Time ${secs}s`, metrics, 'caption', {
      color: UI.DIM,
      fontFamily: UI.FONT_DATA,
    });
    meta.add(costLabel, { proportion: 1, expand: true });
    meta.add(statsLabel, { align: 'right' });
    row.add(meta, { expand: true });

    const footer = this.rexUI.add.sizer({
      orientation: metrics.compact ? 'y' : 'x',
      width: width - metrics.pad * 2,
      space: { item: metrics.smallGap },
    });
    const statusLabel = createText(this, '', metrics, 'caption', {
      color: UI.DIM,
      wordWrap: { width: width - metrics.pad * 4 },
    });
    const button = createButton(this, metrics, 'BUILD', () => { void this.startProduction(entry); }, {
      variant: 'primary',
      width: metrics.compact ? width - metrics.pad * 2 : Math.round(150 * metrics.scale),
      height: Math.round(metrics.buttonHeight * 0.82),
    });
    footer.add(statusLabel, { proportion: 1, expand: true });
    footer.add(button.root, { align: 'center' });
    row.add(footer, { expand: true });

    return {
      container: row,
      record: { entry, button, costLabel, statusLabel },
    };
  }

  private buildBuildingRow(
    metrics: ReturnType<typeof getUiMetrics>,
    width: number,
    def: CityBuildingDef,
  ): { container: Phaser.GameObjects.GameObject; record: BuildingRow } {
    const row = createPanelSizer(this, metrics, width, Math.round((metrics.compact ? 168 : 138) * metrics.scale), 'y', UI.PANEL);
    row.add(createText(this, def.label, metrics, 'body', {
      fontStyle: 'bold',
      color: UI.WHITE,
    }));
    row.add(createText(this, def.perks, metrics, 'caption', {
      color: UI.DIM,
      wordWrap: { width: width - metrics.pad * 2 },
    }));

    const meta = this.rexUI.add.sizer({
      orientation: metrics.compact ? 'y' : 'x',
      width: width - metrics.pad * 2,
      space: { item: metrics.smallGap },
    });
    const secs = (def.ticks / TICK_RATE).toFixed(1);
    const costLabel = createText(this, formatCost(def.cost as Record<string, number>), metrics, 'caption', {
      color: UI.DIM,
      fontFamily: UI.FONT_DATA,
    });
    const statsLabel = createText(this, `Time ${secs}s`, metrics, 'caption', {
      color: UI.DIM,
      fontFamily: UI.FONT_DATA,
    });
    meta.add(costLabel, { proportion: 1, expand: true });
    meta.add(statsLabel, { align: 'right' });
    row.add(meta, { expand: true });

    const footer = this.rexUI.add.sizer({
      orientation: metrics.compact ? 'y' : 'x',
      width: width - metrics.pad * 2,
      space: { item: metrics.smallGap },
    });
    const statusLabel = createText(this, '', metrics, 'caption', {
      color: UI.DIM,
      wordWrap: { width: width - metrics.pad * 4 },
    });
    const button = createButton(this, metrics, 'BUILD', () => { void this.buildCityBuilding(def); }, {
      variant: 'primary',
      width: metrics.compact ? width - metrics.pad * 2 : Math.round(150 * metrics.scale),
      height: Math.round(metrics.buttonHeight * 0.82),
    });
    footer.add(statusLabel, { proportion: 1, expand: true });
    footer.add(button.root, { align: 'center' });
    row.add(footer, { expand: true });

    return {
      container: row,
      record: { def, button, costLabel, statusLabel },
    };
  }

  private switchTab(tab: Tab): void {
    this.activeTab = tab;
    this.unitPanel.setVisible(tab === 'units');
    this.buildingPanel.setVisible(tab === 'buildings');

    this.tabButtons.units.background.setFillStyle(tab === 'units' ? UI.BTN_ACTIVE : UI.BTN);
    this.tabButtons.buildings.background.setFillStyle(tab === 'buildings' ? UI.BTN_ACTIVE : UI.BTN);
    this.tabButtons.units.text.setColor(tab === 'units' ? UI.WHITE : UI.LT);
    this.tabButtons.buildings.text.setColor(tab === 'buildings' ? UI.WHITE : UI.LT);
  }

  private refresh(): void {
    this.refreshProduction();
    this.refreshResources();
    this.refreshBuildButtons();
    this.switchTab(this.activeTab);
  }

  private async startProduction(entry: CatalogEntry): Promise<void> {
    const result = await this.networkAdapter.sendCommand({
      type: 'START_CITY_PRODUCTION',
      playerId: this.playerId,
      cityId: this.city.id,
      unitType: (entry.makeOrder() as UnitOrder).unitType,
      issuedAtTick: 0,
    });
    if (result.success) this.refresh();
  }

  private async buildCityBuilding(def: CityBuildingDef): Promise<void> {
    const result = await this.networkAdapter.sendCommand({
      type: 'BUILD_CITY_BUILDING',
      playerId: this.playerId,
      cityId: this.city.id,
      building: def.type,
      issuedAtTick: 0,
    });
    if (result.success) this.refresh();
  }

  private refreshProduction(): void {
    const order = this.city.getCurrentOrder();
    if (!order) {
      this.currentOrderLabel.setText('Idle');
      this.currentOrderLabel.setColor(UI.DIM);
      this.progressBar.width = 0;
      this.progressBar.displayWidth = 0;
      return;
    }

    this.currentOrderLabel.setText(`${order.label}  |  ${(order.ticksRemaining / TICK_RATE).toFixed(1)}s remaining`);
    this.currentOrderLabel.setColor(UI.GOLD_C);
    const pct = this.city.getProgressFraction();
    const width = Math.round(this.progressBg.width * pct);
    this.progressBar.width = width;
    this.progressBar.displayWidth = width;
  }

  private refreshResources(): void {
    const treasury = this.gameState.getNation(this.city.getOwnerId())?.getTreasury();
    if (!treasury) return;
    for (const [type, text] of Object.entries(this.resourceTexts)) {
      text?.setText(String(treasury.getAmount(type as ResourceType)));
    }
  }

  private refreshBuildButtons(): void {
    const nation = this.gameState.getNation(this.city.getOwnerId());
    const busy = this.city.getCurrentOrder() !== null;
    const treasury = nation?.getTreasury();

    const deposits = nation ? this.gameState.getNationActiveDeposits(nation.getId()) : new Set();
    for (const row of this.unitRows) {
      const canAfford = treasury?.hasResources(row.entry.cost) ?? false;
      const techsOk = row.entry.requiresTechs.every(t => nation?.hasResearched(t) ?? false);
      const buildingOk = !row.entry.requiresBuilding || this.city.hasBuilding(row.entry.requiresBuilding);
      const depositOk = !row.entry.requiresDeposit || deposits.has(row.entry.requiresDeposit);
      const enabled = !busy && canAfford && techsOk && buildingOk && depositOk;
      setButtonEnabled(row.button, enabled, 'primary');
      row.button.text.setText(techsOk && buildingOk && depositOk ? 'BUILD' : 'LOCKED');
      row.costLabel.setColor(canAfford ? UI.DIM : '#d19393');
      row.statusLabel.setText(this.getLockReasonForUnit(row.entry));
      row.statusLabel.setColor(enabled ? UI.DIM : '#d5a0a0');
    }

    for (const row of this.buildingRows) {
      const alreadyBuilt = this.city.hasBuilding(row.def.type);
      const techOk = !row.def.requiresTech || (nation?.hasResearched(row.def.requiresTech) ?? false);
      const canAfford = treasury?.hasResources(row.def.cost) ?? false;
      const enabled = !alreadyBuilt && !busy && techOk && canAfford;
      setButtonEnabled(row.button, enabled, 'primary');
      row.button.text.setText(alreadyBuilt ? 'BUILT' : techOk ? 'BUILD' : 'LOCKED');
      row.costLabel.setColor(canAfford ? UI.DIM : '#d19393');
      row.statusLabel.setText(this.getLockReasonForBuilding(row.def));
      row.statusLabel.setColor(enabled ? UI.DIM : '#d5a0a0');
    }
  }

  private getLockReasonForUnit(entry: CatalogEntry): string {
    const nation = this.gameState.getNation(this.city.getOwnerId());
    if (this.city.getCurrentOrder()) return 'City is already producing something.';
    const missing = entry.requiresTechs.filter(t => !nation?.hasResearched(t));
    if (missing.length) return `Requires research: ${missing.map(t => t.replace(/_/g, ' ')).join(', ')}.`;
    if (entry.requiresBuilding !== null && !this.city.hasBuilding(entry.requiresBuilding)) {
      return `Requires ${entry.requiresBuilding.replace(/_/g, ' ').toLowerCase()} in this city.`;
    }
    if (entry.requiresDeposit) {
      const deposits = nation ? this.gameState.getNationActiveDeposits(nation.getId()) : new Set();
      if (!deposits.has(entry.requiresDeposit)) {
        return `Requires active ${entry.requiresDeposit.replace(/_/g, ' ').toLowerCase()} deposit.`;
      }
    }
    if (!nation?.getTreasury().hasResources(entry.cost)) return 'Insufficient resources.';
    return 'Ready to queue.';
  }

  private getLockReasonForBuilding(def: CityBuildingDef): string {
    if (this.city.hasBuilding(def.type)) return 'Already built.';
    const nation = this.gameState.getNation(this.city.getOwnerId());
    if (this.city.getCurrentOrder()) return 'City is already producing something.';
    if (def.requiresTech !== null && !nation?.hasResearched(def.requiresTech)) {
      return `Requires research: ${def.requiresTech.replace(/_/g, ' ').toLowerCase()}.`;
    }
    if (!nation?.getTreasury().hasResources(def.cost)) return 'Insufficient resources.';
    return 'Ready to build.';
  }

  private close(): void {
    this.scene.stop('CityMenuScene');
  }
}
