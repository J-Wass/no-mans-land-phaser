import type { PhaserUIBridge } from '@/ui/PhaserUIBridge';
import { TICK_RATE } from '@/config/constants';

export type GameOutcome = 'victory' | 'defeat';

export class GameOverModal {
  constructor(
    private bridge: PhaserUIBridge,
    private outcome: GameOutcome,
    private endTick: number,
  ) {}

  render(): HTMLElement {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    panel.style.cssText += 'width:min(480px,90vw);text-align:center;gap:var(--ui-gap);';

    panel.appendChild(this.buildTitle());
    panel.appendChild(this.buildDuration());

    const survivors = this.bridge.gameState.getAllNations();
    if (survivors.length > 0) {
      panel.appendChild(this.buildSurvivors(survivors));
    }

    const defeated = this.bridge.gameState.getDefeatedNations();
    if (defeated.length > 0) {
      panel.appendChild(this.buildDefeated(defeated));
    }

    const menuBtn = document.createElement('button');
    menuBtn.className = 'btn btn-primary';
    menuBtn.style.width = '100%';
    menuBtn.textContent = 'RETURN TO MENU';
    menuBtn.addEventListener('click', () => this.bridge.goToMenu());
    panel.appendChild(menuBtn);

    backdrop.appendChild(panel);
    return backdrop;
  }

  private buildTitle(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'text-heading text-bold';
    el.style.fontSize = '2.4em';
    el.style.letterSpacing = '0.08em';
    el.style.color = this.outcome === 'victory' ? 'var(--color-success)' : 'var(--color-danger)';
    el.textContent = this.outcome === 'victory' ? 'VICTORY' : 'DEFEAT';
    return el;
  }

  private buildDuration(): HTMLElement {
    const totalSecs = Math.floor(this.endTick / TICK_RATE);
    const minutes   = Math.floor(totalSecs / 60);
    const secs      = totalSecs % 60;
    const el = document.createElement('div');
    el.className = 'text-body text-dim';
    el.textContent = `Game duration: ${minutes}m ${secs.toString().padStart(2, '0')}s`;
    return el;
  }

  private buildSurvivors(nations: import('@/entities/nations/Nation').Nation[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'panel-alt col tight';

    const label = document.createElement('div');
    label.className = 'text-caption text-accent-soft text-mono text-bold';
    label.textContent = 'Surviving Nations';
    wrap.appendChild(label);

    for (const nation of nations) {
      const row = document.createElement('div');
      row.className = 'row tight';
      row.style.justifyContent = 'center';

      const swatch = document.createElement('div');
      swatch.style.cssText = `width:10px;height:10px;border-radius:50%;background:${nation.getColor()};flex-shrink:0;margin-top:2px;`;

      const name = document.createElement('span');
      name.className = 'text-body text-mono';
      name.textContent = nation.getName();

      row.appendChild(swatch);
      row.appendChild(name);
      wrap.appendChild(row);
    }
    return wrap;
  }

  private buildDefeated(tombstones: import('@/managers/GameState').DefeatedNationData[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'panel-alt col tight';

    const label = document.createElement('div');
    label.className = 'text-caption text-dim text-mono';
    label.textContent = 'Defeated Nations';
    wrap.appendChild(label);

    for (const t of tombstones) {
      const row = document.createElement('div');
      row.className = 'row tight';
      row.style.justifyContent = 'center';

      const swatch = document.createElement('div');
      swatch.style.cssText = `width:10px;height:10px;border-radius:50%;background:${t.color};flex-shrink:0;margin-top:2px;opacity:0.5;`;

      const name = document.createElement('span');
      name.className = 'text-caption text-dim text-mono';
      name.style.textDecoration = 'line-through';
      name.textContent = t.name;

      row.appendChild(swatch);
      row.appendChild(name);
      wrap.appendChild(row);
    }
    return wrap;
  }

  destroy(): void {}
}
