/**
 * TutorialOverlay — the on-screen tutorial panel + highlight ring.
 *
 * Implements the TutorialUI surface the TutorialManager drives. Deliberately
 * non-blocking: the full-screen wrapper is `pointer-events:none` so the map and
 * HUD stay clickable; only the panel card and its buttons capture clicks. A
 * highlight ring (also click-through) tracks a `[data-tutorial]` element each frame.
 */

import type { TutorialUI, TutorialViewModel } from '@/systems/tutorial/TutorialManager';

export class TutorialOverlay implements TutorialUI {
  /** Holds the highlight ring; sits ABOVE modals (z 10000) so it can ring in-modal buttons. */
  private readonly ringLayer: HTMLDivElement;
  /** The guidance panel. Pinned middle-left to clear the minimap, top bar, and bottom bar. */
  private readonly card: HTMLDivElement;
  private readonly ring: HTMLDivElement;
  private domHighlight: string | null = null;
  private rafId = 0;
  private disposed = false;

  constructor() {
    const host = document.getElementById('game-container') ?? document.body;

    this.ringLayer = document.createElement('div');
    this.ringLayer.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:10000;';

    this.ring = document.createElement('div');
    this.ring.style.cssText =
      'position:fixed;display:none;pointer-events:none;border:2px solid var(--color-accent-soft,#7bd4ff);' +
      'border-radius:8px;box-shadow:0 0 0 3px rgba(123,212,255,0.25),0 0 14px rgba(123,212,255,0.55);' +
      'transition:left .08s,top .08s,width .08s,height .08s;';
    this.ringLayer.appendChild(this.ring);

    // Pinned to the clear middle-left band: below the top HUD bar, clear of the
    // top-right minimap and the bottom HUD bar. Kept above modals so guided-step
    // text stays visible; its right-aligned buttons never sit under this panel.
    this.card = document.createElement('div');
    this.card.style.cssText =
      'position:fixed;top:64px;left:12px;width:min(300px,40vw);max-height:60vh;overflow:auto;' +
      'pointer-events:auto;z-index:10000;' +
      'background:var(--color-panel-alt,#16202e);border:1px solid rgba(100,168,255,0.35);' +
      'border-radius:8px;padding:var(--ui-pad,16px);color:#e8f0ff;' +
      'box-shadow:0 6px 24px rgba(0,0,0,0.45);font-size:calc(13px * var(--ui-scale,1));';

    host.appendChild(this.card);
    host.appendChild(this.ringLayer);

    this.tick = this.tick.bind(this);
    this.rafId = requestAnimationFrame(this.tick);
  }

  setView(view: TutorialViewModel): void {
    if (this.disposed) return;
    this.domHighlight = view.domHighlight;
    this.card.replaceChildren(...this.renderCard(view));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.card.remove();
    this.ringLayer.remove();
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  private renderCard(view: TutorialViewModel): HTMLElement[] {
    if (view.phase === 'complete') return this.renderComplete(view);
    if (view.phase === 'objective' && view.objectives) {
      return this.renderObjectives(view);
    }
    return this.renderGuided(view);
  }

  private renderGuided(view: TutorialViewModel): HTMLElement[] {
    const g = view.guided;
    const eyebrow = this.label(g ? `STEP ${g.index + 1} OF ${g.total}` : 'TUTORIAL');
    const title = this.heading(g?.title ?? 'Tutorial');
    const body = this.paragraph(g?.body ?? '');
    return [eyebrow, title, body, this.footer(view)];
  }

  private renderObjectives(view: TutorialViewModel): HTMLElement[] {
    const o = view.objectives!;
    const eyebrow = this.label('TUTORIAL');
    const title = this.heading(o.title);

    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin:8px 0;';
    for (const item of o.items) {
      const row = document.createElement('div');
      row.style.cssText = `display:flex;gap:8px;align-items:flex-start;opacity:${item.done ? 0.6 : 1};`;
      const mark = document.createElement('span');
      mark.textContent = item.done ? '✓' : '○';
      mark.style.cssText = `color:${item.done ? '#89e4ad' : 'var(--color-accent-soft,#7bd4ff)'};font-weight:700;`;
      const text = document.createElement('span');
      text.textContent = item.label + (item.bonus ? '' : '');
      text.style.textDecoration = item.done ? 'line-through' : 'none';
      row.appendChild(mark);
      row.appendChild(text);
      list.appendChild(row);
    }

    const hint = this.paragraph(o.body);
    hint.style.fontSize = '0.9em';
    hint.style.opacity = '0.85';
    return [eyebrow, title, list, hint, this.footer(view)];
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

  private footer(view: TutorialViewModel): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;margin-top:10px;';
    const skip = document.createElement('button');
    skip.textContent = 'Skip tutorial';
    skip.style.cssText =
      'background:transparent;border:none;color:var(--color-dim,#8aa0bd);cursor:pointer;' +
      'font-size:0.85em;text-decoration:underline;padding:2px 4px;';
    skip.addEventListener('click', view.onSkip);
    row.appendChild(skip);
    return row;
  }

  // ── Small element helpers ───────────────────────────────────────────────

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
    el.style.cssText = 'line-height:1.4;';
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

  // ── Ring tracking ─────────────────────────────────────────────────────────

  private tick(): void {
    if (this.disposed) return;
    const key = this.domHighlight;
    const el = key ? document.querySelector(`[data-tutorial="${key}"]`) : null;
    if (el) {
      const r = el.getBoundingClientRect();
      const pad = 4;
      this.ring.style.display = 'block';
      this.ring.style.left = `${r.left - pad}px`;
      this.ring.style.top = `${r.top - pad}px`;
      this.ring.style.width = `${r.width + pad * 2}px`;
      this.ring.style.height = `${r.height + pad * 2}px`;
    } else {
      this.ring.style.display = 'none';
    }
    this.rafId = requestAnimationFrame(this.tick);
  }
}
