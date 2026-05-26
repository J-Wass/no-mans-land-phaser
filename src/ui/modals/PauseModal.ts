import type { PhaserUIBridge } from '@/ui/PhaserUIBridge';
import { SaveSystem } from '@/systems/save/SaveSystem';
import type { GameSaveData } from '@/types/gameSetup';
import {
  FONT_OPTIONS, SIZE_OPTIONS,
  getFont, setFont, getFontSizeScale, setFontSizeScale,
} from '@/config/accessibility';

export class PauseModal {
  private escHandler: (e: KeyboardEvent) => void;
  private feedbackEl!: HTMLElement;
  private feedbackTimer = 0;

  constructor(private bridge: PhaserUIBridge) {
    this.escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.bridge.closePause(); };
  }

  render(): HTMLElement {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    panel.style.width = 'min(980px, 92vw)';
    panel.style.maxHeight = '94vh';

    panel.appendChild(this.buildHeader());
    panel.appendChild(this.buildTopActions());

    const scrollWrap = document.createElement('div');
    scrollWrap.className = 'scrollable col';
    scrollWrap.style.gap = 'var(--ui-gap)';

    scrollWrap.appendChild(this.buildSlotsSection());
    scrollWrap.appendChild(this.buildTransferRow());
    scrollWrap.appendChild(this.buildAccessibilitySection());

    this.feedbackEl = document.createElement('div');
    this.feedbackEl.className = 'feedback';

    panel.appendChild(scrollWrap);
    panel.appendChild(this.feedbackEl);
    backdrop.appendChild(panel);
    document.addEventListener('keydown', this.escHandler);
    return backdrop;
  }

  private buildHeader(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row spread';

    const left = document.createElement('div');
    left.className = 'col tight grow';

    const title = document.createElement('div');
    title.className = 'text-heading text-bold';
    title.textContent = 'Paused';

    const desc = document.createElement('div');
    desc.className = 'text-caption text-dim text-wrap';
    desc.textContent = 'Manage saves, import or export files, or jump back to the main menu.';

    left.appendChild(title);
    left.appendChild(desc);

    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'btn btn-primary';
    resumeBtn.textContent = 'RESUME';
    resumeBtn.addEventListener('click', () => this.bridge.closePause());

    row.appendChild(left);
    row.appendChild(resumeBtn);
    return row;
  }

  private buildTopActions(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row';

    const localLabel = document.createElement('div');
    localLabel.className = 'text-caption text-accent-soft text-mono text-bold grow';
    localLabel.textContent = 'LOCAL SLOTS';

    const menuBtn = document.createElement('button');
    menuBtn.className = 'btn btn-danger btn-sm';
    menuBtn.textContent = 'MAIN MENU';
    menuBtn.addEventListener('click', () => this.bridge.goToMenu());

    row.appendChild(localLabel);
    row.appendChild(menuBtn);
    return row;
  }

  private buildSlotsSection(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'panel-alt col tight';

    const heading = document.createElement('div');
    heading.className = 'text-caption text-accent-soft text-mono text-bold';
    heading.textContent = 'Save Slots';

    const subtext = document.createElement('div');
    subtext.className = 'text-caption text-dim';
    subtext.textContent = 'All 10 slots live locally in this browser profile.';

    wrap.appendChild(heading);
    wrap.appendChild(subtext);

    for (const { slot, saveData } of SaveSystem.listSlots()) {
      wrap.appendChild(this.buildSlotRow(slot, saveData));
    }
    return wrap;
  }

  private buildSlotRow(slot: number, saveData: GameSaveData | null): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row';
    row.style.padding = '10px 8px';
    row.style.background = 'var(--color-panel)';
    row.style.border = '1px solid #2f4b74';
    row.style.borderRadius = '5px';

    const info = document.createElement('div');
    info.className = 'col tight grow';

    const slotLabel = document.createElement('div');
    slotLabel.className = 'text-body text-mono text-bold';
    slotLabel.textContent = `Slot ${slot}`;

    const meta = document.createElement('div');
    meta.className = 'text-caption';
    if (saveData) {
      meta.style.color = 'var(--color-dim)';
      const day = Math.floor(saveData.currentTick / 100) + 1;
      meta.textContent = `${new Date(saveData.savedAt).toLocaleString()}  |  Day ${day}  |  ${saveData.setup.gameMode}`;
    } else {
      meta.style.color = 'var(--color-muted)';
      meta.textContent = 'Empty slot';
    }

    info.appendChild(slotLabel);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'row tight';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary btn-sm';
    saveBtn.textContent = 'SAVE';
    saveBtn.addEventListener('click', () => this.saveGame(slot));

    const loadBtn = document.createElement('button');
    loadBtn.className = `btn btn-sm ${saveData ? 'btn-success' : 'btn-secondary'}`;
    loadBtn.disabled = !saveData;
    loadBtn.textContent = 'LOAD';
    loadBtn.addEventListener('click', () => this.loadGame(slot));

    actions.appendChild(saveBtn);
    actions.appendChild(loadBtn);

    row.appendChild(info);
    row.appendChild(actions);
    return row;
  }

  private buildTransferRow(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'col tight';

    const desc = document.createElement('div');
    desc.className = 'text-caption text-dim text-center';
    desc.textContent = 'Export or import a save file to move progress between computers.';

    const btnRow = document.createElement('div');
    btnRow.className = 'row';

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-secondary grow';
    exportBtn.textContent = 'EXPORT FILE';
    exportBtn.addEventListener('click', () => this.exportSave());

    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-secondary grow';
    importBtn.textContent = 'IMPORT FILE';
    importBtn.addEventListener('click', () => void this.importSave());

    btnRow.appendChild(exportBtn);
    btnRow.appendChild(importBtn);
    wrap.appendChild(desc);
    wrap.appendChild(btnRow);
    return wrap;
  }

  private buildAccessibilitySection(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'panel-alt col tight';

    const heading = document.createElement('div');
    heading.className = 'text-caption text-accent-soft text-mono text-bold';
    heading.textContent = 'Accessibility';

    wrap.appendChild(heading);

    // Font family
    const fontRow = document.createElement('div');
    fontRow.className = 'row tight';
    const fontLabel = document.createElement('span');
    fontLabel.className = 'text-caption text-dim';
    fontLabel.textContent = 'Font:';
    fontRow.appendChild(fontLabel);

    const currentFont = getFont();
    for (const opt of FONT_OPTIONS) {
      const btn = document.createElement('button');
      btn.className = `btn btn-sm ${opt.value === currentFont ? 'btn-primary' : 'btn-ghost'}`;
      btn.textContent = opt.label;
      btn.style.fontFamily = opt.value;
      btn.addEventListener('click', () => { setFont(opt.value); this.refreshAccessibility(); });
      fontRow.appendChild(btn);
    }
    wrap.appendChild(fontRow);

    // Font size
    const sizeRow = document.createElement('div');
    sizeRow.className = 'row tight';
    const sizeLabel = document.createElement('span');
    sizeLabel.className = 'text-caption text-dim';
    sizeLabel.textContent = 'Size:';
    sizeRow.appendChild(sizeLabel);

    const currentSize = getFontSizeScale();
    for (const opt of SIZE_OPTIONS) {
      const active = Math.abs(opt.value - currentSize) < 0.01;
      const btn = document.createElement('button');
      btn.className = `btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}`;
      btn.textContent = opt.label;
      btn.addEventListener('click', () => { setFontSizeScale(opt.value); this.refreshAccessibility(); });
      sizeRow.appendChild(btn);
    }
    wrap.appendChild(sizeRow);

    return wrap;
  }

  private refreshAccessibility(): void {
    // Re-render the pause modal to pick up new accessibility settings.
    // Since the canvas scenes also need to rebuild (they read getFont/getFontSizeScale
    // per frame via getUiMetrics), this is sufficient for the HTML side.
    // The canvas HUD will naturally pick up changes on next rebuild.
    this.destroy();
    const newModal = new PauseModal(this.bridge);
    const el = newModal.render();
    void import('@/ui/UIManager').then(({ UIManager }) => UIManager.open('pause', el));
  }

  private saveGame(slot: number): void {
    this.bridge.saveToSlot(slot);
    this.showFeedback(`Saved to slot ${slot}.`, 'var(--color-success)');
    // Refresh the slot list
    this.refreshAccessibility();
  }

  private loadGame(slot: number): void {
    const saveData = SaveSystem.load(slot);
    if (!saveData) {
      this.showFeedback(`Slot ${slot} is empty.`, 'var(--color-danger)');
      return;
    }
    void import('@/ui/UIManager').then(({ UIManager }) => UIManager.close('pause'));
    this.bridge.phaserScene.scene.resume('GameScene');
    this.bridge.phaserScene.scene.resume('UIScene');
    this.bridge.phaserScene.scene.stop('UIScene');
    this.bridge.phaserScene.game.scene.start('GameScene', { saveData, setup: saveData.setup });
  }

  private exportSave(): void {
    const slot = SaveSystem.listSlots().find(s => s.saveData)?.slot;
    if (!slot) { this.showFeedback('Save a slot before exporting.', 'var(--color-danger)'); return; }
    const saveData = SaveSystem.load(slot);
    if (!saveData) { this.showFeedback('No save found to export.', 'var(--color-danger)'); return; }
    const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `phaser-rts-save-slot-${slot}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.showFeedback(`Exported slot ${slot}.`, 'var(--color-success)');
  }

  private async importSave(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const raw = await file.text();
        const parsed = JSON.parse(raw) as GameSaveData;
        if (parsed.version !== 1) throw new Error('Unsupported save version');
        const targetSlot = SaveSystem.listSlots().find(s => !s.saveData)?.slot ?? 10;
        SaveSystem.save(targetSlot, parsed);
        this.showFeedback(`Imported save into slot ${targetSlot}.`, 'var(--color-success)');
        this.refreshAccessibility();
      } catch {
        this.showFeedback('Import failed.', 'var(--color-danger)');
      }
    };
    input.click();
  }

  private showFeedback(msg: string, color: string): void {
    this.feedbackEl.textContent = msg;
    this.feedbackEl.style.color = color;
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = window.setTimeout(() => { this.feedbackEl.textContent = ''; }, 2200);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.escHandler);
    clearTimeout(this.feedbackTimer);
  }
}
