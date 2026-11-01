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
  /**
   * Event names that stop the advance early, or a preset: 'notable' (default),
   * 'major' (losses, sieges, captures, war/peace, defeat only), 'none'.
   */
  stopOn?:     string[] | 'notable' | 'major' | 'none';
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

// Morale band changes are recorded but deliberately not here: in any real fight they fire every few ticks.
const NOTABLE_EVENTS = [
  'battle:started', 'battle:ended', 'city:siege-started', 'city:conquered', 'unit:destroyed',
  'diplomacy:war-declared', 'diplomacy:peace-signed', 'nation:defeated', 'spy:detected',
  'nation:research-complete', 'city:unit-spawned', 'city:production-complete', 'city:building-built',
  'territory:building-built', 'territory:conquest-started', 'unit:withdrew', 'unit:move-blocked',
];

const MAJOR_EVENTS = [
  'unit:destroyed', 'city:siege-started', 'city:conquered', 'diplomacy:war-declared',
  'diplomacy:peace-signed', 'nation:defeated',
];

type Tile = [number, number];

const MAX_EVENTS = 5000;
const INVARIANT_CHECK_EVERY = 10;
/** A stretch this long with no event touching the player is logged as dead time. */
const DEAD_TIME_TICKS = 300;
const SCRATCH_SAVE_SLOT = SaveSystem.SLOT_COUNT - 1;
const LOAD_SAVE_SLOT = SaveSystem.SLOT_COUNT - 2;
/** How far (Manhattan) a group order looks for a free tile when its target is taken. */
const GROUP_REDIRECT_RADIUS = 3;

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
  /** Standing group orders (unit id → target tile), re-issued after every advance until they arrive. */
  private groupOrders = new Map<string, Tile>();
  /** Standing production plan: city id → unit types to train in rotation. */
  private productionPlan = new Map<string, { types: string[]; next: number }>();

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

    const load = this.params.get('load');
    if (load) void this.loadSave(load).catch(err => console.error('[TestHarness] load= failed:', err));
    else if (this.params.get('autostart') === '1') this.autostart();
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
    const names = opts.stopOn === 'none' ? []
      : opts.stopOn === 'major' ? MAJOR_EVENTS
      : opts.stopOn === undefined || opts.stopOn === 'notable' ? NOTABLE_EVENTS
      : opts.stopOn;
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
    const auto = UIManager.isOpen('gameOver') ? null : {
      reissued: await this.reissueGroupOrders(),
      produced: await this.runProductionPlan(),
    };

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
      ...(auto && (auto.reissued.length || auto.produced.length) ? { auto } : {}),
      ...(this.groupOrders.size ? { groupOrdersPending: this.groupOrders.size } : {}),
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

  /**
   * One-call status for an automated player: economy, cities, army by type,
   * every unit in short form, visible enemies, known cities, standing orders.
   * Fog applies (built from state()).
   */
  summary() {
    const s = this.state();
    const pct = (hp: string): number => {
      const [cur, max] = hp.split('/').map(Number);
      return max ? Math.round(((cur ?? 0) / max) * 100) : 0;
    };
    const army: Record<string, { count: number; avgHpPct: number }> = {};
    for (const u of s.units) {
      const a = army[u.type] ??= { count: 0, avgHpPct: 0 };
      a.avgHpPct = Math.round((a.avgHpPct * a.count + pct(u.hp)) / (a.count + 1));
      a.count++;
    }
    return {
      tick:      s.tick,
      resources: s.me.resources,
      research:  { current: s.me.research.current, queued: s.me.research.queue.length, done: s.me.research.researched.length },
      tiles:     s.me.territoryTiles,
      cities:    s.cities.map(c => `${c.id} ${c.name} @${c.at.join(',')} ${c.hp} ${c.producing ?? 'idle'}${c.queue.length ? ` +${c.queue.length}` : ''}`),
      army,
      units:     s.units.map(u =>
        `${u.id} ${u.type} @${u.at.join(',')} ${pct(u.hp)}%${u.movingTo ? ` >${u.movingTo.join(',')}` : ''}${u.inCombat ? ' C' : ''}${u.stance !== 'HOLD' ? ` ${u.stance}` : ''}`),
      enemies:   s.visibleEnemies.map(e => `${String(e['id'])} ${String(e['type'])} @${(e['at'] as number[]).join(',')} ${String(e['hp'])}`),
      contacts:  s.contacts.length,
      foreignCities: s.foreignCities.map(c => `${c.id} ${c.name} @${c.at.join(',')} ${c.visible ? c.hp : '(not in sight)'}`),
      wars:      s.nations.filter(n => n.relation === 'WAR').map(n => n.name),
      groupOrders: this.groupOrders.size,
      productionPlan: Object.fromEntries([...this.productionPlan].map(([id, p]) => [id, p.types])),
    };
  }

  /**
   * Standing move orders: each unit to its own tile. Issued now and re-issued
   * after every advance() until the unit arrives or dies. A unit whose target
   * is held by another of our units is redirected to the nearest free tile
   * (within GROUP_REDIRECT_RADIUS). `replace` drops all previous group orders.
   */
  async orderGroup(assignments: Record<string, Tile> | Array<[string, number, number]>, opts: { replace?: boolean } = {}) {
    if (opts.replace) this.groupOrders.clear();
    const entries: Array<[string, Tile]> = Array.isArray(assignments)
      ? assignments.map(([id, r, c]) => [id, [r, c]])
      : Object.entries(assignments);
    for (const [id, tile] of entries) this.groupOrders.set(id, tile);
    return { issued: await this.reissueGroupOrders(true), pending: this.groupOrders.size };
  }

  /**
   * Pair units with targets for a coordinated move: picks our units of `type`
   * (at ≥ minHpFrac health, not already under a group order, not garrisoning
   * a city unless includeGarrisons) and gives the one nearest `focus` the
   * target nearest `focus`, and so on — so a column's front unit takes the
   * deepest tile and nobody walks backwards through the column.
   */
  async orderWave(
    targets: Tile[],
    opts: { type?: string; minHpFrac?: number; focus?: Tile; includeGarrisons?: boolean } = {},
  ) {
    const h = this.need();
    const me = this.myNationId();
    if (!me || targets.length === 0) return { assigned: [] as string[] };
    const focus = opts.focus ?? targets[0]!;
    const d = (r: number, c: number): number => Math.abs(r - focus[0]) + Math.abs(c - focus[1]);
    const cityTiles = new Set(h.gameState.getCitiesByNation(me).map(c => `${c.position.row},${c.position.col}`));
    const units = h.gameState.getUnitsByNation(me)
      .filter(u => u.isAlive() && !this.groupOrders.has(u.id))
      .filter(u => !opts.type || u.getUnitType() === opts.type)
      .filter(u => u.getHealth() >= u.getMaxHealth() * (opts.minHpFrac ?? 0.8))
      .filter(u => opts.includeGarrisons || !cityTiles.has(`${u.position.row},${u.position.col}`))
      .sort((a, b) => d(a.position.row, a.position.col) - d(b.position.row, b.position.col));
    const sorted = [...targets].sort((a, b) => d(a[0], a[1]) - d(b[0], b[1]));
    const pairs: Array<[string, number, number]> = [];
    units.slice(0, sorted.length).forEach((u, i) => pairs.push([u.id, sorted[i]![0], sorted[i]![1]]));
    const result = await this.orderGroup(pairs);
    return { assigned: pairs.map(([id, r, c]) => `${id}>${r},${c}`), ...result };
  }

  /** Drop standing group orders (all, or just these units). Units keep whatever order they're on. */
  cancelGroupOrders(unitIds?: string[]): number {
    if (!unitIds) { const n = this.groupOrders.size; this.groupOrders.clear(); return n; }
    let n = 0;
    for (const id of unitIds) if (this.groupOrders.delete(id)) n++;
    return n;
  }

  groupStatus() {
    return [...this.groupOrders].map(([id, [r, c]]) => {
      const u = this.h?.gameState.getUnit(id);
      return `${id} @${u ? `${u.position.row},${u.position.col}` : 'gone'} >${r},${c}${u && this.h?.movementSystem.isMoving(id) ? ' moving' : ''}`;
    });
  }

  private async reissueGroupOrders(force = false): Promise<string[]> {
    const h = this.h;
    if (!h || this.groupOrders.size === 0) return [];
    const me = this.myNationId();
    const out: string[] = [];
    const occupied = new Map(h.gameState.getUnitsByNation(me ?? '').map(u => [`${u.position.row},${u.position.col}`, u.id]));
    for (const [id, tile] of [...this.groupOrders]) {
      const unit = h.gameState.getUnit(id);
      if (!unit || !unit.isAlive()) { this.groupOrders.delete(id); continue; }
      if (unit.position.row === tile[0] && unit.position.col === tile[1]) { this.groupOrders.delete(id); continue; }
      if (!force && (h.movementSystem.isMoving(id) || unit.isEngagedInBattle())) continue;
      let target = tile;
      const holder = occupied.get(`${tile[0]},${tile[1]}`);
      if (holder && holder !== id) {
        const free = this.nearestFreeTile(tile, occupied, id);
        if (!free) { out.push(`${id}: target held, no free tile nearby`); continue; }
        target = free;
        this.groupOrders.set(id, free);
      }
      const res = await this.moveTo(id, target[0], target[1]);
      out.push(`${id}>${target.join(',')}${res.success ? '' : `: ${res.reason ?? 'failed'}`}`);
      if (!res.success && res.reason === 'no path to that tile') this.groupOrders.delete(id);
    }
    return out;
  }

  private nearestFreeTile(around: Tile, occupied: Map<string, string>, forUnit: string): Tile | null {
    const grid = this.need().gameState.getGrid();
    const taken = new Set([...this.groupOrders].filter(([id]) => id !== forUnit).map(([, t]) => `${t[0]},${t[1]}`));
    for (let dist = 1; dist <= GROUP_REDIRECT_RADIUS; dist++) {
      for (let dr = -dist; dr <= dist; dr++) {
        const dc = dist - Math.abs(dr);
        for (const c of dc === 0 ? [around[1]] : [around[1] - dc, around[1] + dc]) {
          const r = around[0] + dr;
          const key = `${r},${c}`;
          const terrain = grid.getTerritory({ row: r, col: c })?.getTerrainType();
          if (!terrain || terrain === 'WATER' || terrain === 'MOUNTAIN') continue;
          if (occupied.has(key) || taken.has(key)) continue;
          return [r, c];
        }
      }
    }
    return null;
  }

  /**
   * Standing production: after every advance(), each listed city that has no
   * queued order and isn't building something trains the next unit type in its
   * rotation (types it can't train yet are skipped). Pass null to clear.
   */
  setProduction(plan: Record<string, string[]> | null) {
    this.productionPlan.clear();
    for (const [cityId, types] of Object.entries(plan ?? {})) {
      if (types.length) this.productionPlan.set(cityId, { types: [...types], next: 0 });
    }
    return Object.fromEntries([...this.productionPlan].map(([id, p]) => [id, p.types]));
  }

  private async runProductionPlan(): Promise<string[]> {
    const h = this.h;
    if (!h || this.productionPlan.size === 0) return [];
    const out: string[] = [];
    for (const [cityId, plan] of this.productionPlan) {
      const city = h.gameState.getCity(cityId);
      if (!city || city.getOwnerId() !== this.myNationId()) { this.productionPlan.delete(cityId); continue; }
      const current = city.getCurrentOrder();
      if (city.getQueue().length > 0 || (current && current.kind !== 'unit')) continue;
      // Try each type once, starting at the rotation point; skip ones the city can't train yet.
      for (let i = 0; i < plan.types.length; i++) {
        const type = plan.types[(plan.next + i) % plan.types.length]!;
        const res = await this.issue({ type: 'START_CITY_PRODUCTION', cityId, unitType: type });
        if (res.success) { plan.next = (plan.next + i + 1) % plan.types.length; out.push(`${cityId}: ${type}`); break; }
        if (res.reason === 'Insufficient resources') break; // wait for resources rather than switching type
      }
    }
    return out;
  }

  /**
   * Resume from a save: a path served by the dev server (e.g. a file written
   * by dumpSave(): 'qa-reports/<session>/saves/<name>.json') or save data.
   * Works from the menu or mid-game. Resolves once the game is running.
   */
  async loadSave(source: string | Record<string, unknown>) {
    const raw = typeof source === 'string'
      ? await (await fetch(source.startsWith('/') ? source : `/${source}`)).text()
      : JSON.stringify(source);
    const saveData = SaveSystem.parse(raw);
    if (!saveData) throw new Error('not a valid save file');
    const attached = new Promise<GameSceneHandles>(resolve => this.attachWaiters.push(resolve));
    if (this.h) {
      if (!SaveSystem.save(LOAD_SAVE_SLOT, saveData)) throw new Error('could not write the save slot');
      this.h.bridge.loadGame(LOAD_SAVE_SLOT);
    } else {
      const tryStart = (): void => {
        if (!UIManager.startGameFromMenu({ setup: saveData.setup, saveData })) window.setTimeout(tryStart, 100);
      };
      tryStart();
    }
    await attached;
    await this.nextFrames(3);
    return this.info();
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
