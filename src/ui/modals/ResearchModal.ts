import type { PhaserUIBridge } from '@/ui/PhaserUIBridge';
import { TECH_CATALOG, TECH_MAP } from '@/systems/research/TechTree';
import type { TechBranch, TechId, TechNode } from '@/systems/research/TechTree';
import { ResourceType } from '@/systems/resources/ResourceType';
import { TICK_RATE } from '@/config/constants';

const BRANCH_COLORS: Record<TechBranch, string> = {
  science: '#7eb7ff',
  society: '#83e2b0',
  arcane:  '#d59cff',
};

const BRANCH_ORDER: TechBranch[] = ['science', 'society', 'arcane'];

// Graph layout constants
const NODE_W = 156;
const NODE_H = 88;
const COL_W  = 196;     // x-stride between depth columns
const ROW_GAP = 12;     // gap between stacked nodes in a band
const BAND_GAP = 28;    // gap between branch bands
const LEFT_PAD = 84;    // space reserved for sticky band labels
const TOP_PAD = 16;
const BOTTOM_PAD = 16;

interface NodePos { x: number; y: number; }

export class ResearchModal {
  private escHandler: (e: KeyboardEvent) => void;
  private techNodes    = new Map<TechId, HTMLElement>();
  private currentBarFill!: HTMLElement;
  private currentLabel!: HTMLElement;
  private queueWrap!: HTMLElement;
  private cancelBtn!: HTMLButtonElement;
  private rafId = 0;

  constructor(private bridge: PhaserUIBridge) {
    this.escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };
  }

  render(): HTMLElement {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const panel = document.createElement('div');
    panel.className = 'modal-panel full';
    panel.style.maxHeight = '95vh';

    panel.appendChild(this.buildHeader());
    panel.appendChild(this.buildCurrentSection());
    panel.appendChild(this.buildGraph());

    backdrop.appendChild(panel);

    document.addEventListener('keydown', this.escHandler);

    this.subscribeEvents();
    this.refreshNodes();
    this.scheduleBarUpdate();

    return backdrop;
  }

  private buildHeader(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row spread';

    const title = document.createElement('div');
    title.className = 'text-heading text-bold';
    title.textContent = 'Research';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-danger btn-sm';
    closeBtn.textContent = 'CLOSE';
    closeBtn.addEventListener('click', () => this.close());

    row.appendChild(title);
    row.appendChild(closeBtn);
    return row;
  }

  private buildCurrentSection(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'panel-alt col tight';

    const row = document.createElement('div');
    row.className = 'row spread';

    this.currentLabel = document.createElement('div');
    this.currentLabel.className = 'text-body text-dim text-mono grow text-wrap';
    this.currentLabel.textContent = 'Idle';

    this.cancelBtn = document.createElement('button');
    this.cancelBtn.className = 'btn btn-warning btn-sm';
    this.cancelBtn.textContent = 'CANCEL';
    this.cancelBtn.disabled = true;
    this.cancelBtn.addEventListener('click', () => void this.cancelResearch());

    row.appendChild(this.currentLabel);
    row.appendChild(this.cancelBtn);

    const track = document.createElement('div');
    track.className = 'progress-track';

    this.currentBarFill = document.createElement('div');
    this.currentBarFill.className = 'progress-fill';
    this.currentBarFill.style.width = '0%';

    track.appendChild(this.currentBarFill);
    wrap.appendChild(row);
    wrap.appendChild(track);

    const queueTitle = document.createElement('div');
    queueTitle.className = 'section-label';
    queueTitle.textContent = 'QUEUE';
    wrap.appendChild(queueTitle);

    this.queueWrap = document.createElement('div');
    this.queueWrap.className = 'col tight';
    this.queueWrap.style.gap = '4px';
    wrap.appendChild(this.queueWrap);

    return wrap;
  }

  // ── Graph ──────────────────────────────────────────────────────────────────

  /** Depth = longest prerequisite chain from a root. */
  private computeDepths(): Map<TechId, number> {
    const depth = new Map<TechId, number>();
    const visit = (id: TechId): number => {
      const cached = depth.get(id);
      if (cached !== undefined) return cached;
      const node = TECH_MAP.get(id)!;
      const d = node.requires.length === 0
        ? 0
        : 1 + Math.max(...node.requires.map(visit));
      depth.set(id, d);
      return d;
    };
    for (const t of TECH_CATALOG) visit(t.id);
    return depth;
  }

  /**
   * Layout: each branch gets a horizontal band; within a band, techs are
   * positioned by depth (x) and stacked vertically within the (branch,depth)
   * cell to avoid overlap. Display order within a cell follows TECH_CATALOG.
   */
  private layoutNodes(): {
    positions: Map<TechId, NodePos>;
    bandStart: Record<TechBranch, number>;
    bandHeight: Record<TechBranch, number>;
    totalW: number;
    totalH: number;
    maxDepth: number;
  } {
    const depth = this.computeDepths();
    let maxDepth = 0;
    for (const d of depth.values()) if (d > maxDepth) maxDepth = d;

    // Group techs by (branch, depth) preserving catalog order.
    type Cell = TechNode[];
    const cells = new Map<string, Cell>();
    const cellKey = (b: TechBranch, d: number) => `${b}|${d}`;
    for (const t of TECH_CATALOG) {
      const k = cellKey(t.branch, depth.get(t.id)!);
      let cell = cells.get(k);
      if (!cell) { cell = []; cells.set(k, cell); }
      cell.push(t);
    }

    // Max stack per branch determines band height.
    const bandMax: Record<TechBranch, number> = { science: 1, society: 1, arcane: 1 };
    for (const [k, cell] of cells) {
      const branch = k.split('|')[0] as TechBranch;
      if (cell.length > bandMax[branch]) bandMax[branch] = cell.length;
    }

    const bandHeight: Record<TechBranch, number> = {
      science: bandMax.science * NODE_H + (bandMax.science - 1) * ROW_GAP,
      society: bandMax.society * NODE_H + (bandMax.society - 1) * ROW_GAP,
      arcane:  bandMax.arcane  * NODE_H + (bandMax.arcane  - 1) * ROW_GAP,
    };

    const bandStart: Record<TechBranch, number> = {
      science: TOP_PAD,
      society: TOP_PAD + bandHeight.science + BAND_GAP,
      arcane:  TOP_PAD + bandHeight.science + BAND_GAP + bandHeight.society + BAND_GAP,
    };

    const positions = new Map<TechId, NodePos>();
    for (const [k, cell] of cells) {
      const parts = k.split('|');
      const b = parts[0] as TechBranch;
      const d = parseInt(parts[1]!, 10);
      // Center stack vertically within band.
      const cellH = cell.length * NODE_H + (cell.length - 1) * ROW_GAP;
      const startY = bandStart[b] + (bandHeight[b] - cellH) / 2;
      const x = LEFT_PAD + d * COL_W;
      cell.forEach((t, i) => {
        positions.set(t.id, { x, y: startY + i * (NODE_H + ROW_GAP) });
      });
    }

    const totalW = LEFT_PAD + (maxDepth + 1) * COL_W;
    const totalH = TOP_PAD + bandHeight.science + BAND_GAP
                 + bandHeight.society + BAND_GAP
                 + bandHeight.arcane + BOTTOM_PAD;

    return { positions, bandStart, bandHeight, totalW, totalH, maxDepth };
  }

  private buildGraph(): HTMLElement {
    const scroll = document.createElement('div');
    scroll.className = 'tech-graph-scroll';

    const inner = document.createElement('div');
    inner.className = 'tech-graph-inner';

    const { positions, bandStart, bandHeight, totalW, totalH } = this.layoutNodes();
    inner.style.width = totalW + 'px';
    inner.style.height = totalH + 'px';

    // SVG edge layer (behind nodes)
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'tech-edges');
    svg.setAttribute('width', String(totalW));
    svg.setAttribute('height', String(totalH));
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.pointerEvents = 'none';

    for (const tech of TECH_CATALOG) {
      for (const reqId of tech.requires) {
        const a = positions.get(reqId)!;
        const b = positions.get(tech.id)!;
        const x1 = a.x + NODE_W;
        const y1 = a.y + NODE_H / 2;
        const x2 = b.x;
        const y2 = b.y + NODE_H / 2;
        const mx = (x1 + x2) / 2;
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`);
        path.setAttribute('stroke', BRANCH_COLORS[TECH_MAP.get(reqId)!.branch]);
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.55');
        path.dataset['fromId'] = reqId;
        path.dataset['toId'] = tech.id;
        svg.appendChild(path);
      }
    }
    inner.appendChild(svg);

    // Band labels (sticky to viewport left so they stay visible when scrolling)
    for (const branch of BRANCH_ORDER) {
      const label = document.createElement('div');
      label.className = `band-label band-${branch}`;
      label.textContent = branch.toUpperCase();
      label.style.top = bandStart[branch] + 'px';
      label.style.height = bandHeight[branch] + 'px';
      label.style.color = BRANCH_COLORS[branch];
      inner.appendChild(label);
    }

    // Tech nodes
    for (const tech of TECH_CATALOG) {
      const pos = positions.get(tech.id)!;
      const node = this.buildTechNode(tech);
      node.style.left = pos.x + 'px';
      node.style.top  = pos.y + 'px';
      node.style.width  = NODE_W + 'px';
      node.style.height = NODE_H + 'px';
      this.techNodes.set(tech.id, node);
      inner.appendChild(node);
    }

    scroll.appendChild(inner);
    return scroll;
  }

  private buildTechNode(node: TechNode): HTMLElement {
    const el = document.createElement('div');
    el.className = 'tech-node';
    el.dataset['techId'] = node.id;
    el.style.borderLeftColor = BRANCH_COLORS[node.branch];

    const name = document.createElement('div');
    name.className = 'tech-node-name';
    name.dataset['role'] = 'name';
    name.textContent = node.name;

    const sub = document.createElement('div');
    sub.className = 'tech-node-sub';
    sub.dataset['role'] = 'sub';

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-sm tech-node-btn';
    btn.dataset['role'] = 'btn';
    btn.textContent = 'START';
    btn.addEventListener('click', () => void this.startResearch(node));

    el.appendChild(name);
    el.appendChild(sub);
    el.appendChild(btn);
    el.title = node.description;
    return el;
  }

  private getNation() {
    const lp = this.bridge.gameState.getLocalPlayer();
    return lp ? this.bridge.gameState.getNation(lp.getControlledNationId()) : null;
  }

  private refreshNodes(): void {
    const nation = this.getNation();
    const busy = !!nation?.getCurrentResearch();
    const currentPoints = nation?.getTreasury().getAmount(ResourceType.RESEARCH) ?? 0;
    const queued = new Set(nation?.getResearchQueue() ?? []);

    for (const node of TECH_CATALOG) {
      const el = this.techNodes.get(node.id);
      if (!el) continue;

      const name = el.querySelector<HTMLElement>('[data-role="name"]')!;
      const sub  = el.querySelector<HTMLElement>('[data-role="sub"]')!;
      const btn  = el.querySelector<HTMLButtonElement>('[data-role="btn"]')!;

      const researched = nation?.hasResearched(node.id) ?? false;
      const isActive   = nation?.getCurrentResearch()?.techId === node.id;
      const isQueued   = queued.has(node.id);
      const prereqsMet = !researched && (nation?.canResearch(node.id) ?? false);
      const hasPoints  = currentPoints >= node.researchCost;
      const canStart   = !busy && prereqsMet && hasPoints;
      const canQueue   = !researched && !isActive && !isQueued;

      const state =
        researched ? 'researched' :
        isActive   ? 'active' :
        isQueued   ? 'queued' :
        canStart   ? 'available' :
        (prereqsMet && !hasPoints) ? 'needs-rp' : 'locked';

      el.className = 'tech-node ' + state;
      el.style.borderLeftColor = BRANCH_COLORS[node.branch];

      const costLine = `${node.researchCost} RP · ${(node.ticks / TICK_RATE).toFixed(0)}s`;

      if (researched) {
        name.style.color = 'var(--color-success)';
        sub.textContent  = 'Researched';
        sub.style.color  = 'var(--color-success)';
        btn.textContent  = 'DONE';
        btn.className    = 'btn btn-success btn-sm tech-node-btn';
        btn.disabled     = true;
      } else if (isActive) {
        name.style.color = 'var(--color-gold)';
        sub.textContent  = 'In progress';
        sub.style.color  = 'var(--color-gold)';
        btn.textContent  = '...';
        btn.className    = 'btn btn-warning btn-sm tech-node-btn';
        btn.disabled     = true;
      } else if (isQueued) {
        name.style.color = 'var(--color-gold)';
        sub.textContent  = 'Queued';
        sub.style.color  = 'var(--color-gold)';
        btn.textContent  = 'QUEUED';
        btn.className    = 'btn btn-warning btn-sm tech-node-btn';
        btn.disabled     = true;
      } else if (prereqsMet && !hasPoints) {
        name.style.color = 'var(--color-lt)';
        sub.textContent  = `${costLine}  (${currentPoints}/${node.researchCost} RP)`;
        sub.style.color  = '#e8917a';
        btn.textContent  = 'QUEUE';
        btn.className    = 'btn btn-primary btn-sm tech-node-btn';
        btn.disabled     = !canQueue;
      } else if (canStart) {
        name.style.color = 'var(--color-lt)';
        sub.textContent  = costLine;
        sub.style.color  = 'var(--color-dim)';
        btn.textContent  = 'START';
        btn.className    = 'btn btn-primary btn-sm tech-node-btn';
        btn.disabled     = false;
      } else if (canQueue) {
        name.style.color = 'var(--color-dim)';
        sub.textContent  = costLine;
        sub.style.color  = '#b98e8e';
        btn.textContent  = node.requires.length > 0 && !prereqsMet ? 'QUEUE PATH' : 'QUEUE';
        btn.className    = 'btn btn-primary btn-sm tech-node-btn';
        btn.disabled     = false;
      } else {
        name.style.color = 'var(--color-dim)';
        sub.textContent  = costLine;
        sub.style.color  = '#b98e8e';
        btn.textContent  = 'LOCKED';
        btn.className    = 'btn btn-secondary btn-sm tech-node-btn';
        btn.disabled     = true;
      }
    }
    this.renderQueue();
  }

  private renderQueue(): void {
    const nation = this.getNation();
    const queue = nation?.getResearchQueue() ?? [];
    this.queueWrap.replaceChildren();

    if (queue.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'text-caption text-dim';
      empty.textContent = 'No queued technologies';
      this.queueWrap.appendChild(empty);
      return;
    }

    queue.forEach((techId, index) => {
      const node = TECH_MAP.get(techId);
      const row = document.createElement('div');
      row.className = 'row spread';
      row.style.background = 'rgba(10,16,28,0.65)';
      row.style.border = '1px solid #2b426d';
      row.style.borderRadius = '4px';
      row.style.padding = '4px 6px';

      const label = document.createElement('div');
      label.className = 'text-caption text-mono text-wrap grow';
      label.textContent = `${index + 1}. ${node?.name ?? techId}`;
      row.appendChild(label);

      const actions = document.createElement('div');
      actions.className = 'row tight';

      const up = document.createElement('button');
      up.className = 'btn btn-secondary btn-sm';
      up.textContent = 'UP';
      up.disabled = index === 0;
      up.addEventListener('click', () => void this.moveQueuedResearch(techId, 'up'));

      const down = document.createElement('button');
      down.className = 'btn btn-secondary btn-sm';
      down.textContent = 'DOWN';
      down.disabled = index === queue.length - 1;
      down.addEventListener('click', () => void this.moveQueuedResearch(techId, 'down'));

      const remove = document.createElement('button');
      remove.className = 'btn btn-danger btn-sm';
      remove.textContent = 'X';
      remove.addEventListener('click', () => void this.removeQueuedResearch(techId));

      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(remove);
      row.appendChild(actions);
      this.queueWrap.appendChild(row);
    });
  }

  private scheduleBarUpdate(): void {
    const tick = () => {
      this.updateBar();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private updateBar(): void {
    const nation = this.getNation();
    const current = nation?.getCurrentResearch();
    if (!current) {
      this.currentLabel.textContent = 'Idle';
      this.currentLabel.style.color = 'var(--color-dim)';
      this.currentBarFill.style.width = '0%';
      this.cancelBtn.disabled = true;
      return;
    }
    const pct = (current.ticksTotal - current.ticksRemaining) / current.ticksTotal;
    this.currentLabel.textContent = `${current.techId.replace(/_/g, ' ')}  (${(current.ticksRemaining / TICK_RATE).toFixed(1)}s)`;
    this.currentLabel.style.color = 'var(--color-gold)';
    this.currentBarFill.style.width = `${(pct * 100).toFixed(1)}%`;
    this.cancelBtn.disabled = false;
  }

  private subscribeEvents(): void {
    const onRefresh = () => { this.refreshNodes(); };
    this.bridge.eventBus.on('nation:research-complete', onRefresh);
    this.bridge.eventBus.on('nation:research-started', onRefresh);
    this.bridge.eventBus.on('nation:research-queue-updated', onRefresh);
    (this as any)._unsub = () => {
      this.bridge.eventBus.off('nation:research-complete', onRefresh);
      this.bridge.eventBus.off('nation:research-started', onRefresh);
      this.bridge.eventBus.off('nation:research-queue-updated', onRefresh);
    };
  }

  private async startResearch(node: TechNode): Promise<void> {
    const lp = this.bridge.gameState.getLocalPlayer();
    if (!lp) return;
    const nation = this.getNation();
    const currentPoints = nation?.getTreasury().getAmount(ResourceType.RESEARCH) ?? 0;
    const canStart = !!nation?.canResearch(node.id)
      && !nation.getCurrentResearch()
      && currentPoints >= node.researchCost;
    await this.bridge.networkAdapter.sendCommand({
      type: canStart ? 'START_RESEARCH' : 'QUEUE_RESEARCH',
      playerId: lp.getId(),
      techId: node.id,
      issuedAtTick: 0,
    });
    this.refreshNodes();
  }

  private async removeQueuedResearch(techId: TechId): Promise<void> {
    const lp = this.bridge.gameState.getLocalPlayer();
    if (!lp) return;
    await this.bridge.networkAdapter.sendCommand({
      type: 'REMOVE_QUEUED_RESEARCH',
      playerId: lp.getId(),
      techId,
      issuedAtTick: 0,
    });
    this.refreshNodes();
  }

  private async moveQueuedResearch(techId: TechId, direction: 'up' | 'down'): Promise<void> {
    const lp = this.bridge.gameState.getLocalPlayer();
    if (!lp) return;
    await this.bridge.networkAdapter.sendCommand({
      type: 'MOVE_QUEUED_RESEARCH',
      playerId: lp.getId(),
      techId,
      direction,
      issuedAtTick: 0,
    });
    this.refreshNodes();
  }

  private async cancelResearch(): Promise<void> {
    const lp = this.bridge.gameState.getLocalPlayer();
    if (!lp) return;
    await this.bridge.networkAdapter.sendCommand({
      type: 'CANCEL_RESEARCH',
      playerId: lp.getId(),
      issuedAtTick: 0,
    });
    this.refreshNodes();
  }

  private close(): void {
    this.destroy();
    this.bridge.closeResearch();
  }

  destroy(): void {
    document.removeEventListener('keydown', this.escHandler);
    cancelAnimationFrame(this.rafId);
    (this as any)._unsub?.();
  }
}
