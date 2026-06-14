import type { StartGameCallback } from '@/ui/UIManager';
import { SaveSystem } from '@/systems/save/SaveSystem';
import { SCENARIOS, DEFAULT_SCENARIO_ID, getScenarioById } from '@/config/scenarios';
import { normalizeGameSetup } from '@/types/gameSetup';
import type { Difficulty, GameSetup } from '@/types/gameSetup';

export class MenuPage {
  private setup: GameSetup = normalizeGameSetup({
    opponentCount: 1,
    difficulty: 'medium',
    gameMode: 'skirmish',
    scenarioId: DEFAULT_SCENARIO_ID,
  });

  private opponentBtns: Array<{ btn: HTMLButtonElement; value: number }> = [];
  private diffBtns: Array<{ btn: HTMLButtonElement; value: Difficulty }> = [];
  private scenarioBtns: Array<{ btn: HTMLButtonElement; value: string }> = [];
  private summaryEl!: HTMLElement;
  private scenarioNameEl: HTMLElement | null = null;
  private scenarioDescEl: HTMLElement | null = null;
  private scenarioStartBtn: HTMLButtonElement | null = null;

  private get standardDifficulty(): Difficulty {
    return this.setup.difficulty === 'sandbox' ? 'medium' : this.setup.difficulty;
  }

  constructor(private onStart: StartGameCallback) {}

  /** Wrap onStart so every launch flags the player as no-longer-new. */
  private startGame(opts: Parameters<StartGameCallback>[0]): void {
    try { localStorage.setItem('nml:hasPlayed', '1'); } catch { /* storage unavailable */ }
    this.onStart(opts);
  }

  private isNewPlayer(): boolean {
    try { return !localStorage.getItem('nml:hasPlayed'); } catch { return false; }
  }

  private tutorialScenarioId(): string | null {
    return SCENARIOS.find(s => s.isTutorial)?.id ?? null;
  }

  private startTutorial(): void {
    const id = this.tutorialScenarioId();
    if (!id) return;
    this.startGame({
      setup: { ...this.setup, gameMode: 'scenario', scenarioId: id, difficulty: 'sandbox', opponentCount: 1 },
    });
  }

  render(): HTMLElement {
    const root = document.createElement('div');
    root.className = 'modal-backdrop fullscreen';
    root.style.flexDirection = 'column';
    root.style.padding = 'var(--ui-pad)';
    root.style.gap = 'var(--ui-gap)';
    root.style.overflowY = 'auto';

    // Top accent bar
    const accentBar = document.createElement('div');
    accentBar.style.cssText = 'position:absolute;top:0;left:0;right:0;height:5px;background:var(--color-accent-soft);';
    root.appendChild(accentBar);

    // Header
    root.appendChild(this.buildHeader());

    // First-time-player nudge toward the tutorial
    if (this.isNewPlayer() && this.tutorialScenarioId()) {
      root.appendChild(this.buildNewPlayerBanner());
    }

    // 3-card row
    const cardRow = document.createElement('div');
    cardRow.className = 'row';
    cardRow.style.alignItems = 'stretch';
    cardRow.style.flex = '1';
    cardRow.style.flexWrap = 'wrap';
    cardRow.style.gap = 'var(--ui-gap)';

    cardRow.appendChild(this.buildScenarioCard());
    cardRow.appendChild(this.buildStandardCard());
    cardRow.appendChild(this.buildSandboxCard());
    root.appendChild(cardRow);

    // Load row
    root.appendChild(this.buildLoadRow());

    // Version
    const ver = document.createElement('div');
    ver.className = 'text-caption text-muted text-mono';
    ver.style.textAlign = 'right';
    ver.textContent = 'v0.1';
    root.appendChild(ver);

    this.refreshOpponentBtns();
    this.refreshDiffBtns();
    this.refreshScenarioBtns();

    return root;
  }

  private buildNewPlayerBanner(): HTMLElement {
    const banner = document.createElement('div');
    banner.className = 'panel-alt row spread';
    banner.style.alignItems = 'center';
    banner.style.gap = 'var(--ui-gap)';
    banner.style.borderColor = 'var(--color-accent-soft)';

    const text = document.createElement('div');
    text.className = 'text-body text-wrap';
    text.style.flex = '1';
    text.textContent = "👋 New here? The Tutorial walks you through the basics against a passive opponent.";

    const startBtn = document.createElement('button');
    startBtn.className = 'btn btn-primary';
    startBtn.textContent = 'START TUTORIAL';
    startBtn.addEventListener('click', () => this.startTutorial());

    const dismiss = document.createElement('button');
    dismiss.className = 'btn btn-ghost btn-sm';
    dismiss.textContent = '✕';
    dismiss.title = 'Dismiss';
    dismiss.addEventListener('click', () => {
      try { localStorage.setItem('nml:hasPlayed', '1'); } catch { /* storage unavailable */ }
      banner.remove();
    });

    banner.appendChild(text);
    banner.appendChild(startBtn);
    banner.appendChild(dismiss);
    return banner;
  }

  private buildHeader(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'col tight text-center';

    const title = document.createElement('div');
    title.className = 'text-title text-bold';
    title.textContent = "NO MAN'S LAND";

    const sub = document.createElement('div');
    sub.className = 'text-body text-dim';
    sub.textContent = 'Pick a preset scenario, set up a standard match, or explore freely in sandbox mode.';

    wrap.appendChild(title);
    wrap.appendChild(sub);
    return wrap;
  }

  private buildScenarioCard(): HTMLElement {
    const scenario = getScenarioById(this.setup.scenarioId);
    const enabled = scenario !== null;
    const card = document.createElement('div');
    card.className = 'menu-card';

    const lbl = document.createElement('div');
    lbl.className = 'section-label text-accent-soft';
    lbl.textContent = 'SCENARIO PICKER';

    const name = document.createElement('div');
    name.className = 'text-heading text-bold text-wrap';
    name.textContent = scenario?.name ?? 'No scenario configured';
    this.scenarioNameEl = name;

    card.appendChild(lbl);
    card.appendChild(name);

    if (SCENARIOS.length > 1) {
      const hint = document.createElement('div');
      hint.className = 'text-caption text-dim';
      hint.textContent = 'Choose a preset scenario.';
      card.appendChild(hint);

      const btnList = document.createElement('div');
      btnList.className = 'col tight';
      for (const s of SCENARIOS) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary btn-full btn-sm';
        btn.textContent = s.isTutorial ? `★ ${s.name.toUpperCase()}` : s.name.toUpperCase();
        btn.addEventListener('click', () => {
          this.setup.scenarioId = s.id;
          this.refreshScenarioBtns();
        });
        this.scenarioBtns.push({ btn, value: s.id });
        btnList.appendChild(btn);
      }
      card.appendChild(btnList);
    }

    const desc = document.createElement('div');
    desc.className = 'text-body text-dim text-wrap';
    desc.style.flex = '1';
    desc.style.whiteSpace = 'pre-line';
    this.scenarioDescEl = desc;
    card.appendChild(desc);

    const startBtn = document.createElement('button');
    startBtn.className = `btn btn-primary btn-full${enabled ? '' : ' disabled'}`;
    startBtn.disabled = !enabled;
    startBtn.addEventListener('click', () => {
      const chosen = getScenarioById(this.setup.scenarioId);
      this.startGame({ setup: {
        ...this.setup,
        opponentCount: 1,
        gameMode: 'scenario',
        scenarioId: this.setup.scenarioId ?? DEFAULT_SCENARIO_ID,
        // The tutorial relies on a passive opponent — disable the AI.
        ...(chosen?.isTutorial ? { difficulty: 'sandbox' as const } : {}),
      } });
    });
    this.scenarioStartBtn = startBtn;
    card.appendChild(startBtn);

    return card;
  }

  private buildStandardCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'menu-card';

    const lbl = document.createElement('div');
    lbl.className = 'section-label text-accent-soft';
    lbl.textContent = 'STANDARD MATCH';

    const name = document.createElement('div');
    name.className = 'text-heading text-bold';
    name.textContent = 'Custom Setup';

    const desc = document.createElement('div');
    desc.className = 'text-caption text-dim text-wrap';
    desc.textContent = 'Tune the opponent count and difficulty, then launch a normal match.';

    card.appendChild(lbl);
    card.appendChild(name);
    card.appendChild(desc);

    // Opponent selector
    card.appendChild(this.buildChoiceBlock(
      'Opponents',
      [1, 2, 3, 4].map(v => ({ label: String(v), value: v })),
      (v: number) => { this.setup.opponentCount = v; this.refreshOpponentBtns(); },
      this.opponentBtns,
    ));

    // Difficulty selector
    card.appendChild(this.buildChoiceBlock<Difficulty>(
      'Difficulty',
      [
        { label: 'EASY',   value: 'easy' },
        { label: 'MEDIUM', value: 'medium' },
        { label: 'HARD',   value: 'hard' },
      ],
      (v: Difficulty) => { this.setup.difficulty = v; this.refreshDiffBtns(); },
      this.diffBtns,
    ));

    this.summaryEl = document.createElement('div');
    this.summaryEl.className = 'text-body text-mono text-bold';
    this.summaryEl.style.flex = '1';
    card.appendChild(this.summaryEl);

    const startBtn = document.createElement('button');
    startBtn.className = 'btn btn-success btn-full';
    startBtn.textContent = 'START STANDARD MATCH';
    startBtn.addEventListener('click', () => {
      this.startGame({ setup: { ...this.setup, gameMode: 'skirmish', difficulty: this.standardDifficulty, scenarioId: null } });
    });
    card.appendChild(startBtn);

    return card;
  }

  private buildSandboxCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'menu-card';

    const lbl = document.createElement('div');
    lbl.className = 'section-label';
    lbl.style.color = '#7bd4ff';
    lbl.textContent = 'SANDBOX';

    const name = document.createElement('div');
    name.className = 'text-heading text-bold';
    name.textContent = 'Free Play';

    const desc = document.createElement('div');
    desc.className = 'text-caption text-dim text-wrap';
    desc.style.flex = '1';
    desc.textContent = 'No resource costs. No fog of war. Adjust AI level and paint terrain mid-game using the left toolbar.';

    const startBtn = document.createElement('button');
    startBtn.className = 'btn btn-primary btn-full';
    startBtn.textContent = 'START SANDBOX';
    startBtn.addEventListener('click', () => {
      this.startGame({ setup: { ...this.setup, gameMode: 'sandbox', difficulty: 'sandbox', opponentCount: 1, scenarioId: null } });
    });

    card.appendChild(lbl);
    card.appendChild(name);
    card.appendChild(desc);
    card.appendChild(startBtn);
    return card;
  }

  private buildChoiceBlock<T extends number | Difficulty>(
    title: string,
    options: Array<{ label: string; value: T }>,
    onClick: (value: T) => void,
    sink: Array<{ btn: HTMLButtonElement; value: T }>,
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'panel-alt col tight';

    const lbl = document.createElement('div');
    lbl.className = 'text-caption text-dim';
    lbl.textContent = title.toUpperCase();

    const btnRow = document.createElement('div');
    btnRow.className = 'row tight';

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary btn-sm grow';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => onClick(opt.value));
      sink.push({ btn, value: opt.value });
      btnRow.appendChild(btn);
    }

    wrap.appendChild(lbl);
    wrap.appendChild(btnRow);
    return wrap;
  }

  private buildLoadRow(): HTMLElement {
    const firstSave = SaveSystem.listSlots().find(s => !!s.saveData) ?? null;
    const row = document.createElement('div');
    row.className = 'row spread';

    const lbl = document.createElement('div');
    lbl.className = 'text-caption text-dim text-wrap';
    lbl.textContent = 'Or continue from your last local save.';

    const loadBtn = document.createElement('button');
    loadBtn.className = `btn btn-secondary${firstSave ? '' : ' disabled'}`;
    loadBtn.disabled = !firstSave;
    loadBtn.textContent = 'LOAD SAVED GAME';
    loadBtn.addEventListener('click', () => {
      if (!firstSave) return;
      const saveData = SaveSystem.load(firstSave.slot);
      if (!saveData) return;
      this.startGame({ setup: saveData.setup, saveData });
    });

    row.appendChild(lbl);
    row.appendChild(loadBtn);
    return row;
  }

  private refreshOpponentBtns(): void {
    for (const { btn, value } of this.opponentBtns) {
      btn.className = `btn btn-sm grow ${value === this.setup.opponentCount ? 'btn-primary active' : 'btn-secondary'}`;
    }
    if (this.summaryEl) {
      this.summaryEl.textContent = `${this.setup.opponentCount} Opponent${this.setup.opponentCount === 1 ? '' : 's'}  |  ${this.standardDifficulty.toUpperCase()}`;
    }
  }

  private refreshDiffBtns(): void {
    for (const { btn, value } of this.diffBtns) {
      btn.className = `btn btn-sm grow ${value === this.standardDifficulty ? 'btn-primary active' : 'btn-secondary'}`;
    }
    if (this.summaryEl) {
      this.summaryEl.textContent = `${this.setup.opponentCount} Opponent${this.setup.opponentCount === 1 ? '' : 's'}  |  ${this.standardDifficulty.toUpperCase()}`;
    }
  }

  private refreshScenarioBtns(): void {
    for (const { btn, value } of this.scenarioBtns) {
      btn.className = `btn btn-sm btn-full ${value === (this.setup.scenarioId ?? DEFAULT_SCENARIO_ID) ? 'btn-primary active' : 'btn-secondary'}`;
    }
    const scenario = getScenarioById(this.setup.scenarioId);
    if (this.scenarioNameEl) {
      this.scenarioNameEl.textContent = scenario?.name ?? 'No scenario configured';
    }
    if (this.scenarioDescEl) {
      if (scenario) {
        const player = scenario.nations.find(n => n.isPlayer);
        const aiNames = scenario.nations.filter(n => !n.isPlayer).map(n => n.name).join(', ');
        this.scenarioDescEl.textContent = `${scenario.description}\nPlayer: ${player?.name ?? '?'} vs ${aiNames}`;
      } else {
        this.scenarioDescEl.textContent = 'Add a scenario preset in src/config/scenarios.json to enable scenario mode.';
      }
    }
    if (this.scenarioStartBtn) {
      const enabled = scenario !== null;
      this.scenarioStartBtn.disabled = !enabled;
      this.scenarioStartBtn.className = `btn btn-primary btn-full${enabled ? '' : ' disabled'}`;
      this.scenarioStartBtn.textContent = enabled
        ? (scenario.isTutorial ? 'START TUTORIAL' : 'START SCENARIO')
        : 'SCENARIO UNAVAILABLE';
    }
  }
}
