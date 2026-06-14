/**
 * TutorialOverlay — draggable tutorial card + highlight ring + pointer arrow.
 *
 * Layout: card pinned to the top-right corner by default (covering the minimap,
 * which is OK because the tutorial is high-priority context). A drag handle at
 * the top of the card lets the user move it anywhere; the position persists
 * across step changes for the rest of the session.
 *
 * Per-frame work: the ring tracks the live target rect, and the arrow's side +
 * tip position recompute from the card's current position so it always points
 * toward the target.
 *
 * Non-blocking: the wrapper layer is `pointer-events:none`; only the card and
 * its buttons capture clicks, so the map and HUD stay fully interactive.
 */

import type { TutorialUI, TutorialViewModel } from '@/systems/tutorial/TutorialManager';

/** Rect for the current highlight target in viewport coords. */
interface TargetRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A function that resolves the live position of the current tile target (or null). */
export type TileRectProvider = () => TargetRect | null;

type Side = 'right' | 'left' | 'below' | 'above';

const CARD_W = 320;
const VIEWPORT_PAD = 12; // keep card away from viewport edges

export class TutorialOverlay implements TutorialUI {
  private readonly layer: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly ring: HTMLDivElement;
  private readonly arrow: HTMLDivElement;
  private readonly handle: HTMLDivElement;
  private readonly contentEl: HTMLDivElement;

  private domHighlight: string | null = null;
  private getTileRect: TileRectProvider | null = null;

  /** Card top-left in viewport coords. Updated on drag and on resize. */
  private cardPos: { left: number; top: number };

  /** Drag state. */
  private dragOffset: { x: number; y: number } | null = null;

  private rafId = 0;
  private disposed = false;

  private readonly onResize = () => this.clampCardIntoViewport();
  private readonly onPointerMove = (e: PointerEvent) => this.handleDragMove(e);
  private readonly onPointerUp   = (e: PointerEvent) => this.handleDragEnd(e);

  constructor(getTileRect?: TileRectProvider) {
    this.getTileRect = getTileRect ?? null;
    const host = document.getElementById('game-container') ?? document.body;

    this.layer = document.createElement('div');
    this.layer.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:10000;';

    this.ring = document.createElement('div');
    this.ring.style.cssText =
      'position:fixed;display:none;pointer-events:none;' +
      'border:2px solid var(--color-accent-soft,#7bd4ff);border-radius:8px;' +
      'box-shadow:0 0 0 3px rgba(123,212,255,0.30),0 0 16px rgba(123,212,255,0.60);' +
      'transition:left .12s ease,top .12s ease,width .12s ease,height .12s ease;';

    this.arrow = document.createElement('div');
    this.arrow.style.cssText =
      'position:fixed;display:none;pointer-events:none;width:0;height:0;border-style:solid;';

    this.card = document.createElement('div');
    this.card.style.cssText =
      `position:fixed;width:${CARD_W}px;max-height:60vh;pointer-events:auto;` +
      'background:var(--color-panel-alt,#16202e);border:1px solid rgba(100,168,255,0.45);' +
      'border-radius:10px;color:#e8f0ff;' +
      'box-shadow:0 8px 28px rgba(0,0,0,0.55);font-size:calc(13px * var(--ui-scale,1));' +
      'display:flex;flex-direction:column;overflow:hidden;';

    // Drag handle — obvious grip + cursor + "Drag me" hint.
    this.handle = document.createElement('div');
    this.handle.title = 'Drag to reposition';
    this.handle.style.cssText =
      'display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:grab;' +
      'background:rgba(100,168,255,0.12);border-bottom:1px solid rgba(100,168,255,0.25);' +
      'user-select:none;touch-action:none;';
    const grip = document.createElement('span');
    grip.textContent = '⠿';   // braille pattern dots-12345678 — reads as a 2-column grip
    grip.style.cssText = 'color:#7bd4ff;font-size:18px;line-height:1;letter-spacing:1px;';
    const hint = document.createElement('span');
    hint.textContent = 'Click and hold to drag';
    hint.style.cssText = 'color:#7bd4ff;font-size:0.78em;letter-spacing:0.08em;font-weight:700;text-transform:uppercase;';
    this.handle.append(grip, hint);
    this.handle.addEventListener('pointerdown', (e) => this.handleDragStart(e));

    // The actual content area (eyebrow / title / body / buttons go here).
    this.contentEl = document.createElement('div');
    this.contentEl.style.cssText = 'padding:var(--ui-pad,16px);overflow:auto;';

    this.card.append(this.handle, this.contentEl);

    this.layer.appendChild(this.ring);
    this.layer.appendChild(this.arrow);
    this.layer.appendChild(this.card);
    host.appendChild(this.layer);

    // Default: top-right corner.
    this.cardPos = { left: 0, top: VIEWPORT_PAD };
    // Defer first placement until offsetWidth is known (next frame).
    queueMicrotask(() => this.positionCardTopRight());

    this.tick = this.tick.bind(this);
    this.rafId = requestAnimationFrame(this.tick);
    window.addEventListener('resize', this.onResize);
  }

  setTileRectProvider(provider: TileRectProvider | null): void {
    this.getTileRect = provider;
  }

  setView(view: TutorialViewModel): void {
    if (this.disposed) return;
    this.domHighlight = view.domHighlight;
    this.contentEl.replaceChildren(...this.renderContent(view));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup',   this.onPointerUp);
    this.layer.remove();
  }

  // ── Drag ─────────────────────────────────────────────────────────────────

  private handleDragStart(e: PointerEvent): void {
    e.preventDefault();
    this.dragOffset = { x: e.clientX - this.cardPos.left, y: e.clientY - this.cardPos.top };
    this.handle.style.cursor = 'grabbing';
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup',   this.onPointerUp);
  }

  private handleDragMove(e: PointerEvent): void {
    if (!this.dragOffset) return;
    this.cardPos = { left: e.clientX - this.dragOffset.x, top: e.clientY - this.dragOffset.y };
    this.clampCardIntoViewport();
    this.applyCardPos();
  }

  private handleDragEnd(_e: PointerEvent): void {
    this.dragOffset = null;
    this.handle.style.cursor = 'grab';
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup',   this.onPointerUp);
  }

  // ── Position helpers ─────────────────────────────────────────────────────

  private positionCardTopRight(): void {
    const cardW = this.card.offsetWidth || CARD_W;
    this.cardPos = {
      left: window.innerWidth - cardW - VIEWPORT_PAD,
      top: VIEWPORT_PAD,
    };
    this.applyCardPos();
  }

  private clampCardIntoViewport(): void {
    const cardW = this.card.offsetWidth || CARD_W;
    const cardH = this.card.offsetHeight || 180;
    this.cardPos.left = clamp(this.cardPos.left, VIEWPORT_PAD, Math.max(VIEWPORT_PAD, window.innerWidth  - cardW - VIEWPORT_PAD));
    this.cardPos.top  = clamp(this.cardPos.top,  VIEWPORT_PAD, Math.max(VIEWPORT_PAD, window.innerHeight - cardH - VIEWPORT_PAD));
  }

  private applyCardPos(): void {
    this.card.style.left = `${this.cardPos.left}px`;
    this.card.style.top  = `${this.cardPos.top}px`;
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  private renderContent(view: TutorialViewModel): HTMLElement[] {
    if (view.phase === 'complete') return this.renderComplete(view);
    if (view.phase === 'bonus' && view.bonus) return this.renderBonus(view);
    return this.renderGuided(view);
  }

  private renderGuided(view: TutorialViewModel): HTMLElement[] {
    const s = view.step;
    const eyebrow = this.label(s ? `STEP ${s.index + 1} OF ${s.total}` : 'TUTORIAL');
    const title = this.heading(s?.title ?? 'Tutorial');
    const body = this.paragraph(s?.body ?? '');
    return [eyebrow, title, body];
  }

  private renderBonus(view: TutorialViewModel): HTMLElement[] {
    const b = view.bonus!;
    const eyebrow = this.label('OPTIONAL');
    const title = this.heading(b.title);

    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin:8px 0;';
    for (const item of b.items) {
      const row = document.createElement('div');
      row.style.cssText = `display:flex;gap:8px;align-items:flex-start;opacity:${item.done ? 0.55 : 1};`;
      const mark = document.createElement('span');
      mark.textContent = item.done ? '✓' : '○';
      mark.style.cssText = `color:${item.done ? '#89e4ad' : 'var(--color-accent-soft,#7bd4ff)'};font-weight:700;`;
      const text = document.createElement('span');
      text.textContent = item.label;
      text.style.textDecoration = item.done ? 'line-through' : 'none';
      row.appendChild(mark);
      row.appendChild(text);
      list.appendChild(row);
    }

    const hint = this.paragraph(b.body);
    hint.style.fontSize = '0.9em';
    hint.style.opacity = '0.85';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:10px;';
    btnRow.appendChild(this.button('Keep playing', 'btn-secondary', view.onDismiss));
    btnRow.appendChild(this.button('Back to menu', 'btn-primary', view.onBackToMenu));

    return [eyebrow, title, list, hint, btnRow];
  }

  private renderComplete(view: TutorialViewModel): HTMLElement[] {
    const eyebrow = this.label('TUTORIAL COMPLETE');
    const title = this.heading('Well done!');
    const body = this.paragraph(
      "You've covered the essentials. Keep playing this map, or head back to the menu for a real match.",
    );

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:10px;';
    btnRow.appendChild(this.button('Keep playing', 'btn-secondary', view.onDismiss));
    btnRow.appendChild(this.button('Back to menu', 'btn-primary', view.onBackToMenu));
    return [eyebrow, title, body, btnRow];
  }

  // ── Element helpers ─────────────────────────────────────────────────────

  private label(text: string): HTMLElement {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText =
      'font-size:0.72em;letter-spacing:0.08em;color:var(--color-accent-soft,#7bd4ff);font-weight:700;margin-bottom:4px;';
    return el;
  }

  private heading(text: string): HTMLElement {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'font-size:1.15em;font-weight:700;margin-bottom:6px;';
    return el;
  }

  private paragraph(text: string): HTMLElement {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'line-height:1.45;';
    return el;
  }

  private button(text: string, variant: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = `btn ${variant}`;
    btn.textContent = text;
    btn.style.flex = '1';
    btn.addEventListener('click', onClick);
    return btn;
  }

  // ── Per-frame tracking (ring + arrow) ───────────────────────────────────

  private tick(): void {
    if (this.disposed) return;

    // Ring is only drawn for DOM-element targets. Tile targets are already
    // ringed by GameScene's world-space `tutorialGraphic`, which tracks the
    // camera natively — drawing a DOM ring on top would lag during pan/zoom.
    const domRect = this.findDomTargetRect();
    if (domRect) this.layoutRing(domRect);
    else         this.ring.style.display = 'none';

    // Arrow points at whichever target exists.
    const arrowRect = domRect ?? (this.getTileRect ? this.getTileRect() : null);
    if (arrowRect) this.layoutArrowToTarget(arrowRect);
    else           this.arrow.style.display = 'none';

    this.rafId = requestAnimationFrame(this.tick);
  }

  private findDomTargetRect(): TargetRect | null {
    if (!this.domHighlight) return null;
    const el = document.querySelector(`[data-tutorial="${this.domHighlight}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  private layoutRing(rect: TargetRect): void {
    const pad = 4;
    this.ring.style.display = 'block';
    this.ring.style.left = `${rect.left - pad}px`;
    this.ring.style.top = `${rect.top - pad}px`;
    this.ring.style.width = `${rect.width + pad * 2}px`;
    this.ring.style.height = `${rect.height + pad * 2}px`;
  }

  /**
   * Decide which side of the card to draw the arrow on (the side whose edge
   * is closest to the target), then position the arrow tip toward the target.
   */
  private layoutArrowToTarget(rect: TargetRect): void {
    const cardW = this.card.offsetWidth || CARD_W;
    const cardH = this.card.offsetHeight || 180;
    const cardLeft = this.cardPos.left;
    const cardTop = this.cardPos.top;
    const cardRight = cardLeft + cardW;
    const cardBottom = cardTop + cardH;

    const targetCx = rect.left + rect.width / 2;
    const targetCy = rect.top + rect.height / 2;

    // Pick the closest card edge to the target centre.
    const dLeft   = Math.abs(targetCx - cardLeft);
    const dRight  = Math.abs(targetCx - cardRight);
    const dTop    = Math.abs(targetCy - cardTop);
    const dBottom = Math.abs(targetCy - cardBottom);

    let side: Side;
    const horizontalMin = Math.min(dLeft, dRight);
    const verticalMin = Math.min(dTop, dBottom);
    if (targetCx < cardLeft || targetCx > cardRight) {
      // Target is horizontally outside the card → favour left/right edges.
      side = targetCx < cardLeft ? 'left' : 'right';
    } else if (targetCy < cardTop || targetCy > cardBottom) {
      side = targetCy < cardTop ? 'above' : 'below';
    } else {
      // Target overlaps the card — use whichever edge is closest.
      side = horizontalMin < verticalMin
        ? (targetCx < (cardLeft + cardRight) / 2 ? 'left' : 'right')
        : (targetCy < (cardTop + cardBottom) / 2 ? 'above' : 'below');
    }

    const size = 10;
    const color = 'rgba(100,168,255,0.55)';
    const transparent = 'transparent';
    let style = '';
    let arrowLeft = 0;
    let arrowTop = 0;

    if (side === 'left') {
      // Target is to the LEFT of the card → arrow tip points LEFT, sits on card's left edge.
      style =
        `border-width:${size}px ${size}px ${size}px 0;` +
        `border-color:${transparent} ${color} ${transparent} ${transparent};`;
      arrowLeft = cardLeft - size;
      arrowTop = clamp(targetCy - size, cardTop + 4, cardBottom - size * 2 - 4);
    } else if (side === 'right') {
      style =
        `border-width:${size}px 0 ${size}px ${size}px;` +
        `border-color:${transparent} ${transparent} ${transparent} ${color};`;
      arrowLeft = cardRight;
      arrowTop = clamp(targetCy - size, cardTop + 4, cardBottom - size * 2 - 4);
    } else if (side === 'above') {
      style =
        `border-width:0 ${size}px ${size}px ${size}px;` +
        `border-color:${transparent} ${transparent} ${color} ${transparent};`;
      arrowLeft = clamp(targetCx - size, cardLeft + 4, cardRight - size * 2 - 4);
      arrowTop = cardTop - size;
    } else {
      style =
        `border-width:${size}px ${size}px 0 ${size}px;` +
        `border-color:${color} ${transparent} ${transparent} ${transparent};`;
      arrowLeft = clamp(targetCx - size, cardLeft + 4, cardRight - size * 2 - 4);
      arrowTop = cardBottom;
    }
    this.arrow.style.cssText =
      'position:fixed;display:block;pointer-events:none;width:0;height:0;border-style:solid;' +
      style +
      `left:${arrowLeft}px;top:${arrowTop}px;`;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
