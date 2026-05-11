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

const BRANCHES: TechBranch[] = ['science', 'society', 'arcane'];

export class ResearchModal {
  private escHandler: (e: KeyboardEvent) => void;
  private activeBranch: TechBranch = 'science';
  private branchPanels = new Map<TechBranch, HTMLElement>();
  private branchBtns   = new Map<TechBranch, HTMLButtonElement>();
  private techRows     = new Map<string, HTMLElement>();
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
    panel.appendChild(this.buildBranchTabs());

    const listWrap = document.createElement('div');
    listWrap.className = 'scrollable';
    listWrap.style.position = 'relative';

    for (const branch of BRANCHES) {
      const bp = this.buildBranchPanel(branch);
      bp.style.display = branch === this.activeBranch ? 'flex' : 'none';
      this.branchPanels.set(branch, bp);
      listWrap.appendChild(bp);
    }

    panel.appendChild(listWrap);
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

  private buildBranchTabs(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tabs';

    for (const branch of BRANCHES) {
      const btn = document.createElement('button');
      btn.className = `btn btn-secondary tab`;
      btn.textContent = branch.toUpperCase();
      btn.addEventListener('click', () => this.switchBranch(branch));
      this.branchBtns.set(branch, btn);
      row.appendChild(btn);
    }
    this.updateBranchBtnStyles();
    return row;
  }

  private buildBranchPanel(branch: TechBranch): HTMLElement {
    const nodes = TECH_CATALOG.filter(n => n.branch === branch);
    const wrap = document.createElement('div');
    wrap.className = 'branch-panel';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = 'var(--ui-small-gap)';

    const hdr = document.createElement('div');
    hdr.className = 'row spread';
    const lbl = document.createElement('span');
    lbl.className = 'text-body text-bold text-mono';
    lbl.style.color = BRANCH_COLORS[branch];
    lbl.textContent = branch.toUpperCase();
    const cnt = document.createElement('span');
    cnt.className = 'text-caption';
    cnt.textContent = `${nodes.length} techs`;
    hdr.appendChild(lbl);
    hdr.appendChild(cnt);
    wrap.appendChild(hdr);

    for (const node of nodes) {
      const row = this.buildTechRow(node);
      this.techRows.set(node.id, row);
      wrap.appendChild(row);
    }
    return wrap;
  }

  private buildTechRow(node: TechNode): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tech-row';

    const info = document.createElement('div');
    info.className = 'col tight grow';

    const name = document.createElement('div');
    name.className = 'text-label text-bold text-wrap';
    name.dataset['role'] = 'name';
    name.textContent = node.name;

    const sub = document.createElement('div');
    sub.className = 'text-caption text-wrap';
    sub.dataset['role'] = 'sub';

    info.appendChild(name);
    info.appendChild(sub);

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-sm';
    btn.dataset['role'] = 'btn';
    btn.textContent = 'START';
    btn.addEventListener('click', () => void this.startResearch(node));

    row.appendChild(info);
    row.appendChild(btn);
    row.dataset['techId'] = node.id;
    return row;
  }

  private switchBranch(branch: TechBranch): void {
    this.activeBranch = branch;
    for (const [b, el] of this.branchPanels) {
      el.style.display = b === branch ? 'flex' : 'none';
    }
    this.updateBranchBtnStyles();
  }

  private updateBranchBtnStyles(): void {
    for (const [b, btn] of this.branchBtns) {
      btn.className = `btn tab ${b === this.activeBranch ? 'btn-primary' : 'btn-secondary'}`;
    }
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
      const row = this.techRows.get(node.id);
      if (!row) continue;

      const name = row.querySelector<HTMLElement>('[data-role="name"]')!;
      const sub  = row.querySelector<HTMLElement>('[data-role="sub"]')!;
      const btn  = row.querySelector<HTMLButtonElement>('[data-role="btn"]')!;

      const researched = nation?.hasResearched(node.id) ?? false;
      const isActive   = nation?.getCurrentResearch()?.techId === node.id;
      const isQueued   = queued.has(node.id);
      const prereqsMet = !researched && (nation?.canResearch(node.id) ?? false);
      const hasPoints  = currentPoints >= node.researchCost;
      const canStart   = !busy && prereqsMet && hasPoints;
      const canQueue   = !researched && !isActive && !isQueued;

      row.className = 'tech-row ' + (
        researched ? 'researched' :
        isActive   ? 'active' :
        isQueued   ? 'active' :
        canStart   ? 'available' :
        (prereqsMet && !hasPoints) ? 'needs-rp' : 'locked'
      );

      if (researched) {
        name.style.color = 'var(--color-success)';
        sub.textContent  = 'Researched';
        sub.style.color  = 'var(--color-success)';
        btn.textContent  = 'DONE';
        btn.className    = 'btn btn-success btn-sm';
        btn.disabled     = true;
      } else if (isActive) {
        name.style.color = 'var(--color-gold)';
        sub.textContent  = 'Research in progress';
        sub.style.color  = 'var(--color-gold)';
        btn.textContent  = '...';
        btn.className    = 'btn btn-warning btn-sm';
        btn.disabled     = true;
      } else if (isQueued) {
        name.style.color = 'var(--color-gold)';
        sub.textContent  = 'Queued for research';
        sub.style.color  = 'var(--color-gold)';
        btn.textContent  = 'QUEUED';
        btn.className    = 'btn btn-warning btn-sm';
        btn.disabled     = true;
      } else if (prereqsMet && !hasPoints) {
        name.style.color = 'var(--color-lt)';
        const pointsNote = `  (have ${currentPoints}/${node.researchCost} RP)`;
        sub.textContent  = `${node.description}\nCost: ${node.researchCost} RP${pointsNote}  |  ${(node.ticks/TICK_RATE).toFixed(0)}s`;
        sub.style.color  = '#e8917a';
        btn.textContent  = 'QUEUE';
        btn.className    = 'btn btn-primary btn-sm';
        btn.disabled     = !canQueue;
      } else if (canStart) {
        name.style.color = 'var(--color-lt)';
        sub.textContent  = `${node.description}\nCost: ${node.researchCost} RP  |  ${(node.ticks/TICK_RATE).toFixed(0)}s`;
        sub.style.color  = 'var(--color-dim)';
        btn.textContent  = 'START';
        btn.className    = 'btn btn-primary btn-sm';
        btn.disabled     = false;
      } else if (canQueue) {
        name.style.color = 'var(--color-dim)';
        const prereqNames = node.requires.length
          ? `Requires: ${node.requires.map(r => r.replace(/_/g, ' ')).join(', ')}\n` : '';
        sub.textContent  = `${node.description}\n${prereqNames}Cost: ${node.researchCost} RP  |  ${(node.ticks/TICK_RATE).toFixed(0)}s`;
        sub.style.color  = '#b98e8e';
        btn.textContent  = !prereqsMet && node.requires.length > 0 ? 'QUEUE PATH' : 'QUEUE';
        btn.className    = 'btn btn-primary btn-sm';
        btn.disabled     = false;
      } else {
        name.style.color = 'var(--color-dim)';
        const prereqNames = node.requires.length
          ? `Requires: ${node.requires.map(r => r.replace(/_/g, ' ')).join(', ')}\n` : '';
        sub.textContent  = `${node.description}\n${prereqNames}Cost: ${node.researchCost} RP  |  ${(node.ticks/TICK_RATE).toFixed(0)}s`;
        sub.style.color  = '#b98e8e';
        btn.textContent  = 'LOCKED';
        btn.className    = 'btn btn-secondary btn-sm';
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
