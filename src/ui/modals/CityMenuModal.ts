import type { PhaserUIBridge } from '@/ui/PhaserUIBridge';
import type { City } from '@/entities/cities/City';
import { PRODUCTION_CATALOG } from '@/systems/production/ProductionCatalog';
import type { CatalogEntry } from '@/systems/production/ProductionCatalog';
import { CITY_BUILDING_CATALOG } from '@/systems/territory/CityBuilding';
import type { CityBuildingDef } from '@/systems/territory/CityBuilding';
import type { UnitOrder } from '@/systems/production/ProductionOrder';
import { CITY_QUEUE_MAX } from '@/entities/cities/City';
import { ResourceType } from '@/systems/resources/ResourceType';
import { RESOURCE_EMOJI } from '@/utils/resourceIcons';
import { TICK_RATE } from '@/config/constants';
import { formatCost } from '@/utils/uiHelpers';
import { unitFlavorById } from '@/config/flavorText';
import { EventSubscriptions } from '@/systems/events/EventSubscriptions';
import { MODAL_STRINGS } from '@/i18n/modals';

const STR = MODAL_STRINGS.cityMenu;

type Tab = 'units' | 'buildings';

export class CityMenuModal {
  private escHandler: (e: KeyboardEvent) => void;
  private activeTab: Tab = 'units';
  private unitPanel!: HTMLElement;
  private buildingPanel!: HTMLElement;
  private tabBtns!: Record<Tab, HTMLButtonElement>;
  private orderLabel!: HTMLElement;
  private progressFill!: HTMLElement;
  private queueList!: HTMLElement;
  private resourceTexts = new Map<ResourceType, HTMLElement>();
  private unitRows: Array<{ entry: CatalogEntry; btn: HTMLButtonElement; costLbl: HTMLElement; statusLbl: HTMLElement }> = [];
  private buildingRows: Array<{ def: CityBuildingDef; btn: HTMLButtonElement; removeBtn: HTMLButtonElement; costLbl: HTMLElement; statusLbl: HTMLElement }> = [];
  private razeBtn?: HTMLButtonElement;
  private rafId = 0;
  private subs?: EventSubscriptions;

  constructor(private bridge: PhaserUIBridge, private city: City) {
    this.escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };
  }

  render(): HTMLElement {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const panel = document.createElement('div');
    panel.className = 'modal-panel wide';
    panel.style.maxHeight = '92vh';

    panel.appendChild(this.buildHeader());
    panel.appendChild(this.buildStatus());
    panel.appendChild(this.buildTabs());

    const listWrap = document.createElement('div');
    listWrap.className = 'scrollable';

    this.unitPanel = this.buildUnitList();
    this.buildingPanel = this.buildBuildingList();
    this.buildingPanel.style.display = 'none';

    listWrap.appendChild(this.unitPanel);
    listWrap.appendChild(this.buildingPanel);
    panel.appendChild(listWrap);

    backdrop.appendChild(panel);
    document.addEventListener('keydown', this.escHandler);
    this.subscribeEvents();
    this.refresh();
    this.scheduleUpdate();
    return backdrop;
  }

  private buildHeader(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row spread';

    const info = document.createElement('div');
    info.className = 'col tight grow';

    const name = document.createElement('div');
    name.className = 'text-heading text-bold';
    name.textContent = this.city.getName();

    const nation = this.bridge.gameState.getNation(this.city.getOwnerId());
    const owner = document.createElement('div');
    owner.className = 'text-body text-dim text-mono';
    owner.textContent = nation?.getName() ?? STR.unknownOwner;

    info.appendChild(name);
    info.appendChild(owner);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-danger btn-sm';
    closeBtn.textContent = STR.close;
    closeBtn.addEventListener('click', () => this.close());

    row.appendChild(info);
    row.appendChild(closeBtn);
    return row;
  }

  private buildStatus(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'panel-alt';

    const inner = document.createElement('div');
    inner.className = 'row';
    inner.style.alignItems = 'flex-start';

    // Production side
    const prodSide = document.createElement('div');
    prodSide.className = 'col tight grow';

    const orderRow = document.createElement('div');
    orderRow.className = 'row spread';

    this.orderLabel = document.createElement('div');
    this.orderLabel.className = 'text-caption text-mono grow text-wrap';
    this.orderLabel.textContent = STR.idle;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-warning btn-sm';
    cancelBtn.textContent = STR.cancel;
    cancelBtn.addEventListener('click', () => { void this.cancelProduction(); });

    orderRow.appendChild(this.orderLabel);
    orderRow.appendChild(cancelBtn);

    const track = document.createElement('div');
    track.className = 'progress-track';
    this.progressFill = document.createElement('div');
    this.progressFill.className = 'progress-fill';
    this.progressFill.style.width = '0%';
    track.appendChild(this.progressFill);

    prodSide.appendChild(orderRow);
    prodSide.appendChild(track);

    this.queueList = document.createElement('div');
    this.queueList.className = 'col tight';
    this.queueList.style.marginTop = '4px';
    prodSide.appendChild(this.queueList);

    // Resources side
    const resGrid = document.createElement('div');
    resGrid.className = 'col tight';
    resGrid.style.flexShrink = '0';

    const pairs: Array<Array<{ type: ResourceType; color: string }>> = [
      [{ type: ResourceType.FOOD, color: '#8ee09d' }, { type: ResourceType.RAW_MATERIAL, color: '#f0bf7a' }],
      [{ type: ResourceType.GOLD, color: 'var(--color-gold)' }, { type: ResourceType.RESEARCH, color: '#8fb8ff' }],
    ];
    for (const pair of pairs) {
      const pairRow = document.createElement('div');
      pairRow.className = 'row tight';
      for (const { type, color } of pair) {
        const cell = document.createElement('div');
        cell.className = 'row tight';
        cell.style.minWidth = '80px';

        const emoji = document.createElement('span');
        emoji.textContent = RESOURCE_EMOJI[type];
        emoji.style.color = color;

        const val = document.createElement('span');
        val.className = 'text-caption text-mono text-bold';
        val.style.color = color;
        val.textContent = '0';
        this.resourceTexts.set(type, val);

        cell.appendChild(emoji);
        cell.appendChild(val);
        pairRow.appendChild(cell);
      }
      resGrid.appendChild(pairRow);
    }

    inner.appendChild(prodSide);
    inner.appendChild(resGrid);
    section.appendChild(inner);
    return section;
  }

  private buildTabs(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tabs';

    const unitBtn = document.createElement('button');
    unitBtn.className = 'btn btn-primary tab';
    unitBtn.textContent = STR.tabUnits;
    unitBtn.addEventListener('click', () => this.switchTab('units'));

    const bldgBtn = document.createElement('button');
    bldgBtn.className = 'btn btn-secondary tab';
    bldgBtn.textContent = STR.tabBuildings;
    bldgBtn.addEventListener('click', () => this.switchTab('buildings'));

    this.tabBtns = { units: unitBtn, buildings: bldgBtn };
    row.appendChild(unitBtn);
    row.appendChild(bldgBtn);
    return row;
  }

  private buildUnitList(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'col tight';
    wrap.dataset['tutorial'] = 'produce-unit';

    for (const entry of PRODUCTION_CATALOG) {
      const { row, record } = this.buildUnitRow(entry);
      this.unitRows.push(record);
      wrap.appendChild(row);
    }
    return wrap;
  }

  private buildBuildingList(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'col tight';
    wrap.dataset['tutorial'] = 'build-building';

    wrap.appendChild(this.buildRazeRow());

    for (const def of CITY_BUILDING_CATALOG.filter(d => d.ticks > 0)) {
      const { row, record } = this.buildBuildingRow(def);
      this.buildingRows.push(record);
      wrap.appendChild(row);
    }
    return wrap;
  }

  /** Top-of-list control to toggle razing the whole city (random level loss every 5s). */
  private buildRazeRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'list-row';

    const info = document.createElement('div');
    info.className = 'col tight grow';

    const name = document.createElement('div');
    name.className = 'text-label text-bold';
    name.textContent = STR.razeName;

    const desc = document.createElement('div');
    desc.className = 'text-caption text-dim text-wrap';
    desc.style.fontSize = '10px';
    desc.textContent = STR.razeDesc;

    info.appendChild(name);
    info.appendChild(desc);

    const btn = document.createElement('button');
    btn.className = 'btn btn-danger btn-sm';
    btn.textContent = STR.raze;
    btn.addEventListener('click', () => { void this.toggleRaze(); });
    this.razeBtn = btn;

    row.appendChild(info);
    row.appendChild(btn);
    return row;
  }

  private buildUnitRow(entry: CatalogEntry): { row: HTMLElement; record: { entry: CatalogEntry; btn: HTMLButtonElement; costLbl: HTMLElement; statusLbl: HTMLElement } } {
    const row = document.createElement('div');
    row.className = 'list-row';
    const flavor = unitFlavorById(entry.id);
    if (flavor) row.title = flavor; // hover quote

    const info = document.createElement('div');
    info.className = 'col tight grow';

    const name = document.createElement('div');
    name.className = 'text-label text-bold';
    name.textContent = entry.label;

    const costLbl = document.createElement('div');
    costLbl.className = 'text-caption text-mono';
    costLbl.style.color = 'var(--color-dim)';
    const secs = (entry.ticks / TICK_RATE).toFixed(1);
    costLbl.textContent = STR.unitCostLine(formatCost(entry.cost as Record<string, number>), secs);

    const detailLbl = document.createElement('div');
    detailLbl.className = 'text-caption text-wrap';
    detailLbl.style.color = 'var(--color-dim)';
    detailLbl.textContent = entry.detail;

    const statusLbl = document.createElement('div');
    statusLbl.className = 'text-caption text-wrap';
    statusLbl.style.color = 'var(--color-dim)';

    info.appendChild(name);
    info.appendChild(costLbl);
    info.appendChild(detailLbl);
    info.appendChild(statusLbl);

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = STR.build;
    btn.addEventListener('click', () => void this.startProduction(entry));

    row.appendChild(info);
    row.appendChild(btn);

    return { row, record: { entry, btn, costLbl, statusLbl } };
  }

  private buildBuildingRow(def: CityBuildingDef): { row: HTMLElement; record: { def: CityBuildingDef; btn: HTMLButtonElement; removeBtn: HTMLButtonElement; costLbl: HTMLElement; statusLbl: HTMLElement } } {
    const row = document.createElement('div');
    row.className = 'list-row';

    const info = document.createElement('div');
    info.className = 'col tight grow';

    const name = document.createElement('div');
    name.className = 'text-label text-bold';
    name.textContent = def.label;

    const perk = document.createElement('div');
    perk.className = 'text-caption text-dim text-wrap';
    perk.style.fontSize = '10px';
    perk.textContent = def.perks;

    const costLbl = document.createElement('div');
    costLbl.className = 'text-caption text-mono';
    costLbl.style.color = 'var(--color-dim)';
    const secs = (def.ticks / TICK_RATE).toFixed(1);
    costLbl.textContent = STR.unitCostLine(formatCost(def.cost as Record<string, number>), secs);

    const statusLbl = document.createElement('div');
    statusLbl.className = 'text-caption text-wrap';
    statusLbl.style.color = 'var(--color-dim)';

    info.appendChild(name);
    info.appendChild(perk);
    info.appendChild(costLbl);
    info.appendChild(statusLbl);

    const actions = document.createElement('div');
    actions.className = 'col tight';
    actions.style.flexShrink = '0';

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = STR.build;
    btn.addEventListener('click', () => void this.buildCityBuilding(def));

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-warning btn-sm';
    removeBtn.textContent = STR.removeLevel;
    removeBtn.title = STR.removeLevelTitle;
    removeBtn.addEventListener('click', () => { void this.removeBuildingLevel(def); });

    actions.appendChild(btn);
    actions.appendChild(removeBtn);

    row.appendChild(info);
    row.appendChild(actions);

    return { row, record: { def, btn, removeBtn, costLbl, statusLbl } };
  }

  private switchTab(tab: Tab): void {
    this.activeTab = tab;
    this.unitPanel.style.display = tab === 'units' ? 'flex' : 'none';
    this.buildingPanel.style.display = tab === 'buildings' ? 'flex' : 'none';
    this.tabBtns.units.className = `btn tab ${tab === 'units' ? 'btn-primary' : 'btn-secondary'}`;
    this.tabBtns.buildings.className = `btn tab ${tab === 'buildings' ? 'btn-primary' : 'btn-secondary'}`;
  }

  private refresh(): void {
    this.refreshBuildButtons();
    this.switchTab(this.activeTab);
  }

  private scheduleUpdate(): void {
    const tick = () => {
      this.updateProduction();
      this.updateResources();
      this.refreshBuildButtons();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private updateProduction(): void {
    const order = this.city.getCurrentOrder();
    if (!order) {
      this.orderLabel.textContent = STR.idle;
      this.orderLabel.style.color = 'var(--color-dim)';
      this.progressFill.style.width = '0%';
    } else {
      this.orderLabel.textContent = STR.orderProgress(order.label, (order.ticksRemaining / TICK_RATE).toFixed(1));
      this.orderLabel.style.color = 'var(--color-gold)';
      this.progressFill.style.width = `${(this.city.getProgressFraction() * 100).toFixed(1)}%`;
    }

    // Queue items
    this.queueList.innerHTML = '';
    const queue = this.city.getQueue();
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]!;
      const row = document.createElement('div');
      row.className = 'row spread';
      row.style.fontSize = '11px';
      row.style.color = 'var(--color-dim)';
      row.style.marginTop = '2px';

      const lbl = document.createElement('span');
      lbl.className = 'text-mono';
      lbl.textContent = STR.queueItem(i + 1, item.label, (item.ticksTotal / TICK_RATE).toFixed(1));

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-warning btn-sm';
      cancelBtn.style.padding = '0 6px';
      cancelBtn.style.fontSize = '10px';
      cancelBtn.textContent = STR.queueCancel;
      const idx = i;
      cancelBtn.addEventListener('click', () => { void this.cancelProduction(idx); });

      row.appendChild(lbl);
      row.appendChild(cancelBtn);
      this.queueList.appendChild(row);
    }
  }

  private updateResources(): void {
    const treasury = this.bridge.gameState.getNation(this.city.getOwnerId())?.getTreasury();
    if (!treasury) return;
    for (const [type, el] of this.resourceTexts) {
      el.textContent = String(treasury.getAmount(type));
    }
  }

  private refreshBuildButtons(): void {
    // Sandbox bypasses tech/deposit/cost checks server-side (CommandProcessor
    // — see the `!this.sandboxMode` guards in handleStartCityProduction /
    // handleBuildCityBuilding) but NOT the building-prerequisite or
    // queue-full checks. The UI must mirror that exactly, or sandbox players
    // can't click buttons that would actually succeed.
    const isSandbox = this.bridge.setup.gameMode === 'sandbox';
    const nation = this.bridge.gameState.getNation(this.city.getOwnerId());
    const busy      = this.city.getCurrentOrder() !== null;
    const queueFull = this.city.isQueueFull();
    const treasury  = nation?.getTreasury();
    const deposits  = nation ? this.bridge.gameState.getNationActiveDeposits(nation.getId()) : new Set();

    for (const row of this.unitRows) {
      const canAfford   = isSandbox || (treasury?.hasResources(row.entry.cost) ?? false);
      const techsOk     = isSandbox || row.entry.requiresTechs.every(t => nation?.hasResearched(t) ?? false);
      const buildingOk  = !row.entry.requiresBuilding
        || this.city.getBuildingLevel(row.entry.requiresBuilding) >= row.entry.requiresBuildingLevel;
      const depositOk   = isSandbox || ((!row.entry.requiresDeposit || deposits.has(row.entry.requiresDeposit))
        && (!row.entry.requiresAnyDeposit || row.entry.requiresAnyDeposit.some(d => deposits.has(d))));
      const enabled     = !queueFull && canAfford && techsOk && buildingOk && depositOk;

      row.btn.disabled    = !enabled;
      row.btn.textContent = !techsOk || !buildingOk || !depositOk ? STR.locked
        : queueFull ? STR.full
        : busy ? STR.queue
        : STR.build;
      row.costLbl.style.color = canAfford ? 'var(--color-dim)' : '#d19393';
      row.statusLbl.textContent = this.getLockReasonForUnit(row.entry);
      row.statusLbl.style.color = enabled ? 'var(--color-dim)' : '#d5a0a0';
    }

    for (const row of this.buildingRows) {
      const alreadyBuilt = this.city.hasBuilding(row.def.type);
      const currentLevel = this.city.getBuildingLevel(row.def.type);
      const canUpgrade   = alreadyBuilt && currentLevel < row.def.maxLevel;
      const techOk       = isSandbox || !row.def.requiresTech || (nation?.hasResearched(row.def.requiresTech) ?? false);
      const cost         = canUpgrade ? row.def.upgradeCost : row.def.cost;
      const canAfford    = isSandbox || (treasury?.hasResources(cost) ?? false);
      const enabled      = !queueFull && techOk && canAfford && (!alreadyBuilt || canUpgrade);

      row.btn.disabled = !enabled;
      const levelSuffix = row.def.maxLevel > 1 && alreadyBuilt ? STR.levelSuffix(currentLevel, row.def.maxLevel) : '';
      row.btn.textContent = canUpgrade
        ? (queueFull ? STR.full : busy ? STR.queue : STR.upgrade)
        : alreadyBuilt ? STR.built(levelSuffix)
        : techOk ? (queueFull ? STR.full : busy ? STR.queue : STR.build)
        : STR.locked;
      row.costLbl.textContent = formatCost(cost as Record<string, number>);
      row.costLbl.style.color = canAfford ? 'var(--color-dim)' : '#d19393';
      row.statusLbl.textContent = this.getLockReasonForBuilding(row.def);
      row.statusLbl.style.color = enabled ? 'var(--color-dim)' : '#d5a0a0';

      // Remove-one-level control: only for built buildings; shows the 5s countdown while pending.
      const pending = this.city.getPendingRemoval();
      const removalPending = pending?.building === row.def.type;
      row.removeBtn.style.display = alreadyBuilt ? '' : 'none';
      row.removeBtn.disabled = !alreadyBuilt || removalPending;
      row.removeBtn.textContent = removalPending
        ? STR.removeLevelPending((pending!.ticksRemaining / TICK_RATE).toFixed(0))
        : STR.removeLevel;
    }

    if (this.razeBtn) {
      const razing = this.city.isRazing();
      this.razeBtn.textContent = razing ? STR.stop : STR.raze;
      this.razeBtn.className = `btn btn-sm ${razing ? 'btn-warning' : 'btn-danger'}`;
    }
  }

  private getLockReasonForUnit(entry: CatalogEntry): string {
    const isSandbox = this.bridge.setup.gameMode === 'sandbox';
    const nation = this.bridge.gameState.getNation(this.city.getOwnerId());
    if (this.city.isQueueFull()) return STR.queueFull(CITY_QUEUE_MAX);
    if (!isSandbox) {
      const missing = entry.requiresTechs.filter(t => !nation?.hasResearched(t));
      if (missing.length) return STR.requiresResearch(missing.map(t => t.replace(/_/g, ' ')).join(', '));
    }
    if (entry.requiresBuilding !== null) {
      const lvl = this.city.getBuildingLevel(entry.requiresBuilding);
      const name = entry.requiresBuilding.replace(/_/g, ' ').toLowerCase();
      if (lvl <= 0) return STR.requiresBuildingInCity(name);
      if (lvl < entry.requiresBuildingLevel) return STR.requiresBuildingLevel(name, entry.requiresBuildingLevel);
    }
    if (!isSandbox) {
      if (entry.requiresDeposit) {
        const deposits = nation ? this.bridge.gameState.getNationActiveDeposits(nation.getId()) : new Set();
        if (!deposits.has(entry.requiresDeposit))
          return STR.requiresDeposit(entry.requiresDeposit.replace(/_/g, ' ').toLowerCase());
      }
      if (entry.requiresAnyDeposit) {
        const deposits = nation ? this.bridge.gameState.getNationActiveDeposits(nation.getId()) : new Set();
        if (!entry.requiresAnyDeposit.some(d => deposits.has(d)))
          return STR.requiresAnyDeposit(entry.requiresAnyDeposit.map(d => d.replace(/_/g, ' ').toLowerCase()).join(' / '));
      }
      if (!nation?.getTreasury().hasResources(entry.cost)) return STR.insufficientResources;
    }
    return STR.readyToQueue;
  }

  private getLockReasonForBuilding(def: CityBuildingDef): string {
    const isSandbox = this.bridge.setup.gameMode === 'sandbox';
    if (this.city.isQueueFull()) return STR.queueFull(CITY_QUEUE_MAX);
    if (this.city.hasBuilding(def.type)) {
      const level = this.city.getBuildingLevel(def.type);
      if (level >= def.maxLevel) return def.maxLevel > 1 ? STR.alreadyAtMaxLevel : STR.alreadyBuilt;
      const nation = this.bridge.gameState.getNation(this.city.getOwnerId());
      if (!isSandbox && !nation?.getTreasury().hasResources(def.upgradeCost)) return STR.insufficientResources;
      return STR.readyToUpgradeToLevel(level + 1);
    }
    const nation = this.bridge.gameState.getNation(this.city.getOwnerId());
    if (!isSandbox) {
      if (def.requiresTech !== null && !nation?.hasResearched(def.requiresTech))
        return STR.requiresResearchBuilding(def.requiresTech.replace(/_/g, ' ').toLowerCase());
      if (!nation?.getTreasury().hasResources(def.cost)) return STR.insufficientResources;
    }
    return STR.readyToBuild;
  }

  private async startProduction(entry: CatalogEntry): Promise<void> {
    const lp = this.bridge.gameState.getLocalPlayer();
    if (!lp) return;
    const result = await this.bridge.networkAdapter.sendCommand({
      type: 'START_CITY_PRODUCTION',
      playerId: lp.getId(),
      cityId: this.city.id,
      unitType: (entry.makeOrder() as UnitOrder).unitType,
      issuedAtTick: 0,
    });
    if (result.success) this.refresh();
  }

  private async buildCityBuilding(def: CityBuildingDef): Promise<void> {
    const lp = this.bridge.gameState.getLocalPlayer();
    if (!lp) return;
    const result = await this.bridge.networkAdapter.sendCommand({
      type: 'BUILD_CITY_BUILDING',
      playerId: lp.getId(),
      cityId: this.city.id,
      building: def.type,
      issuedAtTick: 0,
    });
    if (result.success) this.refresh();
  }

  private async toggleRaze(): Promise<void> {
    const lp = this.bridge.gameState.getLocalPlayer();
    if (!lp) return;
    const result = await this.bridge.networkAdapter.sendCommand({
      type: 'RAZE_CITY',
      playerId: lp.getId(),
      cityId: this.city.id,
      enabled: !this.city.isRazing(),
      issuedAtTick: 0,
    });
    if (result.success) this.refresh();
  }

  private async removeBuildingLevel(def: CityBuildingDef): Promise<void> {
    const lp = this.bridge.gameState.getLocalPlayer();
    if (!lp) return;
    const result = await this.bridge.networkAdapter.sendCommand({
      type: 'REMOVE_CITY_BUILDING_LEVEL',
      playerId: lp.getId(),
      cityId: this.city.id,
      building: def.type,
      issuedAtTick: 0,
    });
    if (result.success) this.refresh();
  }

  /** Cancel the active order, or a queued item when `queueIndex` is given. */
  private async cancelProduction(queueIndex?: number): Promise<void> {
    const lp = this.bridge.gameState.getLocalPlayer();
    if (!lp) return;
    const result = await this.bridge.networkAdapter.sendCommand({
      type: 'CANCEL_CITY_PRODUCTION',
      playerId: lp.getId(),
      cityId: this.city.id,
      ...(queueIndex !== undefined ? { queueIndex } : {}),
      issuedAtTick: 0,
    });
    if (result.success) this.refresh();
  }

  private subscribeEvents(): void {
    const onRefresh = () => this.refresh();
    this.subs = new EventSubscriptions(this.bridge.eventBus);
    this.subs.on('city:unit-spawned',       onRefresh);
    this.subs.on('city:building-built',      onRefresh);
    this.subs.on('city:buildings-changed',   onRefresh);
    this.subs.on('city:production-complete', onRefresh);
    this.subs.on('nation:research-complete', onRefresh);
  }

  private close(): void {
    this.destroy();
    this.bridge.closeCityMenu();
  }

  destroy(): void {
    document.removeEventListener('keydown', this.escHandler);
    cancelAnimationFrame(this.rafId);
    this.subs?.disposeAll();
  }
}
