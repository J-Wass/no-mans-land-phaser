/**
 * ResearchScene - tech tree overlay.
 */

import Phaser from 'phaser';
import type { GameState } from '@/managers/GameState';
import type { NetworkAdapter } from '@/network/NetworkAdapter';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import { TECH_CATALOG } from '@/systems/research/TechTree';
import type { TechBranch, TechNode } from '@/systems/research/TechTree';
import { TICK_RATE } from '@/config/constants';
import { UI } from '@/config/uiTheme';
import {
  createBackdrop,
  createButton,
  createPanelSizer,
  createScrollablePanel,
  createText,
  colorString,
  fitPanel,
  getUiMetrics,
  setButtonEnabled,
  type ButtonParts,
} from '@/utils/rexUiHelpers';

export interface ResearchSceneData {
  gameState: GameState;
  networkAdapter: NetworkAdapter;
  eventBus: GameEventBus;
}

type NodeRow = {
  node: TechNode;
  background: Phaser.GameObjects.Shape;
  label: Phaser.GameObjects.Text;
  subLabel: Phaser.GameObjects.Text;
  button: ButtonParts;
};

const BRANCH_COLORS: Record<TechBranch, string> = {
  science: '#7eb7ff',
  society: '#83e2b0',
  arcane: '#d59cff',
};

export class ResearchScene extends Phaser.Scene {
  private gameState!: GameState;
  private networkAdapter!: NetworkAdapter;
  private eventBus!: GameEventBus;
  private playerId!: string;

  private nodeRows: NodeRow[] = [];
  private currentResearchBar!: Phaser.GameObjects.Rectangle;
  private currentResearchBg!: Phaser.GameObjects.Rectangle;
  private currentResearchText!: Phaser.GameObjects.Text;
  private cancelButton!: ButtonParts;
  private activeBranch: TechBranch = 'science';
  private branchPanels: Partial<Record<TechBranch, Phaser.GameObjects.GameObject & { setVisible(value: boolean): unknown }>> = {};
  private branchButtons: Partial<Record<TechBranch, ButtonParts>> = {};

  constructor() {
    super({ key: 'ResearchScene' });
  }

  init(data: ResearchSceneData): void {
    this.gameState = data.gameState;
    this.networkAdapter = data.networkAdapter;
    this.eventBus = data.eventBus;
    this.nodeRows = [];
    this.activeBranch = 'science';
    this.branchPanels = {};
    this.branchButtons = {};
    this.playerId = this.gameState.getLocalPlayer()?.getId() ?? '';
  }

  create(): void {
    const metrics = getUiMetrics(this);
    const cx = metrics.width / 2;
    const cy = metrics.height / 2;
    const size = fitPanel(metrics.width, metrics.height, 0.9, 1140, 980);

    createBackdrop(this, 0.76);

    const root = createPanelSizer(this, metrics, size.width, size.height, 'y', UI.PANEL);
    root.add(this.buildHeader(metrics, size.width), { expand: true });
    root.add(this.buildCurrentResearch(metrics, size.width), { expand: true });
    root.add(this.buildBranchTabs(metrics, size.width), { expand: true });
    root.add(this.buildBranchList(metrics, size.width, size.height), { proportion: 1, expand: true });
    root.setPosition(cx, cy).layout();

    const onRefresh = () => this.refreshNodes();
    this.eventBus.on('nation:research-complete', onRefresh);
    this.eventBus.on('nation:research-started', onRefresh);
    this.events.once('shutdown', () => {
      this.eventBus.off('nation:research-complete', onRefresh);
      this.eventBus.off('nation:research-started', onRefresh);
    });

    this.input.keyboard?.once('keydown-ESC', () => this.close());
    this.switchBranch(this.activeBranch);
    this.refreshNodes();
  }

  override update(): void {
    this.refreshCurrentBar();
  }

  private buildHeader(metrics: ReturnType<typeof getUiMetrics>, panelWidth: number): Phaser.GameObjects.GameObject {
    const row = this.rexUI.add.sizer({
      orientation: 'x',
      width: panelWidth - metrics.pad * 2,
      space: { item: metrics.gap },
    });
    row.add(createText(this, 'Research', metrics, 'heading', {
      fontFamily: UI.FONT_DISPLAY,
      fontStyle: 'bold',
      color: UI.WHITE,
    }), { proportion: 1, expand: true });
    const closeButton = createButton(this, metrics, 'CLOSE', () => this.close(), {
      variant: 'danger',
      width: Math.round(120 * metrics.scale),
      height: Math.round(metrics.buttonHeight * 0.82),
    });
    row.add(closeButton.root, { align: 'center' });
    return row;
  }

  private buildCurrentResearch(metrics: ReturnType<typeof getUiMetrics>, panelWidth: number): Phaser.GameObjects.GameObject {
    const section = createPanelSizer(this, metrics, panelWidth - metrics.pad * 2, Math.round(140 * metrics.scale), 'y', UI.PANEL_ALT);
    section.add(createText(this, 'Current Research', metrics, 'caption', {
      fontFamily: UI.FONT_DATA,
      fontStyle: 'bold',
      color: colorString(UI.ACCENT_SOFT),
    }));

    const row = this.rexUI.add.sizer({
      orientation: metrics.stacked ? 'y' : 'x',
      space: { item: metrics.gap },
    });

    const info = this.rexUI.add.sizer({
      orientation: 'y',
      width: metrics.stacked ? panelWidth - metrics.pad * 4 : Math.round(panelWidth * 0.35),
      space: { item: metrics.smallGap },
    });
    this.currentResearchText = createText(this, 'Idle', metrics, 'body', {
      color: UI.DIM,
      fontFamily: UI.FONT_DATA,
    });
    info.add(this.currentResearchText, { expand: true });

    const barWidth = metrics.stacked ? panelWidth - metrics.pad * 4 : Math.round(panelWidth * 0.34);
    this.currentResearchBg = this.add.rectangle(0, 0, barWidth, Math.max(18, Math.round(metrics.scale * 18)), UI.SURFACE)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, UI.ACCENT, 0.9);
    this.currentResearchBar = this.add.rectangle(0, 0, 0, Math.max(12, Math.round(metrics.scale * 12)), UI.ACCENT_SOFT)
      .setOrigin(0, 0.5);

    const barContainer = this.add.container(0, 0, [this.currentResearchBg, this.currentResearchBar]);
    info.add(barContainer, { expand: true, align: 'left' });

    this.cancelButton = createButton(this, metrics, 'CANCEL', () => { void this.cancelResearch(); }, {
      variant: 'warning',
      width: metrics.stacked ? panelWidth - metrics.pad * 4 : Math.round(150 * metrics.scale),
    });

    row.add(info, { proportion: 1, expand: true });
    row.add(this.cancelButton.root, { align: 'center' });
    section.add(row, { expand: true });
    return section;
  }

  private buildBranchList(
    metrics: ReturnType<typeof getUiMetrics>,
    panelWidth: number,
    panelHeight: number,
  ): Phaser.GameObjects.GameObject {
    const contentWidth = panelWidth - metrics.pad * 4;
    const listHeight = Math.round(panelHeight - metrics.pad * 5 - 230 * metrics.scale);
    const wrapper = this.rexUI.add.overlapSizer({
      width: panelWidth - metrics.pad * 2,
      height: listHeight,
    });

    (['science', 'society', 'arcane'] as TechBranch[]).forEach((branch) => {
      const content = this.rexUI.add.sizer({
        orientation: 'y',
        width: contentWidth,
        space: { item: metrics.gap },
      });
      content.add(this.buildBranchPanel(metrics, contentWidth, branch), { expand: true });
      const panel = createScrollablePanel(this, metrics, panelWidth - metrics.pad * 2, listHeight, content, UI.PANEL) as Phaser.GameObjects.GameObject & { setVisible(value: boolean): unknown };
      this.branchPanels[branch] = panel;
      wrapper.add(panel, { key: branch, expand: true, align: 'center' });
    });

    return wrapper;
  }

  private buildBranchTabs(metrics: ReturnType<typeof getUiMetrics>, panelWidth: number): Phaser.GameObjects.GameObject {
    const row = this.rexUI.add.sizer({
      orientation: metrics.stacked ? 'y' : 'x',
      width: panelWidth - metrics.pad * 2,
      space: { item: metrics.smallGap },
    });
    const tabWidth = metrics.stacked
      ? panelWidth - metrics.pad * 2
      : Math.round((panelWidth - metrics.pad * 2 - metrics.smallGap * 2) / 3);

    (['science', 'society', 'arcane'] as TechBranch[]).forEach((branch) => {
      const button = createButton(this, metrics, branch.toUpperCase(), () => this.switchBranch(branch), {
        variant: branch === this.activeBranch ? 'primary' : 'secondary',
        width: tabWidth,
        height: Math.round(metrics.buttonHeight * 0.82),
      });
      this.branchButtons[branch] = button;
      row.add(button.root, { proportion: metrics.stacked ? 0 : 1, expand: !metrics.stacked });
    });

    return row;
  }

  private switchBranch(branch: TechBranch): void {
    this.activeBranch = branch;
    (['science', 'society', 'arcane'] as TechBranch[]).forEach((candidate) => {
      this.branchPanels[candidate]?.setVisible(candidate === branch);
      const button = this.branchButtons[candidate];
      if (!button) return;
      button.background.setFillStyle(candidate === branch ? UI.BTN_ACTIVE : UI.BTN);
      button.text.setColor(candidate === branch ? UI.WHITE : UI.LT);
    });
  }

  private buildBranchPanel(
    metrics: ReturnType<typeof getUiMetrics>,
    width: number,
    branch: TechBranch,
  ): Phaser.GameObjects.GameObject {
    const branchNodes = TECH_CATALOG.filter(node => node.branch === branch);
    const rowHeight = this.getNodeRowHeight(metrics);
    const contentHeight = branchNodes.length * rowHeight + Math.max(0, branchNodes.length - 1) * metrics.smallGap;
    const panelHeight = metrics.pad * 2 + Math.round(metrics.headingSize * 1.35) + metrics.gap + contentHeight;
    const wrapper = createPanelSizer(this, metrics, width, panelHeight, 'y', UI.PANEL_ALT);

    const header = this.rexUI.add.sizer({
      orientation: 'x',
      width: width - metrics.pad * 2,
      space: { item: metrics.smallGap },
    });
    header.add(createText(this, branch.toUpperCase(), metrics, 'body', {
      color: BRANCH_COLORS[branch],
      fontFamily: UI.FONT_DATA,
      fontStyle: 'bold',
    }), { proportion: 1, expand: true });
    header.add(createText(this, `${branchNodes.length} techs`, metrics, 'caption', {
      color: UI.DIM,
      fontFamily: UI.FONT_DATA,
    }), { align: 'center' });
    wrapper.add(header, { expand: true });

    const content = this.rexUI.add.sizer({
      orientation: 'y',
      width: width - metrics.pad * 2,
      space: { item: metrics.smallGap },
    });

    branchNodes.forEach((node) => {
      const row = this.buildNodeRow(metrics, width - metrics.pad * 2, node);
      content.add(row.container, { expand: true });
      this.nodeRows.push(row.record);
    });

    wrapper.add(content, { expand: true });
    return wrapper;
  }

  private getNodeRowHeight(metrics: ReturnType<typeof getUiMetrics>): number {
    return Math.round(metrics.compact ? 140 * metrics.scale : 112 * metrics.scale);
  }

  private buildNodeRow(
    metrics: ReturnType<typeof getUiMetrics>,
    width: number,
    node: TechNode,
  ): { container: Phaser.GameObjects.GameObject; record: NodeRow } {
    const rowHeight = this.getNodeRowHeight(metrics);
    const container = this.rexUI.add.sizer({
      width,
      height: rowHeight,
      orientation: metrics.compact ? 'y' : 'x',
      space: {
        left: metrics.smallGap,
        right: metrics.smallGap,
        top: metrics.smallGap,
        bottom: metrics.smallGap,
        item: metrics.smallGap,
      },
    });
    const background = this.rexUI.add.roundRectangle(0, 0, width, rowHeight, metrics.radius, UI.PANEL, 1)
      .setStrokeStyle(2, UI.ACCENT, 0.6);
    container.addBackground(background);

    const info = this.rexUI.add.sizer({
      orientation: 'y',
      width: metrics.compact ? width - metrics.smallGap * 2 : Math.round(width * 0.76),
      space: { item: Math.max(6, Math.round(metrics.smallGap * 0.7)) },
    });
    const textWidth = metrics.compact
      ? width - metrics.pad * 3
      : Math.round(width - Math.max(120, Math.round(150 * metrics.scale)) - metrics.pad * 4);
    const label = createText(this, node.name, metrics, 'body', {
      fontStyle: 'bold',
      color: UI.LT,
      wordWrap: { width: textWidth },
    });
    const subLabel = createText(this, '', metrics, 'caption', {
      color: UI.DIM,
      wordWrap: { width: textWidth },
      lineSpacing: 2,
    });
    info.add(label, { expand: true });
    info.add(subLabel, { expand: true });

    const button = createButton(this, metrics, 'START', () => { void this.startResearch(node); }, {
      variant: 'primary',
      width: metrics.compact ? width - metrics.smallGap * 2 : Math.round(118 * metrics.scale),
      height: Math.round(metrics.buttonHeight * 0.82),
    });

    container.add(info, { proportion: 1, expand: true });
    container.add(button.root, { align: 'center' });
    container.layout();

    return {
      container,
      record: { node, background, label, subLabel, button },
    };
  }

  private getNation() {
    const lp = this.gameState.getLocalPlayer();
    return lp ? this.gameState.getNation(lp.getControlledNationId()) : null;
  }

  private async startResearch(node: TechNode): Promise<void> {
    await this.networkAdapter.sendCommand({
      type: 'START_RESEARCH',
      playerId: this.playerId,
      techId: node.id,
      issuedAtTick: 0,
    });
    this.refreshNodes();
  }

  private async cancelResearch(): Promise<void> {
    await this.networkAdapter.sendCommand({
      type: 'CANCEL_RESEARCH',
      playerId: this.playerId,
      issuedAtTick: 0,
    });
    this.refreshNodes();
  }

  private refreshCurrentBar(): void {
    const nation = this.getNation();
    if (!nation) return;
    const current = nation.getCurrentResearch();
    if (!current) {
      this.currentResearchText.setText('Idle');
      this.currentResearchText.setColor(UI.DIM);
      this.currentResearchBar.width = 0;
      this.currentResearchBar.displayWidth = 0;
      setButtonEnabled(this.cancelButton, false, 'warning');
      return;
    }

    const pct = (current.ticksTotal - current.ticksRemaining) / current.ticksTotal;
    const width = Math.max(0, Math.round(this.currentResearchBg.width * pct));
    this.currentResearchText.setText(`${current.techId.replace(/_/g, ' ')}  (${(current.ticksRemaining / TICK_RATE).toFixed(1)}s)`);
    this.currentResearchText.setColor(UI.GOLD_C);
    this.currentResearchBar.width = width;
    this.currentResearchBar.displayWidth = width;
    setButtonEnabled(this.cancelButton, true, 'warning');
  }

  private refreshNodes(): void {
    const nation = this.getNation();
    const busy = !!nation?.getCurrentResearch();

    for (const row of this.nodeRows) {
      const researched = nation?.hasResearched(row.node.id) ?? false;
      const isActive = nation?.getCurrentResearch()?.techId === row.node.id;
      const canStart = !busy && !researched && (nation?.canResearch(row.node.id) ?? false);

      if (researched) {
        row.background.setFillStyle(0x143222).setStrokeStyle(2, 0x7fe7a6, 0.9);
        row.label.setColor(UI.SUCCESS);
        row.subLabel.setText('Researched').setColor(UI.SUCCESS);
        row.button.text.setText('DONE');
        setButtonEnabled(row.button, false, 'success');
      } else if (isActive) {
        row.background.setFillStyle(0x3d3114).setStrokeStyle(2, 0xffd166, 0.9);
        row.label.setColor(UI.GOLD_C);
        row.subLabel.setText('Research in progress').setColor(UI.GOLD_C);
        row.button.text.setText('...');
        setButtonEnabled(row.button, false, 'warning');
      } else if (canStart) {
        row.background.setFillStyle(UI.PANEL).setStrokeStyle(2, UI.ACCENT, 0.8);
        row.label.setColor(UI.LT);
        row.button.text.setText('START');
        setButtonEnabled(row.button, true, 'primary');
        row.subLabel.setColor(UI.DIM);
      } else {
        row.background.setFillStyle(UI.PANEL).setStrokeStyle(2, 0x34435d, 0.7);
        row.label.setColor(UI.DIM);
        row.button.text.setText('LOCKED');
        setButtonEnabled(row.button, false, 'secondary');
        row.subLabel.setColor('#a58f8f');
      }

      if (!researched && !isActive) {
        const secs = (row.node.ticks / TICK_RATE).toFixed(0);
        const cost = `Research ${row.node.researchCost}  |  ${secs}s`;
        const description = row.node.description;
        if (row.node.requires.length > 0) {
          const prereqs = row.node.requires.map(req => req.replace(/_/g, ' ')).join(', ');
          const allMet = row.node.requires.every(req => nation?.hasResearched(req));
          row.subLabel.setText(`${description}\nRequires: ${prereqs}\n${cost}`);
          row.subLabel.setColor(allMet ? UI.DIM : '#b98e8e');
        } else {
          row.subLabel.setText(`${description}\n${cost}`);
          row.subLabel.setColor(UI.DIM);
        }
      }
    }

    this.refreshCurrentBar();
  }

  private close(): void {
    this.scene.stop('ResearchScene');
  }
}
