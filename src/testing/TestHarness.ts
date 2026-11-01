/**
 * TestHarness — `window.__TEST__`, the seam an automated (LLM) playtester
 * drives the real game through. Dev builds only: main.ts loads this module
 * when the URL has `?test=1`.
 *
 * The harness holds simulation time (the game renders but never ticks on its
 * own) so the tester can think as long as it likes, then advances time
 * explicitly. It records every game event, every player command and every
 * error; checks invariants as time advances; and can write evidence files
 * into `qa-reports/` through the dev server (see vite.config.ts).
 *
 * See .claude/skills/playtest/reference/harness-api.md for the full API.
 */

import Phaser from 'phaser';
import { testHooks } from '@/testing/testHooks';
import type { GameSceneHandles } from '@/testing/testHooks';
import { checkInvariants, violationKey } from '@/testing/invariants';
import type { Violation } from '@/testing/invariants';
import { buildPlayerView, renderAsciiMap, MAP_LEGEND, ticksLeft } from '@/testing/playerView';
import type { ViewContext } from '@/testing/playerView';
import { eventInvolvesNation, payloadUnitIds } from '@/testing/eventInvolvement';
import type { OwnershipLookup } from '@/testing/eventInvolvement';
import { UIManager } from '@/ui/UIManager';
import { SaveSystem } from '@/systems/save/SaveSystem';
import { normalizeGameSetup } from '@/types/gameSetup';
import type { GameSetup, Difficulty, GameMode } from '@/types/gameSetup';
import type { GameCommand, CommandResult } from '@/commands/GameCommand';
import type { GameEventMap } from '@/systems/events/GameEventBus';
import { TILE_SIZE } from '@/config/constants';
import { Rng } from '@/systems/random/Rng';

// ── Types ───────────────────────────────────────────────────────────────────

interface RecordedEvent {
  seq:  number;
  tick: number;
  type: string;
  /** True when the event involves the local player's nation, units or cities. */
  mine: boolean;
  data: unknown;
}

interface RecordedCommand {
  tick:    number;
  command: GameCommand;
  result:  CommandResult;
}

interface RecordedError {
  tick:    number;
  kind:    'error' | 'unhandledrejection' | 'console.error' | 'console.warn';
  message: string;
}

interface TrackedViolation extends Violation {
  firstTick: number;
  lastTick:  number;
}

interface AdvanceOptions {
  /** Event names that stop the advance early, or 'notable' for the default set. */
  stopOn?:     string[] | 'notable' | 'none';
  /** Only stop on events that involve the local player (default true). */
  mineOnly?:   boolean;
  /** Stop as soon as a new error-level invariant violation or runtime error appears (default true). */
  stopOnBug?:  boolean;
  /** Real milliseconds to wait afterwards so animations reach the new state (default 300). */
  settleMs?:   number;
}

interface TaskTimer {
  name:          string;
  startClicks:   number;
  startTick:     number;
  startCommands: number;
  startFailures: number;
}

// Events too frequent to store individually; they are only counted.
const NOISY_EVENTS = new Set<string>([
  'game:tick', 'unit:step-complete', 'battle:round-resolved', 'city:siege-round',
  'territory:conquest-progress', 'morale:gained', 'morale:lost', 'ranged:fired',
  'ui:camera-panned', 'unit:selected', 'city:selected', 'territory:highlighted',
]);

const NOTABLE_EVENTS = [
  'battle:started', 'battle:ended', 'city:siege-started', 'city:conquered', 'unit:destroyed',
  'diplomacy:war-declared', 'diplomacy:peace-signed', 'nation:defeated', 'spy:detected',
  'nation:research-complete', 'city:unit-spawned', 'city:production-complete', 'city:building-built',
  'territory:building-built', 'territory:conquest-started', 'unit:withdrew', 'morale:band-changed',
];

const MAX_EVENTS = 5000;
const INVARIANT_CHECK_EVERY = 10;
/** A stretch this long with no event touching the player is logged as dead time. */
const DEAD_TIME_TICKS = 300;
const SCRATCH_SAVE_SLOT = SaveSystem.SLOT_COUNT - 1;

// ── Harness ─────────────────────────────────────────────────────────────────

class TestHarness {
  private h: GameSceneHandles | null = null;
  private attachWaiters: Array<(h: GameSceneHandles) => void> = [];
  private setup: GameSetup | null = null;
  private readonly sessionDir: string;

  private events: RecordedEvent[] = [];
  private eventSeq = 0;
  private eventCounts = new Map<string, number>();
  private commands: RecordedCommand[] = [];
  private errors: RecordedError[] = [];
  private violations = new Map<string, TrackedViolation>();
  private clicks = { total: 0, canvas: 0, dom: 0 };
  private ticksAdvanced = 0;
  private lastMineEventTick = 0;
  private deadTime: Array<{ from: number; to: number }> = [];
  private firsts: Record<string, number> = {};
  private task: TaskTimer | null = null;
  private tasks: Array<Record<string, unknown>> = [];
  /** Last known owner of every unit seen, so events about removed units still attribute correctly. */
  private unitOwners = new Map<string, string>();

  /** Set by the event recorder while an advance() is running. */
  private stopReason: string | null = null;
  private stopFilter: { names: Set<string>; mineOnly: boolean; onBug: boolean } | null = null;

  private game!: Phaser.Game;

  constructor(private readonly params: URLSearchParams) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.sessionDir = sanitizeSegment(params.get('session') ?? `${stamp}-seed${params.get('seed') ?? 'random'}`);
  }

  // ── Installation ──────────────────────────────────────────────────────────

  install(game: Phaser.Game): void {
    this.game = game;
    testHooks.holdTime = this.params.get('realtime') !== '1';
    testHooks.storageNamespace = 'qa-';
    testHooks.onGameSceneReady = (handles) => this.attach(handles);

    this.game.sound.mute = this.params.get('sound') !== '1';

    window.addEventListener('pointerdown', (e) => {
      this.clicks.total++;
      if (e.target instanceof HTMLCanvasElement) this.clicks.canvas++;
      else this.clicks.dom++;
    }, { capture: true });

    if (this.params.get('autostart') === '1') this.autostart();
  }

  private autostart(): void {
    const seed = Number(this.params.get('seed'));
    const mode = (this.params.get('mode') ?? 'skirmish') as GameMode;
    const setup = normalizeGameSetup({
      opponentCount: Number(this.params.get('opponents') ?? 1),
      difficulty:    (this.params.get('difficulty') ?? 'medium') as Difficulty,
      gameMode:      mode,
      scenarioId:    this.params.get('scenario'),
      seed:          Number.isFinite(seed) && this.params.has('seed') ? seed : Rng.randomSeed(),
    });
    const tryStart = (): void => {
      if (!UIManager.startGameFromMenu({ setup })) window.setTimeout(tryStart, 100);
    };
    tryStart();
  }

  private attach(handles: GameSceneHandles): void {
    this.h = handles;
    this.setup = handles.setup;

    this.unitOwners.clear();
    for (const u of handles.gameState.getAllUnits()) this.unitOwners.set(u.id, u.getOwnerId());

    // Record every game event (the bus is recreated per GameScene, so re-wrap each time).
    // Record *before* dispatching: listeners run synchronously and can change the
    // state that decides `mine` (and emit nested events, which would otherwise be
    // logged ahead of the event that caused them).
    const bus = handles.eventBus;
    const originalEmit = bus.emit.bind(bus);
    bus.emit = (<K extends keyof GameEventMap>(type: K, payload: GameEventMap[K]) => {
      this.recordEvent(type, payload);
      originalEmit(type, payload);
    }) as typeof bus.emit;

    // Log every command the player issues, whether from the UI or from issue().
    const adapter = handles.networkAdapter;
    const originalSend = adapter.sendCommand.bind(adapter);
    adapter.sendCommand = async (command: GameCommand): Promise<CommandResult> => {
      const tick = handles.tickEngine.getCurrentTick();
      const result = await originalSend(command);
      this.commands.push({ tick, command, result });
      return result;
    };

    this.lastMineEventTick = handles.tickEngine.getCurrentTick();
    const waiters = this.attachWaiters;
    this.attachWaiters = [];
    waiters.forEach(w => w(handles));
  }

  captureErrors(): void {
    window.addEventListener('error', (e) => this.recordError('error', e.message || String(e.error)));
    window.addEventListener('unhandledrejection', (e) => this.recordError('unhandledrejection', describe(e.reason)));
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    console.error = (...args: unknown[]) => { this.recordError('console.error', args.map(describe).join(' ')); origError(...args); };
    console.warn = (...args: unknown[]) => { this.recordError('console.warn', args.map(describe).join(' ')); origWarn(...args); };
  }

  // ── Recording ─────────────────────────────────────────────────────────────

  private recordError(kind: RecordedError['kind'], message: string): void {
    this.errors.push({ tick: this.tick(), kind, message: message.slice(0, 2000) });
    if (kind !== 'console.warn' && this.stopFilter?.onBug && !this.stopReason) this.stopReason = `runtime ${kind}: ${message.slice(0, 200)}`;
  }

  private recordEvent(type: string, payload: unknown): void {
    this.eventCounts.set(type, (this.eventCounts.get(type) ?? 0) + 1);
    if (NOISY_EVENTS.has(type)) return;
    const tick = this.tick();
    const mine = this.involvesMe(payload);
    this.events.push({ seq: ++this.eventSeq, tick, type, mine, data: plain(payload) });
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);

    if (mine) {
      if (tick - this.lastMineEventTick >= DEAD_TIME_TICKS) this.deadTime.push({ from: this.lastMineEventTick, to: tick });
      this.lastMineEventTick = tick;
      if (type === 'battle:started' || type === 'city:siege-started') this.firsts['firstCombat'] ??= tick;
      if (type === 'diplomacy:war-declared') this.firsts['firstWar'] ??= tick;
      if (type === 'city:conquered') this.firsts['firstCityChange'] ??= tick;
    }

    const f = this.stopFilter;
    if (f && !this.stopReason && f.names.has(type) && (!f.mineOnly || mine)) this.stopReason = `event ${type}`;
  }

  private involvesMe(payload: unknown): boolean {
    const me = this.myNationId();
    if (!me || !this.h) return false;
    const lookup = this.ownershipLookup(this.h);
    for (const id of payloadUnitIds(payload)) lookup.unitOwner(id); // warm the owner cache
    return eventInvolvesNation(payload, me, lookup);
  }

  private ownershipLookup(h: GameSceneHandles): OwnershipLookup {
    const gs = h.gameState;
    return {
      unitOwner: (id) => {
        const owner = gs.getUnit(id)?.getOwnerId();
        if (owner) { this.unitOwners.set(id, owner); return owner; }
        return this.unitOwners.get(id);
      },
      cityOwner: (id) => gs.getCity(id)?.getOwnerId(),
      tileOwner: (p) => gs.getGrid().getTerritory(p)?.getControllingNation(),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private need(): GameSceneHandles {
    if (!this.h) throw new Error('No game running yet — start one (or use ?autostart=1) and wait for __TEST__.ready');
    return this.h;
  }

  private tick(): number { return this.h?.tickEngine.getCurrentTick() ?? 0; }

  private myNationId(): string | null {
    return this.h?.gameState.getLocalPlayer()?.getControlledNationId() ?? null;
  }

  private viewContext(): ViewContext {
    const h = this.need();
    const me = this.myNationId() ?? '';
    const vision = h.fogDisabled || !me ? null : h.visionSystem.compute(h.gameState, me, h.tickEngine.getCurrentTick());
    return {
      gameState:        h.gameState,
      tick:             h.tickEngine.getCurrentTick(),
      viewerNationId:   me,
      vision,
      visionSystem:     h.visionSystem,
      movementSystem:   h.movementSystem,
      diplomacySystem:  h.diplomacySystem,
      battles:          h.tickEngine.getBattleStates(),
      sieges:           h.tickEngine.getSiegeStates(),
      territoryBattles: h.tickEngine.getTerritoryBattleStates(),
    };
  }

  /** Run invariants; returns violations not seen before (by rule + message). */
  private runInvariants(): TrackedViolation[] {
    const h = this.need();
    const tick = h.tickEngine.getCurrentTick();
    const found = checkInvariants({
      gameState:        h.gameState,
      battles:          h.tickEngine.getBattleStates(),
      sieges:           h.tickEngine.getSiegeStates(),
      territoryBattles: h.tickEngine.getTerritoryBattleStates(),
      movingUnitIds:    h.movementSystem.getAllStates().keys(),
    });
    const fresh: TrackedViolation[] = [];
    for (const v of found) {
      const k = violationKey(v);
      const existing = this.violations.get(k);
      if (existing) { existing.lastTick = tick; continue; }
      const tracked = { ...v, firstTick: tick, lastTick: tick };
      this.violations.set(k, tracked);
      fresh.push(tracked);
    }
    return fresh;
  }

  private canvasRect(): DOMRect { return this.game.canvas.getBoundingClientRect(); }

  /** Phaser canvas pixel → CSS viewport pixel. */
  private toViewport(x: number, y: number): { x: number; y: number } {
    const rect = this.canvasRect();
    return {
      x: Math.round(rect.left + x * (rect.width / this.game.canvas.width)),
      y: Math.round(rect.top + y * (rect.height / this.game.canvas.height)),
    };
  }

  /**
   * Wait for `count` rendered frames. Browsers don't fire animation frames in a
   * hidden or minimized tab, so fall back to a timeout rather than hanging.
   */
  private nextFrames(count = 2): Promise<void> {
    const frames = new Promise<void>(resolve => {
      const step = (n: number): void => { if (n <= 0) resolve(); else requestAnimationFrame(() => step(n - 1)); };
      step(count);
    });
    const timeout = new Promise<void>(resolve => window.setTimeout(resolve, 250 * count));
    return Promise.race([frames, timeout]);
  }

  private async post(relPath: string, content: string, encoding: 'utf8' | 'base64' = 'utf8'): Promise<string> {
    const path = `${this.sessionDir}/${relPath}`;
    const res = await fetch('/__qa/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content, encoding }),
    });
    if (!res.ok) throw new Error(`qa write failed (${res.status}): ${await res.text()}`);
    return `qa-reports/${path}`;
  }

  // ── Public API (exposed as window.__TEST__) ───────────────────────────────

  get ready(): boolean { return this.h !== null && this.game.scene.isActive('GameScene'); }

  info() {
    return {
      ready:       this.ready,
      sessionDir:  `qa-reports/${this.sessionDir}`,
      scenes:      this.game.scene.getScenes(true).map(s => s.scene.key),
      setup:       this.setup,
      tick:        this.tick(),
      myNationId:  this.myNationId(),
      timeHeld:    testHooks.holdTime,
      viewport:    { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
      fogDisabled: this.h?.fogDisabled ?? null,
      /** True when the tab is hidden/minimized: the canvas stops redrawing, so screenshots go stale. */
      pageHidden:  document.hidden,
    };
  }

  /** What the local player can currently see, as compact JSON. */
  state() { return buildPlayerView(this.viewContext()); }

  /** ASCII map (fog applied). Omit opts for the whole map. */
  map(opts: { row?: number; col?: number; radius?: number } = {}): string {
    const center = opts.row !== undefined && opts.col !== undefined ? { row: opts.row, col: opts.col } : undefined;
    return renderAsciiMap(this.viewContext(), center ? { center, radius: opts.radius ?? 12 } : {});
  }

  mapLegend(): string { return MAP_LEGEND; }

  /** Details of one tile, if the player can see it. */
  tile(row: number, col: number) {
    const ctx = this.viewContext();
    const t = ctx.gameState.getGrid().getTerritory({ row, col });
    if (!t) return { error: 'off map' };
    const k = `${row},${col}`;
    const visible = ctx.vision === null || ctx.vision.visible.has(k);
    const discovered = visible || (ctx.vision?.discovered.has(k) ?? false);
    if (!discovered) return { row, col, discovered: false };
    const construction = t.getCurrentConstruction();
    // The game keeps drawing a city's sprite and name on discovered tiles even out of sight.
    const cityId = t.getCityId();
    const city = cityId ? ctx.gameState.getCity(cityId) : undefined;
    return {
      row, col, visible,
      terrain:   t.getTerrainType(),
      deposit:   t.getResourceDeposit(),
      ...(!visible && city ? { city: city.id, cityName: city.getName() } : {}),
      ...(visible ? {
        owner:        t.getControllingNation(),
        hp:           `${Math.ceil(t.getHealth())}/${t.getMaxHealth()}`,
        buildings:    t.getBuildings().map(b => `${b}:${t.getBuildingLevel(b)}`),
        construction: construction ? `${construction.label} (${ticksLeft(construction.ticksRemaining)}t left)` : null,
        city:         cityId,
        ...(city ? { cityName: city.getName() } : {}),
        units:        ctx.gameState.getAllUnits()
          .filter(u => u.position.row === row && u.position.col === col)
          .filter(u => u.getOwnerId() === ctx.viewerNationId || !u.isSpy())
          .map(u => ({ id: u.id, owner: u.getOwnerId(), type: u.getUnitType() })),
      } : {}),
    };
  }

  /** Recorded events (newest last). `since` is an event seq number from a previous call. */
  eventLog(opts: { since?: number; mineOnly?: boolean; limit?: number } = {}) {
    const list = this.events.filter(e => e.seq > (opts.since ?? 0) && (!opts.mineOnly || e.mine));
    return list.slice(-(opts.limit ?? 60));
  }

  /** HUD alerts/toasts raised so far (they fade on screen after 4s; this keeps them all). */
  notifications(sinceTick = 0) {
    const ui = this.game.scene.getScene('UIScene') as unknown as { getNotifications?: () => ReadonlyArray<{ text: string; createdTick: number }> };
    return (ui.getNotifications?.() ?? []).filter(n => n.createdTick >= sinceTick);
  }

  /**
   * Advance simulation time by up to `ticks`, stopping early on the requested
   * events, a new bug, or the game ending. Resolves after the screen settles.
   */
  async advance(ticks: number, opts: AdvanceOptions = {}) {
    const h = this.need();
    const from = h.tickEngine.getCurrentTick();
    const names = opts.stopOn === 'none' ? [] : opts.stopOn === undefined || opts.stopOn === 'notable' ? NOTABLE_EVENTS : opts.stopOn;
    this.stopReason = null;
    this.stopFilter = { names: new Set(names), mineOnly: opts.mineOnly ?? true, onBug: opts.stopOnBug ?? true };
    const seqBefore = this.eventSeq;
    const errorsBefore = this.errors.length;
    const fresh: TrackedViolation[] = [];
    const me = this.myNationId();

    try {
      for (let i = 0; i < ticks; i++) {
        if (UIManager.isOpen('gameOver')) { this.stopReason ??= 'game over'; break; }
        h.step();
        this.ticksAdvanced++;
        // Fog discovery normally updates every rendered frame; keep it per-tick here.
        if (!h.fogDisabled && me) h.visionSystem.compute(h.gameState, me, h.tickEngine.getCurrentTick());
        if ((i + 1) % INVARIANT_CHECK_EVERY === 0 || i === ticks - 1) {
          const newOnes = this.runInvariants();
          fresh.push(...newOnes);
          if (this.stopFilter.onBug && newOnes.some(v => v.severity === 'error')) this.stopReason ??= 'invariant violation';
        }
        if (this.stopReason) break;
      }
    } finally {
      this.stopFilter = null;
    }

    if (me && !this.firsts['firstContact'] && h.gameState.getKnownNationIds(me).length > 0) {
      this.firsts['firstContact'] = h.tickEngine.getCurrentTick();
    }
    const to = h.tickEngine.getCurrentTick();

    await this.nextFrames(2);
    await new Promise(r => window.setTimeout(r, opts.settleMs ?? 300));

    const newEvents = this.events.filter(e => e.seq > seqBefore);
    return {
      from, to, advanced: to - from,
      stoppedBy:     this.stopReason ?? (to - from < ticks ? 'unknown' : 'completed'),
      ticksSinceAnythingHappenedToMe: to - this.lastMineEventTick,
      myEvents:      newEvents.filter(e => e.mine).slice(-25).map(e => ({ tick: e.tick, type: e.type, data: e.data })),
      otherEventCount: newEvents.filter(e => !e.mine).length,
      newViolations: fresh,
      newErrors:     this.errors.slice(errorsBefore),
      gameOver:      UIManager.isOpen('gameOver'),
      lastEventSeq:  this.eventSeq,
      pageHidden:    document.hidden,
    };
  }

  /** Hold (true) or release (false) simulation time. Released, the game runs at the HUD speed. */
  holdTime(hold: boolean): boolean { testHooks.holdTime = hold; return hold; }

  /** Issue a command as the local player. playerId and issuedAtTick are filled in if omitted. */
  async issue(command: Record<string, unknown>): Promise<CommandResult> {
    const h = this.need();
    const player = h.gameState.getLocalPlayer();
    if (!player) return { success: false, reason: 'no local player' };
    const full = {
      playerId: player.getId(),
      issuedAtTick: h.tickEngine.getCurrentTick(),
      ...command,
    } as unknown as GameCommand;
    return h.networkAdapter.sendCommand(full);
  }

  /**
   * Order a unit to a tile using the game's own pathfinder (as a map click
   * would, minus the UI's war-confirmation prompt).
   */
  async moveTo(unitId: string, row: number, col: number): Promise<CommandResult & { pathLength?: number }> {
    const h = this.need();
    const unit = h.gameState.getUnit(unitId);
    if (!unit) return { success: false, reason: `no unit ${unitId}` };
    const path = h.pathfinder.findPath(
      unit.position, { row, col }, unit.getUnitType(), unit.getStats(), unit.getOwnerId(), h.gameState,
    );
    if (!path || path.length === 0) return { success: false, reason: 'no path to that tile' };
    const result = await this.issue({ type: 'MOVE_UNIT', unitId, path });
    return { ...result, pathLength: path.length };
  }

  /** Open DOM modals/overlays and the canvas HUD, with click coordinates in viewport CSS pixels. */
  ui() {
    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const controlInfo = (el: Element) => {
      const r = el.getBoundingClientRect();
      const input = el as HTMLInputElement;
      const label = ((el as HTMLElement).innerText || input.value || el.getAttribute('aria-label') || el.getAttribute('title') || '')
        .replace(/\s+/g, ' ').trim().slice(0, 80);
      return {
        label, tag: el.tagName.toLowerCase(),
        enabled: !(input.disabled || el.getAttribute('aria-disabled') === 'true'),
        x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
        ...(el.getAttribute('title') ? { tooltip: el.getAttribute('title') } : {}),
      };
    };

    const roots: Element[] = [];
    const overlay = document.getElementById('ui-overlay');
    if (overlay) roots.push(...Array.from(overlay.children));
    const container = document.getElementById('game-container');
    if (container) {
      roots.push(...Array.from(container.children).filter(el => el !== overlay && !(el instanceof HTMLCanvasElement)));
    }
    const modals = roots.filter(visible).map(el => ({
      id:       (el as HTMLElement).dataset['modalId'] ?? (el.className || el.tagName.toLowerCase()),
      text:     (el as HTMLElement).innerText.replace(/\n{2,}/g, '\n').trim().slice(0, 3000),
      controls: Array.from(el.querySelectorAll('button, [role="button"], input, select, a[href]'))
        .filter(visible).map(controlInfo),
    }));

    return { modals, hud: this.hudSnapshot() };
  }

  private hudSnapshot() {
    const ui = this.game.scene.getScene('UIScene');
    if (!ui || !this.game.scene.isActive('UIScene') && !this.game.scene.isPaused('UIScene')) return [];

    const flat: Phaser.GameObjects.GameObject[] = [];
    const walk = (list: Phaser.GameObjects.GameObject[]): void => {
      for (const obj of list) {
        const vis = obj as unknown as { visible?: boolean; alpha?: number };
        if (vis.visible === false || vis.alpha === 0) continue;
        flat.push(obj);
        if (obj instanceof Phaser.GameObjects.Container) walk(obj.list);
      }
    };
    walk(ui.children.list);

    type Box = { x: number; y: number; w: number; h: number };
    const boundsOf = (obj: Phaser.GameObjects.GameObject): Box | null => {
      const b = (obj as unknown as { getBounds?: () => Phaser.Geom.Rectangle }).getBounds?.();
      return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
    };
    const buttons = flat
      .filter(o => o.input?.enabled && o.input.cursor === 'pointer')
      .map(o => boundsOf(o))
      .filter((b): b is Box => b !== null);
    const contains = (b: Box, x: number, y: number): boolean => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

    return flat
      .filter((o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text && o.text.trim() !== '')
      .map(t => {
        const b = t.getBounds();
        const cx = b.centerX, cy = b.centerY;
        const btn = buttons.filter(bb => contains(bb, cx, cy)).sort((a, z) => a.w * a.h - z.w * z.h)[0];
        const p = this.toViewport(btn ? btn.x + btn.w / 2 : cx, btn ? btn.y + btn.h / 2 : cy);
        return { text: t.text.replace(/\s+/g, ' ').trim().slice(0, 120), x: p.x, y: p.y, button: !!btn };
      });
  }

  /** Viewport CSS pixel at the centre of a map tile, and whether a click there would reach the map. */
  tileToScreen(row: number, col: number) {
    const h = this.need();
    const cam = h.scene.cameras.main;
    const wx = col * TILE_SIZE + TILE_SIZE / 2;
    const wy = row * TILE_SIZE + TILE_SIZE / 2;
    const px = (wx - cam.worldView.x) * cam.zoom + cam.x;
    const py = (wy - cam.worldView.y) * cam.zoom + cam.y;
    const p = this.toViewport(px, py);
    const rect = this.canvasRect();
    const onCanvas = p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
    const topEl = onCanvas ? document.elementFromPoint(p.x, p.y) : null;
    return {
      x: p.x, y: p.y, onCanvas,
      coveredByDom: onCanvas && topEl !== this.game.canvas,
      coveredByHud: onCanvas && this.hudBlocks(px, py),
      tilePixels:   Math.round(TILE_SIZE * cam.zoom * (rect.width / this.game.canvas.width)),
    };
  }

  private hudBlocks(px: number, py: number): boolean {
    const ui = this.game.scene.getScene('UIScene');
    if (!ui) return false;
    return ui.children.list.some(o => {
      const vis = o as unknown as { visible?: boolean; getBounds?: () => Phaser.Geom.Rectangle };
      if (!o.input?.enabled || vis.visible === false || !vis.getBounds) return false;
      return vis.getBounds().contains(px, py);
    });
  }

  /** Centre the camera on a tile (optionally setting zoom), then report where it is on screen. */
  async focus(row: number, col: number, zoom?: number) {
    const h = this.need();
    const cam = h.scene.cameras.main;
    if (zoom !== undefined) cam.setZoom(zoom);
    cam.centerOn(col * TILE_SIZE + TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2);
    await this.nextFrames(2);
    return this.tileToScreen(row, col);
  }

  /** Run the invariant checks now. Returns every violation seen this session. */
  invariants() {
    this.runInvariants();
    return [...this.violations.values()];
  }

  errorLog(sinceIndex = 0) { return this.errors.slice(sinceIndex); }

  metrics() {
    const failures: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const c of this.commands) {
      byType[c.command.type] = (byType[c.command.type] ?? 0) + 1;
      if (!c.result.success) {
        const k = `${c.command.type}: ${c.result.reason ?? '(no reason given)'}`;
        failures[k] = (failures[k] ?? 0) + 1;
      }
    }
    const tick = this.tick();
    return {
      tick,
      ticksAdvanced:   this.ticksAdvanced,
      commands:        { total: this.commands.length, failed: this.commands.filter(c => !c.result.success).length, byType, failures },
      clicks:          { ...this.clicks },
      deadTime:        [...this.deadTime, ...(tick - this.lastMineEventTick >= DEAD_TIME_TICKS ? [{ from: this.lastMineEventTick, to: tick, ongoing: true }] : [])],
      firsts:          { ...this.firsts },
      eventCounts:     Object.fromEntries(this.eventCounts),
      violations:      this.violations.size,
      errors:          this.errors.filter(e => e.kind !== 'console.warn').length,
      warnings:        this.errors.filter(e => e.kind === 'console.warn').length,
      tasks:           [...this.tasks],
    };
  }

  /** Start timing a player task (clicks, commands, failures, ticks) — e.g. "build a barracks". */
  startTask(name: string): void {
    this.task = {
      name, startClicks: this.clicks.total, startTick: this.tick(),
      startCommands: this.commands.length, startFailures: this.commands.filter(c => !c.result.success).length,
    };
  }

  endTask(outcome: 'done' | 'gave-up' = 'done') {
    const t = this.task;
    if (!t) return null;
    this.task = null;
    const failures = this.commands.filter(c => !c.result.success).length - t.startFailures;
    const record = {
      name: t.name, outcome,
      clicks: this.clicks.total - t.startClicks,
      commands: this.commands.length - t.startCommands,
      failedCommands: failures,
      ticks: this.tick() - t.startTick,
    };
    this.tasks.push(record);
    return record;
  }

  /**
   * Save through the real save path, reload through the real load path, and
   * report any difference between the state before and after.
   */
  async saveAndReload() {
    const h = this.need();
    const snapshot = (hh: GameSceneHandles) => ({
      tick:             hh.tickEngine.getCurrentTick(),
      state:            JSON.parse(JSON.stringify(hh.gameState.toJSON())) as unknown,
      battles:          hh.tickEngine.getBattleStates(),
      sieges:           hh.tickEngine.getSiegeStates(),
      territoryBattles: hh.tickEngine.getTerritoryBattleStates(),
      movement:         Array.from(hh.movementSystem.getAllStates().values()).map(s => ({ ...s })),
      peaceCooldowns:   hh.diplomacySystem.toSavedState(),
    });
    const before = snapshot(h);
    if (!h.bridge.saveToSlot(SCRATCH_SAVE_SLOT)) return { ok: false, error: 'saveToSlot returned false' };

    const attached = new Promise<GameSceneHandles>(resolve => this.attachWaiters.push(resolve));
    h.bridge.loadGame(SCRATCH_SAVE_SLOT);
    const after = snapshot(await attached);
    await this.nextFrames(3);

    const diffs: string[] = [];
    diffValues(before, after, '', diffs, 40);
    return { ok: diffs.length === 0, differences: diffs };
  }

  /** Save a PNG of the game canvas (map + HUD; DOM modals are not included) into the session folder. */
  async screenshot(name: string): Promise<string> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      this.game.renderer.snapshot((img) => {
        if (img instanceof HTMLImageElement) resolve(img.src);
        else reject(new Error('snapshot did not return an image'));
      });
    });
    return this.post(`shots/${sanitizeSegment(name)}.png`, dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
  }

  /** Write the current game as a save file into the session folder (loadable via the pause menu's Import button). */
  async dumpSave(name: string): Promise<string> {
    return this.post(`saves/${sanitizeSegment(name)}.json`, JSON.stringify(this.need().bridge.buildSaveData()));
  }

  /** Write an arbitrary text file into the session folder (e.g. notes). */
  async writeFile(relPath: string, content: string): Promise<string> {
    return this.post(relPath.split('/').map(sanitizeSegment).join('/'), content);
  }

  /** Persist logs: events, commands (replay), metrics, violations, errors. */
  async flush(): Promise<string[]> {
    const replay = { setup: this.setup, commands: this.commands.map(c => ({ tick: c.tick, command: c.command, result: c.result })) };
    return Promise.all([
      this.post('events.jsonl', this.events.map(e => JSON.stringify(e)).join('\n')),
      this.post('replay.json', JSON.stringify(replay, null, 2)),
      this.post('metrics.json', JSON.stringify(this.metrics(), null, 2)),
      this.post('violations.json', JSON.stringify([...this.violations.values()], null, 2)),
      this.post('errors.json', JSON.stringify(this.errors, null, 2)),
    ]);
  }
}

// ── Utilities ───────────────────────────────────────────────────────────────

function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^\.+/, '').slice(0, 100) || 'unnamed';
}

function describe(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? `\n${v.stack.split('\n').slice(1, 4).join('\n')}` : ''}`;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

/** JSON-safe shallow copy of an event payload (entity objects become their ids). */
function plain(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (v && typeof v === 'object' && 'id' in v && typeof (v as { id: unknown }).id === 'string' && !Array.isArray(v)) {
      out[k] = (v as { id: string }).id;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function diffValues(a: unknown, b: unknown, path: string, out: string[], max: number): void {
  if (out.length >= max) return;
  if (a === b) return;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    out.push(`${path || '(root)'}: ${short(a)} → ${short(b)}`);
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b)) { out.push(`${path}: array/object mismatch`); return; }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const k of keys) {
    diffValues((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k, out, max);
  }
}

function short(v: unknown): string {
  const s = JSON.stringify(v);
  return s === undefined ? 'undefined' : s.length > 120 ? `${s.slice(0, 117)}...` : s;
}

// ── Entry point (called from main.ts) ───────────────────────────────────────

/**
 * Install `window.__TEST__`. Error capture starts before `createGame` runs so
 * errors thrown while the game boots are recorded too.
 */
export function beginTestSession(createGame: () => Phaser.Game): void {
  const harness = new TestHarness(new URLSearchParams(window.location.search));
  harness.captureErrors();
  harness.install(createGame());
  (window as unknown as { __TEST__: TestHarness }).__TEST__ = harness;
}
