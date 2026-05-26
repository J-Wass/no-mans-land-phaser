import './styles/tokens.css';
import './styles/modals.css';
import type { GameSetup } from '@/types/gameSetup';
import { applyAccessibilitySettings, getFontSizeScale } from '@/config/accessibility';
import { computeUiScale } from '@/config/uiScale';

export type StartGameCallback = (opts: { setup: GameSetup; saveData?: import('@/types/gameSetup').GameSaveData }) => void;

function computeMetrics() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const shortSide = Math.min(w, h);
  const scale = computeUiScale(shortSide);
  return {
    scale,
    compact: w < 1180,
    stacked: w < 900,
    pad:    Math.max(14, Math.min(30, Math.round(scale * 20))),
    gap:    Math.max(10, Math.min(22, Math.round(scale * 14))),
    smallGap: Math.max(6, Math.min(15, Math.round(scale * 8))),
    buttonHeight: Math.max(32, Math.min(52, Math.round(scale * 40))),
  };
}

class UIManagerClass {
  private overlay!: HTMLDivElement;
  private modals = new Map<string, HTMLElement>();
  private startGameCb: StartGameCallback | null = null;
  private menuEl: HTMLElement | null = null;

  init(): void {
    const container = document.getElementById('game-container') ?? document.body;
    let el = document.getElementById('ui-overlay') as HTMLDivElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'ui-overlay';
      container.appendChild(el);
    }
    this.overlay = el;
    applyAccessibilitySettings();
    this.applyMetrics();
    window.addEventListener('resize', () => this.applyMetrics());
    window.addEventListener('accessibility:changed', () => this.applyMetrics());
  }

  private applyMetrics(): void {
    const m = computeMetrics();
    const r = document.documentElement;
    r.style.setProperty('--ui-scale',     String(m.scale * getFontSizeScale()));
    r.style.setProperty('--ui-pad',       `${m.pad}px`);
    r.style.setProperty('--ui-gap',       `${m.gap}px`);
    r.style.setProperty('--ui-small-gap', `${m.smallGap}px`);
    r.style.setProperty('--ui-btn-h',     `${m.buttonHeight}px`);
  }

  getMetrics() { return computeMetrics(); }

  open(id: string, element: HTMLElement): void {
    this.close(id);
    this.modals.set(id, element);
    this.overlay.appendChild(element);
    this.overlay.style.pointerEvents = 'auto';
  }

  close(id: string): void {
    const el = this.modals.get(id);
    if (el) { el.remove(); this.modals.delete(id); }
    this.syncPointerEvents();
  }

  isOpen(id: string): boolean { return this.modals.has(id); }

  private syncPointerEvents(): void {
    if (this.modals.size === 0 && !this.menuEl) {
      this.overlay.style.pointerEvents = 'none';
    }
  }

  showMenu(onStart: StartGameCallback): void {
    this.startGameCb = onStart;
    // MenuPage imported lazily to avoid circular deps at module load time
    void import('@/ui/pages/MenuPage').then(({ MenuPage }) => {
      const page = new MenuPage(opts => this.startGameCb?.(opts));
      if (this.menuEl) this.menuEl.remove();
      this.menuEl = page.render();
      this.overlay.appendChild(this.menuEl);
      this.overlay.style.pointerEvents = 'auto';
    });
  }

  hideMenu(): void {
    if (this.menuEl) { this.menuEl.remove(); this.menuEl = null; }
    this.syncPointerEvents();
  }
}

export const UIManager = new UIManagerClass();
