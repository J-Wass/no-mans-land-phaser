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
import { CITY_BUILDING_CATALOG, CityBuildingType } from '@/systems/territory/CityBuilding';
import type { CityBuildingDef } from '@/systems/territory/CityBuilding';
import { ResourceType } from '@/systems/resources/ResourceType';
import { TICK_RATE } from '@/config/constants';
import { UI } from '@/config/uiTheme';
import { RESOURCE_EMOJI } from '@/utils/resourceIcons';
import {
  createButton,
  createPanelSizer,
  createScrollablePanel,
  createText,
  getUiMetrics,
  setButtonEnabled,
  type ButtonParts,
  type UiMetrics,
} from '@/utils/rexUiHelpers';
import { formatCost } from '@/utils/uiHelpers';

export interface CityMenuSceneData {
  city: City;
  gameState: GameState;
  networkAdapter: NetworkAdapter;
  eventBus: GameEventBus;
}

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
    const panelW = Math.min(900, Math.round(metrics.width * 0.88));
    const panelH = Math.min(780, Math.round(metrics.height * 0.92));

    this.add.rectangle(0, 0, metrics.width, metrics.height, UI.BG, 0.78)
      .setOrigin(0, 0).setInteractive();

    const root = createPanelSizer(this, metrics, panelW, panelH, 'y', UI.PANEL);
    root.add(this.buildHeader(metrics, panelW), { expand: true });
    root.add(this.buildCompactStatus(metrics, panelW), { expand: true });
    root.add(this.buildTabs(metrics, panelW), { expand: true });
    root.add(this.buildListArea(metrics, panelW, panelH), { proportion: 1, expand: true });
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

  private buildHeader(metrics: UiMetrics, panelWidth: number): Phaser.GameObjects.GameObject {
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

  /** Compact status bar: production on the left, resources on the right, all in one row. */
  private buildCompactStatus(metrics: UiMetrics, panelWidth: number): Phaser.GameObjects.GameObject {
    const inner = panelWidth - metrics.pad * 2;
    const sectionH = Math.round(88 * metrics.scale);
    const section = createPanelSizer(this, metrics, inner, sectionH, 'x', UI.PANEL_ALT);

    // Left: current order label + thin progress bar
    const prodW = Math.round(inner * 0.58);
    const prod = this.rexUI.add.sizer({ orientation: 'y', width: prodW, space: { item: metrics.smallGap } });
    this.currentOrderLabel = createText(this, 'Idle', metrics, 'caption', {
      color: UI.DIM, fontFamily: UI.FONT_DATA,
      wordWrap: { width: prodW - Math.round(84 * metrics.scale) - metrics.smallGap },
    });
    const cancelButton = createButton(this, metrics, 'CANCEL', () => { this.city.cancelOrder(); this.refresh(); }, {
      variant: 'warning', width: Math.round(80 * metrics.scale), height: Math.round(metrics.buttonHeight * 0.64),
    });
    const orderRow = this.rexUI.add.sizer({ orientation: 'x', space: { item: metrics.smallGap } });
    orderRow.add(this.currentOrderLabel, { proportion: 1, expand: true });
    orderRow.add(cancelButton.root, { align: 'center' });
    prod.add(orderRow, { expand: true });

    const barW = prodW - metrics.pad;
    const barH = Math.max(8, Math.round(8 * metrics.scale));
    this.progressBg = this.add.rectangle(-barW / 2, 0, barW, barH, UI.SURFACE)
      .setOrigin(0, 0.5).setStrokeStyle(1, UI.ACCENT, 0.7);
    this.progressBar = this.add.rectangle(-barW / 2, 0, 0, barH - 2, UI.ACCENT_SOFT).setOrigin(0, 0.5);
    const barContainer = this.add.container(0, 0, [this.progressBg, this.progressBar]);
    barContainer.setSize(barW, barH);
    prod.add(barContainer, { expand: true, align: 'left' });
    section.add(prod, { proportion: 1, expand: true });

    // Right: resources in a 2×2 grid
    const resW = inner - prodW - metrics.gap;
    const resGrid = this.rexUI.add.sizer({ orientation: 'y', width: resW, space: { item: 4 } });
    const pairs = [
      [{ type: ResourceType.FOOD, color: '#8ee09d' }, { type: ResourceType.RAW_MATERIAL, color: '#f0bf7a' }],
      [{ type: ResourceType.GOLD, color: UI.GOLD_C  }, { type: ResourceType.RESEARCH,     color: '#8fb8ff' }],
    ] as const;
    for (const pair of pairs) {
      const row = this.rexUI.add.sizer({ orientation: 'x', width: resW, space: { item: metrics.smallGap } });
      for (const { type, color } of pair) {
        const cell = this.rexUI.add.sizer({ orientation: 'x', space: { item: 3 } });
        cell.add(createText(this, RESOURCE_EMOJI[type], metrics, 'caption', { color }));
        this.resourceTexts[type] = createText(this, '0', metrics, 'caption', { fontFamily: UI.FONT_DATA, fontStyle: 'bold', color });
        cell.add(this.resourceTexts[type]!);
        row.add(cell, { proportion: 1 });
      }
      resGrid.add(row, { expand: true });
    }
    section.add(resGrid, { align: 'center' });
    return section;
  }

  private buildTabs(metrics: UiMetrics, panelWidth: number): Phaser.GameObjects.GameObject {
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
    metrics: UiMetrics,
    panelWidth: number,
    panelHeight: number,
  ): Phaser.GameObjects.GameObject {
    const listHeight = Math.round(panelHeight * 0.52);
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

  private buildUnitList(metrics: UiMetrics, width: number, height: number): Phaser.GameObjects.GameObject {
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

  private buildBuildingList(metrics: UiMetrics, width: number, height: number): Phaser.GameObjects.GameObject {
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
    metrics: UiMetrics,
    width: number,
    entry: CatalogEntry,
  ): { container: Phaser.GameObjects.GameObject; record: UnitRow } {
    const rowH = Math.round(72 * metrics.scale);
    const row = this.rexUI.add.sizer({
      orientation: 'x',
      width,
      height: rowH,
      space: { item: metrics.smallGap, left: metrics.smallGap, right: metrics.smallGap, top: metrics.smallGap, bottom: metrics.smallGap },
    });

    const nameCol = this.rexUI.add.sizer({ orientation: 'y', space: { item: 2 } });
    nameCol.add(createText(this, entry.label, metrics, 'body', { fontStyle: 'bold', color: UI.WHITE }));
    const secs = (entry.ticks / TICK_RATE).toFixed(1);
    const costLabel = createText(this, `${formatCost(entry.cost as Record<string, number>)}  ${secs}s`, metrics, 'caption', {
      color: UI.DIM, fontFamily: UI.FONT_DATA,
    });
    nameCol.add(costLabel);
    const statusLabel = createText(this, '', metrics, 'caption', {
      color: UI.DIM,
      wordWrap: { width: width - Math.round(180 * metrics.scale) },
    });
    nameCol.add(statusLabel);

    const button = createButton(this, metrics, 'BUILD', () => { void this.startProduction(entry); }, {
      variant: 'primary',
      width: Math.round(120 * metrics.scale),
      height: Math.round(metrics.buttonHeight * 0.78),
    });

    row.add(nameCol, { proportion: 1, expand: true });
    row.add(button.root, { align: 'center' });

    return {
      container: row,
      record: { entry, button, costLabel, statusLabel },
    };
  }

  private buildBuildingRow(
    metrics: UiMetrics,
    width: number,
    def: CityBuildingDef,
  ): { container: Phaser.GameObjects.GameObject; record: BuildingRow } {
    const rowH = Math.round(72 * metrics.scale);
    const row = this.rexUI.add.sizer({
      orientation: 'x',
      width,
      height: rowH,
      space: { item: metrics.smallGap, left: metrics.smallGap, right: metrics.smallGap, top: metrics.smallGap, bottom: metrics.smallGap },
    });

    const nameCol = this.rexUI.add.sizer({ orientation: 'y', space: { item: 2 } });
    nameCol.add(createText(this, def.label, metrics, 'body', { fontStyle: 'bold', color: UI.WHITE }));
    const secs = (def.ticks / TICK_RATE).toFixed(1);
    const costLabel = createText(this, `${formatCost(def.cost as Record<string, number>)}  ${secs}s`, metrics, 'caption', {
      color: UI.DIM, fontFamily: UI.FONT_DATA,
    });
    nameCol.add(costLabel);
    const statusLabel = createText(this, '', metrics, 'caption', {
      color: UI.DIM,
      wordWrap: { width: width - Math.round(180 * metrics.scale) },
    });
    nameCol.add(statusLabel);

    const button = createButton(this, metrics, 'BUILD', () => { void this.buildCityBuilding(def); }, {
      variant: 'primary',
      width: Math.round(120 * metrics.scale),
      height: Math.round(metrics.buttonHeight * 0.78),
    });

    row.add(nameCol, { proportion: 1, expand: true });
    row.add(button.root, { align: 'center' });

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
      const currentLevel = this.city.getBuildingLevel(row.def.type);
      const canUpgrade = row.def.type === CityBuildingType.WALLS && alreadyBuilt && currentLevel < row.def.maxLevel;
      const techOk = !row.def.requiresTech || (nation?.hasResearched(row.def.requiresTech) ?? false);
      const cost = canUpgrade ? row.def.upgradeCost : row.def.cost;
      const canAfford = treasury?.hasResources(cost) ?? false;
      const enabled = !busy && techOk && canAfford && (!alreadyBuilt || canUpgrade);
      setButtonEnabled(row.button, enabled, 'primary');
      const levelSuffix = row.def.maxLevel > 1 && alreadyBuilt ? ` ${currentLevel}/${row.def.maxLevel}` : '';
      row.button.text.setText(canUpgrade ? 'UPGRADE' : alreadyBuilt ? `BUILT${levelSuffix}` : techOk ? 'BUILD' : 'LOCKED');
      row.costLabel.setText(formatCost(cost as Record<string, number>));
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
    if (this.city.hasBuilding(def.type)) {
      const level = this.city.getBuildingLevel(def.type);
      if (def.type !== CityBuildingType.WALLS || level >= def.maxLevel) return 'Already built.';
      if (this.city.getCurrentOrder()) return 'City is already producing something.';
      const nation = this.gameState.getNation(this.city.getOwnerId());
      if (!nation?.getTreasury().hasResources(def.upgradeCost)) return 'Insufficient resources.';
      return `Ready to upgrade to level ${level + 1}.`;
    }
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
