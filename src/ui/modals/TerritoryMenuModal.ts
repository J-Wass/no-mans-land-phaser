import type { PhaserUIBridge } from '@/ui/PhaserUIBridge';
import type { GridCoordinates } from '@/types/common';
import { TERRITORY_BUILDING_CATALOG, BUILDING_MAP_ICON, TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import type { TerritoryBuildingDef } from '@/systems/territory/TerritoryBuilding';
import { MAX_WALLS_LEVEL, TerrainType } from '@/systems/grid/Territory';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import { formatCost } from '@/utils/uiHelpers';

const MINE_TYPES = new Set([
  TerritoryBuildingType.COPPER_MINE,
  TerritoryBuildingType.IRON_MINE,
  TerritoryBuildingType.FIRE_GLASS_MINE,
  TerritoryBuildingType.MANA_MINE,
]);
const MINE_DEPOSIT_MATCH: Partial<Record<TerritoryBuildingType, TerritoryResourceType>> = {
  [TerritoryBuildingType.COPPER_MINE]:     TerritoryResourceType.COPPER,
  [TerritoryBuildingType.IRON_MINE]:       TerritoryResourceType.IRON,
  [TerritoryBuildingType.FIRE_GLASS_MINE]: TerritoryResourceType.FIRE_GLASS,
};
const MANA_DEPOSITS = new Set([
  TerritoryResourceType.WATER_MANA, TerritoryResourceType.FIRE_MANA,
  TerritoryResourceType.LIGHTNING_MANA, TerritoryResourceType.EARTH_MANA,
  TerritoryResourceType.AIR_MANA, TerritoryResourceType.SHADOW_MANA,
]);
const DEPOSIT_LABEL: Record<TerritoryResourceType, string> = {
  [TerritoryResourceType.COPPER]:         '⊛ Copper',
  [TerritoryResourceType.IRON]:           '⊗ Iron',
  [TerritoryResourceType.FIRE_GLASS]:     '◈ Fire Glass',
  [TerritoryResourceType.SILVER]:         '◇ Silver',
  [TerritoryResourceType.GOLD_DEPOSIT]:   '◆ Gold',
  [TerritoryResourceType.WATER_MANA]:     '~ Water Mana',
  [TerritoryResourceType.FIRE_MANA]:      '▲ Fire Mana',
  [TerritoryResourceType.LIGHTNING_MANA]: '⚡ Lightning',
  [TerritoryResourceType.EARTH_MANA]:     '◉ Earth Mana',
  [TerritoryResourceType.AIR_MANA]:       '≋ Air Mana',
  [TerritoryResourceType.SHADOW_MANA]:    '◐ Shadow',
};

type RowRecord = {
  def: TerritoryBuildingDef;
  btn: HTMLButtonElement;
  btnText: HTMLElement;
  costLbl: HTMLElement;
  levelLbl: HTMLElement | null;
  action: 'build' | 'upgrade';
};

export class TerritoryMenuModal {
  private escHandler: (e: KeyboardEvent) => void;
  private buildingRows: RowRecord[] = [];
  private feedbackEl!: HTMLElement;
  private feedbackTimer = 0;

  constructor(private bridge: PhaserUIBridge, private position: GridCoordinates) {
    this.escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };
  }

  render(): HTMLElement {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const panel = document.createElement('div');
    panel.className = 'modal-panel medium';
    panel.style.maxHeight = '88vh';

    const territory = this.bridge.gameState.getGrid().getTerritory(this.position);
    const ownerId = territory?.getControllingNation() ?? null;
    const nation  = ownerId ? this.bridge.gameState.getNation(ownerId) : null;
    const terrain = territory?.getTerrainType() ?? 'Unknown';
    const deposit = territory?.getResourceDeposit() ?? null;

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'row spread';

    const hdrInfo = document.createElement('div');
    hdrInfo.className = 'col tight grow';

    const locLine = document.createElement('div');
    locLine.className = 'row tight';
    if (nation) {
      const dot = document.createElement('div');
      dot.className = 'color-dot';
      dot.style.backgroundColor = nation.getColor();
      locLine.appendChild(dot);
    }
    const locText = document.createElement('span');
    locText.className = 'text-body text-mono text-bold';
    locText.textContent = `(${this.position.row}, ${this.position.col}) — ${terrain}`;
    locLine.appendChild(locText);

    const ownerLine = document.createElement('div');
    ownerLine.className = 'text-caption text-dim';
    ownerLine.textContent = nation ? nation.getName() : 'Unclaimed';

    hdrInfo.appendChild(locLine);
    hdrInfo.appendChild(ownerLine);

    if (deposit) {
      const depBadge = document.createElement('div');
      depBadge.className = 'text-caption text-gold text-mono text-bold';
      depBadge.textContent = DEPOSIT_LABEL[deposit] ?? deposit;
      hdrInfo.appendChild(depBadge);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-danger btn-sm';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.close());

    hdr.appendChild(hdrInfo);
    hdr.appendChild(closeBtn);
    panel.appendChild(hdr);

    // Current buildings
    const buildings = territory?.getBuildings() ?? [];
    const construction = territory?.getCurrentConstruction() ?? null;
    const builtWrap = document.createElement('div');
    builtWrap.className = 'panel-alt col tight';

    const builtLabel = document.createElement('div');
    builtLabel.className = 'section-label';
    builtLabel.textContent = 'BUILT';

    const builtVal = document.createElement('div');
    builtVal.className = 'text-caption text-mono';
    builtVal.style.color = '#44dd99';
    builtVal.textContent = buildings.length === 0
      ? 'None'
      : buildings.map(b => {
          const lvl = territory?.getBuildingLevel(b) ?? 1;
          const lvlTag = b === TerritoryBuildingType.WALLS ? ` L${lvl}` : '';
          return `${BUILDING_MAP_ICON[b]} ${b.replace(/_/g, ' ')}${lvlTag}`;
        }).join('  ');
    if (construction) {
      const pct = construction.ticksTotal > 0
        ? Math.round((1 - construction.ticksRemaining / construction.ticksTotal) * 100)
        : 0;
      builtVal.textContent += `  |  Building ${construction.label} ${pct}%`;
    }

    builtWrap.appendChild(builtLabel);
    builtWrap.appendChild(builtVal);
    panel.appendChild(builtWrap);

    // Column headers
    const colHdr = document.createElement('div');
    colHdr.className = 'row';
    colHdr.style.padding = '0 4px';
    ['BUILDING', 'COST', 'REQ', ''].forEach((label, i) => {
      const cell = document.createElement('div');
      cell.className = 'section-label';
      cell.style.flex = i === 0 ? '2' : i === 3 ? '0 0 90px' : '1';
      cell.textContent = label;
      colHdr.appendChild(cell);
    });
    panel.appendChild(colHdr);

    // Building list
    const listEl = document.createElement('div');
    listEl.className = 'scrollable col tight';

    const terrainType = territory?.getTerrainType();
    const passable = terrainType !== TerrainType.WATER && terrainType !== TerrainType.MOUNTAIN;

    const listable = TERRITORY_BUILDING_CATALOG.filter(b => {
      // Outpost claims an unclaimed, passable tile — show it only there.
      if (b.type === TerritoryBuildingType.OUTPOST) return ownerId === null && passable;
      // Every other building requires the tile to already be owned.
      if (ownerId === null) return false;
      if (!MINE_TYPES.has(b.type)) return true;
      if (b.type === TerritoryBuildingType.MANA_MINE)
        return deposit !== null && MANA_DEPOSITS.has(deposit as TerritoryResourceType);
      return deposit !== null && MINE_DEPOSIT_MATCH[b.type] === deposit;
    });

    for (const def of listable) {
      const { row, record } = this.buildRow(def);
      this.buildingRows.push(record);
      listEl.appendChild(row);
    }
    panel.appendChild(listEl);

    this.feedbackEl = document.createElement('div');
    this.feedbackEl.className = 'feedback';
    panel.appendChild(this.feedbackEl);

    backdrop.appendChild(panel);
    document.addEventListener('keydown', this.escHandler);
    this.subscribeEvents();
    this.refreshButtons();
    return backdrop;
  }

  private buildRow(def: TerritoryBuildingDef): { row: HTMLElement; record: RowRecord } {
    const row = document.createElement('div');
    row.className = 'row';
    row.style.padding = '6px 4px';
    row.style.borderBottom = '1px solid rgba(100,168,255,0.1)';

    const nameCell = document.createElement('div');
    nameCell.className = 'col tight';
    nameCell.style.flex = '2';
    const nameLbl = document.createElement('div');
    nameLbl.className = 'text-label text-mono';
    nameLbl.textContent = `${BUILDING_MAP_ICON[def.type]} ${def.label}`;
    const perkLbl = document.createElement('div');
    perkLbl.className = 'text-caption text-dim text-wrap';
    perkLbl.style.fontSize = '10px';
    perkLbl.textContent = def.perks;
    nameCell.appendChild(nameLbl);
    nameCell.appendChild(perkLbl);

    const costLbl = document.createElement('div');
    costLbl.className = 'text-caption text-mono';
    costLbl.style.flex = '1';
    costLbl.style.color = 'var(--color-dim)';
    costLbl.textContent = formatCost(def.cost as Record<string, number>);

    const reqText = def.requiresTech ?? (def.requires ? def.requires : '—');
    const reqLbl = document.createElement('div');
    reqLbl.className = 'text-caption text-mono';
    reqLbl.style.flex = '1';
    reqLbl.style.color = '#8a8aaa';
    reqLbl.textContent = String(reqText).replace(/_/g, ' ');

    const btnWrap = document.createElement('div');
    btnWrap.style.flex = '0 0 90px';

    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-sm btn-full';
    btn.textContent = 'BUILD';
    btn.addEventListener('click', () => {
      const record = this.buildingRows.find(r => r.def === def);
      if (record?.action === 'upgrade') void this.upgrade(def);
      else void this.build(def);
    });

    let levelLbl: HTMLElement | null = null;
    if (def.maxLevel > 1) {
      levelLbl = document.createElement('div');
      levelLbl.className = 'text-caption text-mono';
      levelLbl.style.color = '#aaddcc';
      levelLbl.style.textAlign = 'center';
    }

    btnWrap.appendChild(btn);
    if (levelLbl) btnWrap.appendChild(levelLbl);

    row.appendChild(nameCell);
    row.appendChild(costLbl);
    row.appendChild(reqLbl);
    row.appendChild(btnWrap);

    return { row, record: { def, btn, btnText: btn, costLbl, levelLbl, action: 'build' } };
  }

  private refreshButtons(): void {
    const territory = this.bridge.gameState.getGrid().getTerritory(this.position);
    if (!territory) return;
    const ownerId = territory.getControllingNation();
    const nation  = ownerId ? this.bridge.gameState.getNation(ownerId) : null;
    const construction = territory.getCurrentConstruction();
    const owned = ownerId !== null;

    // Outpost (claiming an unclaimed tile) is paid for by the LOCAL player's nation,
    // not the tile's owner — which is null for an unclaimed tile.
    const localPlayer = this.bridge.gameState.getLocalPlayer();
    const localNation = localPlayer ? this.bridge.gameState.getNation(localPlayer.getControlledNationId()) : null;

    for (const row of this.buildingRows) {
      const isOutpost    = row.def.type === TerritoryBuildingType.OUTPOST;
      const buyerNation  = isOutpost ? localNation : nation;
      const buyerTreasury = buyerNation?.getTreasury();
      const alreadyBuilt = territory.hasBuilding(row.def.type);
      const curLevel     = territory.getBuildingLevel(row.def.type);
      const maxLevel     = row.def.type === TerritoryBuildingType.WALLS ? MAX_WALLS_LEVEL : row.def.maxLevel;
      const atMax        = curLevel >= maxLevel;
      const prereqMet    = !row.def.requires || territory.hasBuilding(row.def.requires);
      const techMet      = !row.def.requiresTech || (buyerNation?.hasResearched(row.def.requiresTech) ?? false);
      const canAfford    = buyerTreasury?.hasResources(row.def.cost) ?? false;

      const canUpgrade = !isOutpost && alreadyBuilt && !atMax && (buyerTreasury?.hasResources(row.def.upgradeCost) ?? false);
      const canBuild   = isOutpost
        ? (!owned && canAfford)               // outpost claims an unclaimed tile
        : (owned && !alreadyBuilt && prereqMet && techMet && canAfford);
      const enabled    = !construction && (canBuild || canUpgrade);

      row.action = canUpgrade ? 'upgrade' : 'build';
      row.btn.disabled = !enabled;
      row.btn.className = `btn btn-sm btn-full ${enabled ? (canUpgrade ? 'btn-success' : 'btn-secondary') : 'btn-ghost'}`;

      if (construction)             row.btnText.textContent = 'BUSY';
      else if (alreadyBuilt && atMax)    row.btnText.textContent = 'MAX';
      else if (alreadyBuilt && canUpgrade) row.btnText.textContent = '▲ UP';
      else if (alreadyBuilt)        row.btnText.textContent = 'BUILT';
      else                          row.btnText.textContent = 'BUILD';

      const costForDisplay = canUpgrade ? row.def.upgradeCost : row.def.cost;
      row.costLbl.textContent = formatCost(costForDisplay as Record<string, number>);
      row.costLbl.style.color = canAfford || canUpgrade ? 'var(--color-dim)' : '#995555';

      if (row.levelLbl) {
        row.levelLbl.style.display = alreadyBuilt ? '' : 'none';
        if (alreadyBuilt) {
          row.levelLbl.textContent = `Lvl ${curLevel}/${maxLevel}`;
          row.levelLbl.style.color = atMax ? '#88ddcc' : '#aaddaa';
        }
      }
    }
  }

  private async build(def: TerritoryBuildingDef): Promise<void> {
    const lp = this.bridge.gameState.getLocalPlayer();
    if (!lp) return;
    const result = await this.bridge.networkAdapter.sendCommand({
      type: 'BUILD_TERRITORY',
      playerId: lp.getId(),
      position: this.position,
      building: def.type,
      issuedAtTick: 0,
    });
    if (result.success) this.showFeedback(`Built: ${def.label}`, '#44dd99');
    else this.showFeedback(result.reason ?? 'Cannot build', '#cc4444');
    this.refreshButtons();
  }

  private async upgrade(def: TerritoryBuildingDef): Promise<void> {
    const lp = this.bridge.gameState.getLocalPlayer();
    if (!lp) return;
    const result = await this.bridge.networkAdapter.sendCommand({
      type: 'UPGRADE_TERRITORY',
      playerId: lp.getId(),
      position: this.position,
      building: def.type,
      issuedAtTick: 0,
    });
    const territory = this.bridge.gameState.getGrid().getTerritory(this.position);
    const lvl = territory?.getBuildingLevel(def.type) ?? 1;
    if (result.success) this.showFeedback(`Upgraded: ${def.label} → Lvl ${lvl}`, '#88ffcc');
    else this.showFeedback(result.reason ?? 'Cannot upgrade', '#cc4444');
    this.refreshButtons();
  }

  private showFeedback(msg: string, color: string): void {
    this.feedbackEl.textContent = msg;
    this.feedbackEl.style.color = color;
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = window.setTimeout(() => { this.feedbackEl.textContent = ''; }, 2500);
  }

  private subscribeEvents(): void {
    const onRefresh = () => this.refreshButtons();
    this.bridge.eventBus.on('territory:building-built',    onRefresh);
    this.bridge.eventBus.on('territory:building-upgraded', onRefresh);
    this.bridge.eventBus.on('territory:claimed',           onRefresh);
    (this as any)._unsub = () => {
      this.bridge.eventBus.off('territory:building-built',    onRefresh);
      this.bridge.eventBus.off('territory:building-upgraded', onRefresh);
      this.bridge.eventBus.off('territory:claimed',           onRefresh);
    };
  }

  private close(): void {
    this.destroy();
    this.bridge.closeTerritoryMenu();
  }

  destroy(): void {
    document.removeEventListener('keydown', this.escHandler);
    clearTimeout(this.feedbackTimer);
    (this as any)._unsub?.();
  }
}
