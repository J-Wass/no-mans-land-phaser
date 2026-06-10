/**
 * GameScene - main game loop scene.
 * Renders the grid and units; drives the tick engine; handles mouse controls.
 */

import Phaser from 'phaser';
import { GameState } from '@/managers/GameState';
import { MovementSystem } from '@/systems/movement/MovementSystem';
import { Pathfinder } from '@/systems/pathfinding/Pathfinder';
import { TickEngine } from '@/systems/tick/TickEngine';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { EventSubscriptions } from '@/systems/events/EventSubscriptions';
import { CommandProcessor } from '@/commands/CommandProcessor';
import { LocalServerAdapter } from '@/network/LocalServerAdapter';
import type { NetworkAdapter } from '@/network/NetworkAdapter';
import { AISystem } from '@/systems/ai/AISystem';
import { DiplomacySystem } from '@/systems/diplomacy/DiplomacySystem';
import { DiplomaticStatus } from '@/types/diplomacy';
import { TILE_SIZE, TICK_INTERVAL_MS } from '@/config/constants';
import { normalizeGameSetup } from '@/types/gameSetup';
import { getScenarioById } from '@/config/scenarios';
import { VisionSystem } from '@/systems/vision/VisionSystem';
import { RegionSystem } from '@/systems/regions/RegionSystem';
import { PhaserUIBridge } from '@/ui/PhaserUIBridge';
import { MusicManager } from '@/managers/MusicManager';
import { TutorialManager } from '@/systems/tutorial/TutorialManager';
import { TutorialOverlay } from '@/ui/TutorialOverlay';

const WATER_BORDER = 0;
import type { GameSetup, GameSaveData } from '@/types/gameSetup';
import type { GridCoordinates } from '@/types/common';
import type { Unit } from '@/entities/units/Unit';
import type { City } from '@/entities/cities/City';
import {
  TERRAIN_TEXTURE, TERRAIN_CYCLE, DEPOSIT_ICON, DEPOSIT_INFO,
  unitInitial, stanceShortLabel, stanceBadgeColor, moraleBandFill,
} from './gameSceneHelpers';
import { effectiveBattleOrder, getMoraleBand } from '@/systems/morale/moraleRules';

interface GameSceneData {
  gameState?: GameState;
  setup?: GameSetup;
  saveData?: GameSaveData;
}

export class GameScene extends Phaser.Scene {
  private gameState!: GameState;
  private setup!: GameSetup;
  private movementSystem!: MovementSystem;
  private pathfinder!: Pathfinder;
  private tickEngine!: TickEngine;
  private eventBus!: GameEventBus;
  private subs!: EventSubscriptions;
  private commandProcessor!: CommandProcessor;  // server-side: used by AI + TickEngine
  private networkAdapter!: NetworkAdapter;       // client-side: used by all player input

  private unitSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private unitLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private unitRings: Map<string, Phaser.GameObjects.Arc> = new Map();
  private unitColors: Map<string, number> = new Map();   // nation color per unit (ring stroke)
  private citySprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private cityLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private selectionGraphic!: Phaser.GameObjects.Graphics;
  private pathGraphic!: Phaser.GameObjects.Graphics;
  private territoryGraphic!: Phaser.GameObjects.Graphics;
  private rangeGraphic!: Phaser.GameObjects.Graphics;
  private healthBarGraphic!: Phaser.GameObjects.Graphics;
  private conquestGraphic!: Phaser.GameObjects.Graphics;
  private constructionGraphic!: Phaser.GameObjects.Graphics;

  // posKey → { progress, needed, nationId } for active territory conquests
  private activeConquests = new Map<string, { progress: number; needed: number; nationId: string }>();

  private selectedUnitId: string | null = null;
  private selectedCityId: string | null = null;
  private selectedTerritory: GridCoordinates | null = null;
  private tickAccumulator = 0;
  private aiSystem!: AISystem;
  private diplomacySystem!: DiplomacySystem;

  private fogGraphic!: Phaser.GameObjects.Graphics;
  /** Unidentified-contact markers: tile key → text object */
  private contactMarkers: Map<string, Phaser.GameObjects.Text> = new Map();
  /** Tiles visible this frame — used to cull borders/conquest overlays */
  private currentVisible: Set<string> = new Set();
  private currentDiscovered: Set<string> = new Set();
  private visionSystem!: VisionSystem;
  /** Terrain tile images tracked for sandbox tile editing */
  private terrainImages: Map<string, Phaser.GameObjects.Image> = new Map();
  private tileEditActive = false;

  private uiClickConsumed = false;
  private depositTooltip: Phaser.GameObjects.Container | null = null;
  private stanceBadges: Map<string, Phaser.GameObjects.Container> = new Map();
  private minZoom = 0.25;
  private gameSpeed = 1;
  private bridge!: PhaserUIBridge;
  private musicManager!: MusicManager;

  // Tutorial (active only on the tutorial scenario)
  private tutorialManager: TutorialManager | null = null;
  private tutorialGraphic!: Phaser.GameObjects.Graphics;
  private tutorialHighlightTile: GridCoordinates | null = null;
  private isTutorialMode = false;

  // Double-click detection for city/territory menus
  private lastClickMs     = 0;
  private lastClickTarget = '';
  private readonly DOUBLE_CLICK_MS = 350;

  constructor() {
    super({ key: 'GameScene' });
  }

  preload(): void {
    this.load.image('terrain_plains', 'terrain_squares/plains.png');
    this.load.image('terrain_snow_forest', 'terrain_squares/snowforest.png');
    this.load.image('terrain_forest', 'terrain_squares/forest.png');
    this.load.image('terrain_mountain', 'terrain_squares/mountains.png');
    this.load.image('terrain_water', 'terrain_squares/ocean.png');
    this.load.image('terrain_desert', 'terrain_squares/desert.png');
    this.load.image('city_town', 'terrain_squares/town.png');
    this.load.spritesheet('infantry_neutral', 'sprites/infantry_neutral_4x.png', { frameWidth: 128, frameHeight: 128 });

    this.load.audio('music_melancholy1', 'audio/music/melancholy1.mp3');
    this.load.audio('music_melancholy2', 'audio/music/melancholy2.mp3');
    this.load.audio('music_melancholy3', 'audio/music/melancholy3.mp3');
    this.load.audio('music_hope1',       'audio/music/hope1.mp3');
    this.load.audio('music_focus1',      'audio/music/focus1.mp3');
    this.load.audio('music_focus2',      'audio/music/focus2.mp3');
    this.load.audio('music_glory1',      'audio/music/glory1.mp3');
    this.load.audio('music_glory2',      'audio/music/glory2.mp3');
  }

  init(data: GameSceneData): void {
    if (data.saveData) {
      const sd = data.saveData;
      this.gameState = GameState.fromJSON(sd.state as ReturnType<GameState['toJSON']>);
      this.setup = normalizeGameSetup(sd.setup);
    } else {
      this.gameState = data.gameState!;
      this.setup = normalizeGameSetup(data.setup);
    }
  }

  create(): void {
    this.unitSprites.clear();
    this.unitLabels.clear();
    this.unitRings.clear();
    this.unitColors.clear();
    this.citySprites.clear();
    this.cityLabels.clear();
    this.contactMarkers.clear();
    this.terrainImages.clear();
    this.depositTooltip = null;
    this.tileEditActive = false;
    this.selectedUnitId = null;
    this.selectedCityId = null;
    this.selectedTerritory = null;
    this.tickAccumulator = 0;
    this.activeConquests.clear();

    this.movementSystem = new MovementSystem();
    this.pathfinder     = new Pathfinder(this.gameState.getGrid());
    this.eventBus = new GameEventBus();
    this.subs = new EventSubscriptions(this.eventBus);
    this.tickEngine = new TickEngine(this.gameState, this.movementSystem, this.eventBus);
    this.diplomacySystem  = new DiplomacySystem(this.gameState, this.eventBus);
    this.visionSystem     = new VisionSystem();
    const isSandbox = this.setup.gameMode === 'sandbox';
    this.isTutorialMode =
      this.setup.gameMode === 'scenario' && !!getScenarioById(this.setup.scenarioId)?.isTutorial;
    this.commandProcessor = new CommandProcessor(
      this.gameState, this.movementSystem, this.eventBus, this.diplomacySystem, isSandbox,
    );
    // Wrap the processor in the local adapter — all player commands go through here.
    // Swap LocalServerAdapter for a real transport adapter to enable multiplayer.
    this.networkAdapter = new LocalServerAdapter(this.commandProcessor);
    this.aiSystem = new AISystem(
      this.gameState,
      this.commandProcessor,
      this.movementSystem,
      this.pathfinder,
      this.setup.difficulty,
    );

    this.bridge = new PhaserUIBridge({
      phaserScene:     this,
      gameState:       this.gameState,
      networkAdapter:  this.networkAdapter,
      eventBus:        this.eventBus,
      diplomacySystem: this.diplomacySystem,
      tickEngine:      this.tickEngine,
      movementSystem:  this.movementSystem,
      setup:           this.setup,
    });

    this.musicManager = new MusicManager(this, this.gameState, this.eventBus);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.musicManager.destroy();
      this.subs.disposeAll();
      this.tutorialManager?.dispose();
    });

    const sceneData = this.scene.settings.data as GameSceneData;
    if (sceneData.saveData) {
      this.tickEngine.setTick(sceneData.saveData.currentTick);
      this.movementSystem.restoreStates(sceneData.saveData.movementStates);
      this.tickEngine.restoreBattleStates(sceneData.saveData.battleStates ?? []);
      this.tickEngine.restoreSiegeStates(sceneData.saveData.siegeStates ?? []);
      this.diplomacySystem.restoreState(sceneData.saveData.peaceCooldowns ?? []);
    }

    this.drawWaterBorder();
    this.drawGrid();
    this.drawResourceDeposits();

    // Build named geographic regions from the grid
    const regionSystem = new RegionSystem();
    regionSystem.generateFromGrid(this.gameState.getGrid());
    this.gameState.setRegionSystem(regionSystem);

    this.territoryGraphic = this.add.graphics().setDepth(80);
    this.conquestGraphic  = this.add.graphics().setDepth(81);
    this.constructionGraphic = this.add.graphics().setDepth(82);
    this.rangeGraphic     = this.add.graphics().setDepth(83);
    this.fogGraphic       = this.add.graphics().setDepth(95); // above cities (50-74), below units (300+)
    this.healthBarGraphic = this.add.graphics().setDepth(90); // below fog
    this.pathGraphic      = this.add.graphics().setDepth(92); // below fog
    this.selectionGraphic = this.add.graphics().setDepth(200);
    this.tutorialGraphic  = this.add.graphics().setDepth(210); // above selection ring

    if (this.isTutorialMode && !sceneData.saveData) {
      const overlay = new TutorialOverlay();
      this.tutorialManager = new TutorialManager({
        eventBus:      this.eventBus,
        gameState:     this.gameState,
        ui:            overlay,
        highlightTile: (coords) => { this.tutorialHighlightTile = coords; },
        onBackToMenu:  () => this.bridge.goToMenu(),
      });
    }

    this.createUnitAnimations();
    this.createCitySprites();
    this.createUnitSprites();

    this.subs.on('unit:step-complete', ({ unitId, to }) => {
      this.playWalkAnim(unitId, to);
      this.moveSpriteTo(unitId, to);
    });

    this.subs.on('city:unit-spawned', ({ unitId }) => {
      const unit = this.gameState.getUnit(unitId);
      if (unit) this.createSpriteForUnit(unit);
    });
    this.subs.on('unit:destroyed', ({ unitId }) => {
      this.removeUnitSprite(unitId);
      if (this.selectedUnitId === unitId) this.clearSelection();
    });

    this.subs.on('unit:battle-order-changed', () => { /* UIScene handles this */ });

    // Flash the firing unit briefly white on each ranged shot
    this.subs.on('ranged:fired', ({ unitId }) => {
      const sprite = this.unitSprites.get(unitId);
      if (!sprite) return;
      sprite.setTintFill(0xffffff);
      this.time.delayedCall(130, () => {
        if (sprite.active) sprite.clearTint();
      });
    });

    // Auto-show order popup when a local-player unit enters any battle
    this.subs.on('battle:started', ({ unitAId, unitBId }) => {
      const lp = this.gameState.getLocalPlayer();
      const ln = lp ? this.gameState.getNation(lp.getControlledNationId()) : null;
      if (!ln) return;
      for (const uid of [unitAId, unitBId]) {
        const u = this.gameState.getUnit(uid);
        if (u && u.getOwnerId() === ln.getId()) {
          if (this.selectedUnitId !== uid) {
            this.selectedUnitId = uid;
            this.selectedCityId = null;
            this.selectedTerritory = null;
            this.updateUISelection(u);
          }
          this.rangeGraphic.clear();
          return;
        }
      }
    });

    this.subs.on('city:siege-started', ({ unitId }) => {
      const lp = this.gameState.getLocalPlayer();
      const ln = lp ? this.gameState.getNation(lp.getControlledNationId()) : null;
      if (!ln) return;
      const u = this.gameState.getUnit(unitId);
      if (u && u.getOwnerId() === ln.getId()) {
        if (this.selectedUnitId !== unitId) {
          this.selectedUnitId = unitId;
          this.selectedCityId = null;
          this.selectedTerritory = null;
          this.updateUISelection(u);
        }
        this.rangeGraphic.clear();
      }
    });

    this.subs.on('city:conquered', ({ position }) => {
      // Flash "CAPTURED!" text above the city
      const flashX = position.col * TILE_SIZE + TILE_SIZE / 2;
      const flashY = position.row * TILE_SIZE - 14;
      const flash = this.add.text(flashX, flashY, 'CAPTURED!', {
        fontSize: '11px', color: '#ffdd44', fontFamily: 'monospace', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(900);
      this.tweens.add({
        targets: flash,
        y: flashY - 24,
        alpha: 0,
        duration: 2200,
        ease: 'Cubic.Out',
        onComplete: () => flash.destroy(),
      });
    });


    this.subs.on('territory:conquest-started', ({ position, nationId, needed }) => {
      const posKey = `${position.row},${position.col}`;
      this.activeConquests.set(posKey, { progress: 0, needed, nationId });
    });
    this.subs.on('territory:conquest-progress', ({ position, progress }) => {
      const existing = this.activeConquests.get(`${position.row},${position.col}`);
      if (existing) existing.progress = progress;
    });
    this.subs.on('territory:conquest-cancelled', ({ position }) => {
      this.activeConquests.delete(`${position.row},${position.col}`);
    });
    this.subs.on('territory:claimed', ({ position }) => {
      this.activeConquests.delete(`${position.row},${position.col}`);
    });

    // Camera bounds extend a bit past the water border so scrolling feels free at the edges
    const { rows: mapRows, cols: mapCols } = this.gameState.getGrid().getSize();
    const SCROLL_PAD = 20 * TILE_SIZE;
    const totalWidth  = (mapCols + WATER_BORDER * 2) * TILE_SIZE;
    const totalHeight = (mapRows + WATER_BORDER * 2) * TILE_SIZE;
    this.cameras.main.setBounds(
      -WATER_BORDER * TILE_SIZE - SCROLL_PAD,
      -WATER_BORDER * TILE_SIZE - SCROLL_PAD,
      totalWidth + SCROLL_PAD * 2,
      totalHeight + SCROLL_PAD * 2,
    );
    // Set minimum zoom so user can't zoom out past the water ring
    this.minZoom = Math.max(0.15, Math.min(
      this.scale.width  / totalWidth,
      this.scale.height / totalHeight,
    ) * 0.85);
    // Default zoom: fit the playable grid comfortably
    const defaultZoom = Math.min(
      this.scale.width  / (mapCols * TILE_SIZE),
      this.scale.height / (mapRows * TILE_SIZE),
      1.5,
    );
    // Try to start zoomed in on the local player's starting city/unit
    const localPlayer  = this.gameState.getLocalPlayer();
    const startNation  = localPlayer?.getControlledNationId();
    const startCity    = startNation ? this.gameState.getCitiesByNation(startNation)[0] : null;
    const startUnit    = startNation ? this.gameState.getUnitsByNation(startNation)[0] : null;
    const startTile    = startCity?.position ?? startUnit?.position;

    if (startTile) {
      const startZoom = Math.min(2.0, Math.max(1.2, this.scale.height / (12 * TILE_SIZE)));
      this.cameras.main.setZoom(startZoom);
      this.cameras.main.centerOn(
        startTile.col * TILE_SIZE + TILE_SIZE / 2,
        startTile.row * TILE_SIZE + TILE_SIZE / 2,
      );
    } else {
      this.cameras.main.setZoom(defaultZoom);
      this.cameras.main.centerOn(
        (mapCols * TILE_SIZE) / 2,
        (mapRows * TILE_SIZE) / 2,
      );
    }
    this.scale.on('resize', this.onResize, this);

    this.setupMouseControls();

    this.input.keyboard!.on('keydown-ESC', () => {
      this.bridge.openPause();
    });

    this.subs.on('ui:click-consumed', () => { this.uiClickConsumed = true; });
    this.subs.on('game:speed-change', ({ speed }) => { this.gameSpeed = speed; });

    if (this.setup.gameMode !== 'sandbox') {
      this.subs.on('nation:defeated', ({ nationId, tick }) => {
        const localNationId = this.gameState.getLocalPlayer()?.getControlledNationId();
        if (!localNationId) return;

        if (nationId === localNationId) {
          this.bridge.openGameOver('defeat', tick);
          return;
        }

        // Evaluate scenario-specific victory condition (defaults to eliminate_all)
        const scenario = this.setup.scenarioId ? getScenarioById(this.setup.scenarioId) : null;
        const condition = scenario?.victoryCondition ?? { type: 'eliminate_all' as const };

        if (condition.type === 'eliminate_all') {
          const remaining = this.gameState.getAllNations();
          if (remaining.length === 1 && remaining[0]!.getId() === localNationId) {
            this.bridge.openGameOver('victory', tick);
            this.musicManager.notifyVictory();
          }
        }
      });

      // survive_ticks: victory when the player survives until the target tick
      const scenario = this.setup.scenarioId ? getScenarioById(this.setup.scenarioId) : null;
      const condition = scenario?.victoryCondition;
      if (condition?.type === 'survive_ticks') {
        const targetTick = condition.ticks;
        this.subs.on('game:tick', ({ tick }) => {
          const localNationId = this.gameState.getLocalPlayer()?.getControlledNationId();
          if (!localNationId) return;
          if (tick >= targetTick) {
            this.bridge.openGameOver('victory', tick);
            this.musicManager.notifyVictory();
          }
        });
      }
    }
    this.subs.on('sandbox:ai-difficulty-changed', ({ difficulty }) => {
      this.aiSystem.setDifficulty(difficulty);
    });
    this.subs.on('sandbox:tile-edit-mode', ({ active }) => {
      this.tileEditActive = active;
    });

    this.scene.launch('UIScene', {
      setup:           this.setup,
      gameState:       this.gameState,
      networkAdapter:  this.networkAdapter,
      eventBus:        this.eventBus,
      diplomacySystem: this.diplomacySystem,
      tickEngine:      this.tickEngine,
      bridge:          this.bridge,
    });
  }

  override update(_time: number, delta: number): void {
    this.tickAccumulator += delta;
    const effectiveInterval = TICK_INTERVAL_MS / this.gameSpeed;
    while (this.tickAccumulator >= effectiveInterval) {
      this.tickAccumulator -= effectiveInterval;
      this.tickEngine.advance();
      this.aiSystem.tick(this.tickEngine.getCurrentTick());
    }
    this.updateFog();
    this.updateUnitAnimations();
    this.drawPaths();
    this.drawSelection();
    this.drawTutorialHighlight();
    this.drawUnitHealthBars();
    this.drawCityHealthBars();
    this.drawConquestOverlay();
    this.drawConstructionOverlay();
    this.updateRangeOverlay();
    this.updateStanceBadges();
  }

  private setupMouseControls(): void {
    this.input.mouse?.disableContextMenu();

    const PAN_THRESHOLD = 6;
    let activePanPtr: Phaser.Input.Pointer | null = null;
    let panStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
    let hasPanned = false;

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (activePanPtr || ptr.button !== 2) return;
      const cam = this.cameras.main;
      activePanPtr = ptr;
      panStart = { x: ptr.x, y: ptr.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
      hasPanned = false;
    });

    this.input.on('pointermove', () => {
      if (!activePanPtr || !panStart || !activePanPtr.isDown) return;

      const dx = activePanPtr.x - panStart.x;
      const dy = activePanPtr.y - panStart.y;
      if (!hasPanned && Math.hypot(dx, dy) > PAN_THRESHOLD) hasPanned = true;

      if (!hasPanned) return;

      const cam = this.cameras.main;
      cam.setScroll(
        panStart.scrollX - dx / cam.zoom,
        panStart.scrollY - dy / cam.zoom,
      );
    });

    this.input.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      const wasPan = ptr === activePanPtr && hasPanned;

      if (ptr === activePanPtr) {
        activePanPtr = null;
        panStart = null;
        hasPanned = false;
      }

      if (wasPan) return;

      if (ptr.button === 0) {
        this.handleLeftClick(ptr.worldX, ptr.worldY);
      } else if (ptr.button === 2) {
        this.handleRightClick();
      }
    });

    this.input.on('wheel', (
      _ptr: Phaser.Input.Pointer,
      _gos: unknown,
      _dx: number,
      dy: number,
    ) => {
      const zoom = Phaser.Math.Clamp(
        this.cameras.main.zoom * (dy > 0 ? 0.9 : 1.1),
        this.minZoom,
        2.5,
      );
      this.cameras.main.setZoom(zoom);
    });
  }

  private drawGrid(): void {
    const grid = this.gameState.getGrid();
    const { rows, cols } = grid.getSize();
    const imgH = TILE_SIZE * (384 / 256);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const territory = grid.getTerritory({ row: r, col: c });
        if (!territory) continue;

        const cx = c * TILE_SIZE + TILE_SIZE / 2;
        const bottomY = (r + 1) * TILE_SIZE;

        const img = this.add.image(cx, bottomY, TERRAIN_TEXTURE[territory.getTerrainType()])
          .setDisplaySize(TILE_SIZE, imgH)
          .setOrigin(0.5, 1)
          .setDepth(r);
        this.terrainImages.set(`${r},${c}`, img);
      }
    }
  }

  /** Draw a small icon on each tile that has a resource deposit. Drawn once at scene start. */
  private drawResourceDeposits(): void {
    const grid = this.gameState.getGrid();
    const { rows, cols } = grid.getSize();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const territory = grid.getTerritory({ row: r, col: c });
        const deposit = territory?.getResourceDeposit();
        if (!deposit) continue;
        const icon = DEPOSIT_ICON[deposit] ?? '?';
        const cx = c * TILE_SIZE + TILE_SIZE / 2 + 11;
        const cy = r * TILE_SIZE + TILE_SIZE / 2 + 11;
        this.add.text(cx, cy, icon, {
          fontSize: '9px',
          color: '#ffe066',
          fontFamily: 'monospace',
          stroke: '#000000',
          strokeThickness: 2,
        }).setOrigin(0.5).setDepth(83);

        // Invisible hover zone over the whole tile so the player can hover the
        // deposit to learn what it does. Clicks still pass through to the map.
        const info = DEPOSIT_INFO[deposit] ?? deposit;
        const tileCx = c * TILE_SIZE + TILE_SIZE / 2;
        const tileCy = r * TILE_SIZE + TILE_SIZE / 2;
        const zone = this.add.rectangle(tileCx, tileCy, TILE_SIZE, TILE_SIZE, 0x000000, 0.001)
          .setDepth(84)
          .setInteractive({ useHandCursor: false });
        const tileKey = `${r},${c}`;
        zone.on('pointerover', () => {
          // Don't reveal deposits the player hasn't discovered yet.
          if (!this.currentDiscovered.has(tileKey)) return;
          this.showDepositTooltip(tileCx, r * TILE_SIZE, info);
        });
        zone.on('pointerout', () => this.hideDepositTooltip());
      }
    }
  }

  /** Show the deposit hover tooltip above the given tile (world coords). */
  private showDepositTooltip(worldX: number, tileTopY: number, text: string): void {
    if (!this.depositTooltip) {
      const bg = this.add.rectangle(0, 0, 10, 10, 0x0a0e1e, 0.95).setStrokeStyle(1, 0x5a6cc0).setOrigin(0.5, 1);
      const label = this.add.text(0, 0, '', {
        fontSize: '10px', color: '#e6ecff', fontFamily: 'monospace', align: 'center',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5, 1);
      this.depositTooltip = this.add.container(0, 0, [bg, label]).setDepth(950);
    }
    const bg = this.depositTooltip.getAt(0) as Phaser.GameObjects.Rectangle;
    const label = this.depositTooltip.getAt(1) as Phaser.GameObjects.Text;
    label.setText(text);
    const padX = 8;
    const padY = 6;
    bg.setSize(label.width + padX * 2, label.height + padY * 2);
    label.setPosition(0, -padY);
    bg.setPosition(0, 0);
    // Counter-scale so the tooltip stays a readable size at any zoom.
    this.depositTooltip.setScale(1 / this.cameras.main.zoom);
    this.depositTooltip.setPosition(worldX, tileTopY - 4);
    this.depositTooltip.setVisible(true);
  }

  private hideDepositTooltip(): void {
    this.depositTooltip?.setVisible(false);
  }

  private createCitySprites(): void {
    for (const city of this.gameState.getAllCities()) {
      this.createSpriteForCity(city);
    }
  }

  private createSpriteForCity(city: City): void {
    const pos = city.position;

    const imgH = TILE_SIZE * (384 / 256);
    const cx = pos.col * TILE_SIZE + TILE_SIZE / 2;
    const bottomY = (pos.row + 1) * TILE_SIZE;

    const img = this.add.image(cx, bottomY, 'city_town')
      .setDisplaySize(TILE_SIZE, imgH)
      .setOrigin(0.5, 1)
      .setDepth(50 + pos.row);

    const label = this.add.text(cx, pos.row * TILE_SIZE + 2, city.getName(), {
      fontSize: '8px',
      color: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0).setDepth(52 + pos.row);

    this.citySprites.set(city.id, img);
    this.cityLabels.set(city.id, label);
  }

  private createUnitAnimations(): void {
    const ANIMS: Record<string, { row: number; frames: number; fps: number; loop: boolean }> = {
      'walk-down':    { row: 0, frames: 4, fps: 7,  loop: true  },
      'walk-left':    { row: 1, frames: 4, fps: 7,  loop: true  },
      'walk-right':   { row: 2, frames: 4, fps: 7,  loop: true  },
      'walk-up':      { row: 3, frames: 4, fps: 7,  loop: true  },
      'idle':         { row: 4, frames: 4, fps: 3,  loop: true  },
      'attack-left':  { row: 5, frames: 4, fps: 10, loop: true  },
      'attack-right': { row: 6, frames: 4, fps: 10, loop: true  },
      'rest':         { row: 7, frames: 4, fps: 2,  loop: true  },
    };
    for (const [suffix, a] of Object.entries(ANIMS)) {
      const key = `infantry_neutral_${suffix}`;
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers('infantry_neutral', { start: a.row * 4, end: a.row * 4 + a.frames - 1 }),
        frameRate: a.fps,
        repeat: a.loop ? -1 : 0,
      });
    }
  }

  private createUnitSprites(): void {
    for (const unit of this.gameState.getAllUnits()) {
      this.createSpriteForUnit(unit);
    }
  }

  private createSpriteForUnit(unit: Unit): void {
    const nation = this.gameState.getNation(unit.getOwnerId());
    const colorHex = nation?.getColor() ?? '#ffffff';
    const color = parseInt(colorHex.replace('#', ''), 16);

    const pos = unit.position;
    const cx = pos.col * TILE_SIZE + TILE_SIZE / 2;
    const cy = pos.row * TILE_SIZE + TILE_SIZE / 2;

    const ring = this.add.arc(cx, cy, TILE_SIZE * 0.25 + 2, 0, 360, false, 0, 0)
      .setStrokeStyle(1, color, 1)
      .setDepth(299 + pos.row);

    const sprite = this.add.sprite(cx, cy, 'infantry_neutral')
      .setDisplaySize(TILE_SIZE, TILE_SIZE)
      .setDepth(300 + pos.row)
      .play('infantry_neutral_idle');

    const label = this.add.text(cx, cy - TILE_SIZE * 0.4, unitInitial(unit), {
      fontSize: '9px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setDepth(400 + pos.row);

    this.unitRings.set(unit.id, ring);
    this.unitSprites.set(unit.id, sprite);
    this.unitLabels.set(unit.id, label);
    this.unitColors.set(unit.id, color);
  }

  private moveSpriteTo(unitId: string, coords: GridCoordinates): void {
    const sprite = this.unitSprites.get(unitId);
    const label = this.unitLabels.get(unitId);
    const ring = this.unitRings.get(unitId);
    if (!sprite || !label) return;

    const cx = coords.col * TILE_SIZE + TILE_SIZE / 2;
    const cy = coords.row * TILE_SIZE + TILE_SIZE / 2;
    sprite.setPosition(cx, cy).setDepth(300 + coords.row);
    label.setPosition(cx, cy - TILE_SIZE * 0.4).setDepth(400 + coords.row);
    ring?.setPosition(cx, cy).setDepth(299 + coords.row);
  }

  private playWalkAnim(unitId: string, to: GridCoordinates): void {
    const sprite = this.unitSprites.get(unitId);
    if (!sprite) return;

    const fromCol = Math.round((sprite.x - TILE_SIZE / 2) / TILE_SIZE);
    const fromRow = Math.round((sprite.y - TILE_SIZE / 2) / TILE_SIZE);
    const dc = to.col - fromCol;
    const dr = to.row - fromRow;

    let animKey = 'infantry_neutral_walk-down';
    if (Math.abs(dc) >= Math.abs(dr)) {
      animKey = dc >= 0 ? 'infantry_neutral_walk-right' : 'infantry_neutral_walk-left';
    } else {
      animKey = dr >= 0 ? 'infantry_neutral_walk-down' : 'infantry_neutral_walk-up';
    }
    sprite.play(animKey, true);
  }

  private updateUnitAnimations(): void {
    for (const unit of this.gameState.getAllUnits()) {
      if (!unit.isAlive()) continue;
      const sprite = this.unitSprites.get(unit.id);
      if (!sprite) continue;

      if (unit.isEngagedInBattle()) {
        const attackKey = this.time.now % 1600 < 800
          ? 'infantry_neutral_attack-left'
          : 'infantry_neutral_attack-right';
        if (sprite.anims.currentAnim?.key !== attackKey) sprite.play(attackKey, true);
        return;
      }

      const movState = this.movementSystem.getAllStates().get(unit.id);
      const isMoving = (movState?.path.length ?? 0) > 0;
      if (isMoving) {
        // keep whatever walk anim playWalkAnim last set
        const cur = sprite.anims.currentAnim?.key ?? '';
        if (!cur.startsWith('infantry_neutral_walk-')) sprite.play('infantry_neutral_walk-down', true);
      } else {
        sprite.play('infantry_neutral_idle', true);
      }
    }
  }

  private removeUnitSprite(unitId: string): void {
    this.unitRings.get(unitId)?.destroy();
    this.unitSprites.get(unitId)?.destroy();
    this.unitLabels.get(unitId)?.destroy();
    this.unitRings.delete(unitId);
    this.unitSprites.delete(unitId);
    this.unitLabels.delete(unitId);
    this.unitColors.delete(unitId);
  }

  private updateFog(): void {
    if (this.setup.gameMode === 'sandbox' || this.isTutorialMode) {
      this.updateFogDisabled();
    } else {
      this.updateFogWithVision();
    }
  }

  private updateFogDisabled(): void {
    const grid = this.gameState.getGrid();
    const { rows, cols } = grid.getSize();
    const visible = new Set<string>();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        visible.add(`${r},${c}`);
      }
    }
    this.currentVisible = visible;
    this.currentDiscovered = visible;
    const localNationId = this.gameState.getLocalPlayer()?.getControlledNationId();
    if (localNationId) this.gameState.markDiscovered(localNationId, visible);
    this.drawTerritoryBorders();
    this.fogGraphic.clear();
    for (const city of this.gameState.getAllCities()) {
      this.citySprites.get(city.id)?.setVisible(true);
      this.cityLabels.get(city.id)?.setVisible(true);
    }
    for (const unit of this.gameState.getAllUnits()) {
      if (!unit.isAlive()) continue;
      this.unitSprites.get(unit.id)?.setVisible(true);
      this.unitLabels.get(unit.id)?.setVisible(true);
      this.unitRings.get(unit.id)?.setVisible(true);
    }
    for (const marker of this.contactMarkers.values()) marker.destroy();
    this.contactMarkers.clear();
  }

  private updateFogWithVision(): void {
    const localNationId = this.gameState.getLocalPlayer()?.getControlledNationId();
    if (!localNationId) { this.updateFogDisabled(); return; }

    const { visible, nearVisible, discovered } = this.visionSystem.compute(this.gameState, localNationId);
    this.currentVisible = visible;
    this.currentDiscovered = discovered;
    this.drawTerritoryBorders();

    // Draw fog: solid black for undiscovered, dark tint for discovered-but-not-visible
    this.fogGraphic.clear();
    const grid = this.gameState.getGrid();
    const { rows, cols } = grid.getSize();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = `${r},${c}`;
        if (!discovered.has(key)) {
          this.fogGraphic.fillStyle(0x000000, 1.0);
          this.fogGraphic.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else if (!visible.has(key)) {
          this.fogGraphic.fillStyle(0x000000, 0.55);
          this.fogGraphic.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Cities: show if discovered (own cities are always in discovered)
    for (const city of this.gameState.getAllCities()) {
      const pos = city.position;
      const show = city.getOwnerId() === localNationId || discovered.has(`${pos.row},${pos.col}`);
      this.citySprites.get(city.id)?.setVisible(show);
      this.cityLabels.get(city.id)?.setVisible(show);
    }

    // Clean up contact markers, rebuild below
    for (const marker of this.contactMarkers.values()) marker.destroy();
    this.contactMarkers.clear();

    // Units: show own always, enemy only when in visible set
    for (const unit of this.gameState.getAllUnits()) {
      if (!unit.isAlive()) continue;
      const isOwn = unit.getOwnerId() === localNationId;
      if (isOwn) {
        this.unitSprites.get(unit.id)?.setVisible(true);
        this.unitLabels.get(unit.id)?.setVisible(true);
        this.unitRings.get(unit.id)?.setVisible(true);
        continue;
      }
      const vis = this.visionSystem.unitVisibility(unit, visible, nearVisible, this.gameState, localNationId);
      this.unitSprites.get(unit.id)?.setVisible(vis === 'visible');
      this.unitLabels.get(unit.id)?.setVisible(vis === 'visible');
      this.unitRings.get(unit.id)?.setVisible(vis === 'visible');
      if (vis === 'near') {
        const key = `${unit.position.row},${unit.position.col}`;
        if (!this.contactMarkers.has(key)) {
          const cx = unit.position.col * TILE_SIZE + TILE_SIZE / 2;
          const cy = unit.position.row * TILE_SIZE + TILE_SIZE / 2;
          const armorLabel = unit.getStats().armorType === 'heavy' ? 'H' : 'L';
          const marker = this.add.text(cx, cy, armorLabel, {
            fontSize: '14px', color: '#ff8844', fontFamily: 'monospace', fontStyle: 'bold',
            stroke: '#000000', strokeThickness: 2,
          }).setOrigin(0.5).setDepth(290);
          this.contactMarkers.set(key, marker);
        }
      }
    }
  }

  private drawPaths(): void {
    this.pathGraphic.clear();
    const localNationId = this.gameState.getLocalPlayer()?.getControlledNationId() ?? null;

    for (const [unitId, state] of this.movementSystem.getAllStates()) {
      if (state.path.length === 0) continue;

      const unit = this.gameState.getUnit(unitId);
      if (!unit) continue;
      if (!this.shouldShowLiveUnitOverlay(unit, localNationId)) continue;

      const nation = this.gameState.getNation(unit.getOwnerId());
      const colorHex = nation?.getColor() ?? '#ffffff';
      const color = parseInt(colorHex.replace('#', ''), 16);

      const startX = unit.position.col * TILE_SIZE + TILE_SIZE / 2;
      const startY = unit.position.row * TILE_SIZE + TILE_SIZE / 2;

      this.pathGraphic.lineStyle(2, color, 0.7);
      this.pathGraphic.beginPath();
      this.pathGraphic.moveTo(startX, startY);

      for (const step of state.path) {
        const x = step.col * TILE_SIZE + TILE_SIZE / 2;
        const y = step.row * TILE_SIZE + TILE_SIZE / 2;
        this.pathGraphic.lineTo(x, y);
      }
      this.pathGraphic.strokePath();

      this.pathGraphic.fillStyle(color, 0.9);
      for (const step of state.path) {
        const x = step.col * TILE_SIZE + TILE_SIZE / 2;
        const y = step.row * TILE_SIZE + TILE_SIZE / 2;
        this.pathGraphic.fillCircle(x, y, 3);
      }
    }
  }

  private drawSelection(): void {
    this.selectionGraphic.clear();

    if (this.selectedUnitId) {
      const unit = this.gameState.getUnit(this.selectedUnitId);
      if (unit) {
        const pos = unit.position;
        this.selectionGraphic.lineStyle(2, 0xffd700, 1);
        this.selectionGraphic.strokeRect(
          pos.col * TILE_SIZE + 1,
          pos.row * TILE_SIZE + 1,
          TILE_SIZE - 2,
          TILE_SIZE - 2,
        );
      }
    }

    if (this.selectedCityId) {
      const city = this.gameState.getCity(this.selectedCityId);
      if (city) {
        const pos = city.position;
        this.selectionGraphic.lineStyle(2, 0x88aaff, 1);
        this.selectionGraphic.strokeRect(
          pos.col * TILE_SIZE + 1,
          pos.row * TILE_SIZE + 1,
          TILE_SIZE - 2,
          TILE_SIZE - 2,
        );
      }
    }

    if (this.selectedTerritory) {
      this.selectionGraphic.lineStyle(2, 0x66ccff, 1);
      this.selectionGraphic.strokeRect(
        this.selectedTerritory.col * TILE_SIZE + 1,
        this.selectedTerritory.row * TILE_SIZE + 1,
        TILE_SIZE - 2,
        TILE_SIZE - 2,
      );
    }
  }

  private drawUnitHealthBars(): void {
    this.healthBarGraphic.clear();
    const localNationId = this.gameState.getLocalPlayer()?.getControlledNationId() ?? null;

    const unitsByTile = new Map<string, Unit[]>();
    for (const unit of this.gameState.getAllUnits()) {
      if (!unit.isAlive()) continue;
      if (!this.shouldShowLiveUnitOverlay(unit, localNationId)) continue;
      const key = `${unit.position.row},${unit.position.col}`;
      const list = unitsByTile.get(key) ?? [];
      list.push(unit);
      unitsByTile.set(key, list);
    }

    for (const units of unitsByTile.values()) {
      units.sort((a, b) => a.id.localeCompare(b.id));

      units.forEach((unit, index) => {
        const nation = this.gameState.getNation(unit.getOwnerId());
        const teamColor = parseInt((nation?.getColor() ?? '#ffffff').replace('#', ''), 16);
        const maxHealth = unit.getStats().maxHealth;
        const hpRatio   = maxHealth > 0 ? unit.getHealth() / maxHealth : 0;

        const barWidth   = 24;
        const barHeight  = 4;
        const barGap     = 1;
        const stackPitch = barHeight * 2 + barGap + 5; // HP + morale + gap + 5px between stacked units
        const x  = unit.position.col * TILE_SIZE + TILE_SIZE / 2 - barWidth / 2;
        const yHp = unit.position.row * TILE_SIZE - 12 - index * stackPitch;
        const yMo = yHp + barHeight + barGap;

        // HP bar — fill is the unit's team color
        this.healthBarGraphic.fillStyle(0x000000, 1);
        this.healthBarGraphic.fillRect(x, yHp, barWidth, barHeight);
        this.healthBarGraphic.fillStyle(teamColor, 1);
        this.healthBarGraphic.fillRect(x, yHp, Math.max(0, Math.round(barWidth * hpRatio)), barHeight);
        this.healthBarGraphic.lineStyle(1, 0x000000, 1);
        this.healthBarGraphic.strokeRect(x, yHp, barWidth, barHeight);

        // Morale bar — fill is the morale band color
        const morale     = unit.getMorale();
        const moraleRatio = Math.max(0, Math.min(1, morale / 100));
        const moraleFill  = moraleBandFill(getMoraleBand(morale));
        this.healthBarGraphic.fillStyle(0x000000, 1);
        this.healthBarGraphic.fillRect(x, yMo, barWidth, barHeight);
        this.healthBarGraphic.fillStyle(moraleFill, 1);
        this.healthBarGraphic.fillRect(x, yMo, Math.max(0, Math.round(barWidth * moraleRatio)), barHeight);
        this.healthBarGraphic.lineStyle(1, 0x000000, 1);
        this.healthBarGraphic.strokeRect(x, yMo, barWidth, barHeight);
      });
    }
  }

  private drawCityHealthBars(): void {
    for (const city of this.gameState.getAllCities()) {
      const pos = city.position;
      if (!this.currentVisible.has(`${pos.row},${pos.col}`)) continue;

      const ratio    = city.getMaxHealth() > 0 ? city.getHealth() / city.getMaxHealth() : 0;
      const nation   = this.gameState.getNation(city.getOwnerId());
      const color    = parseInt((nation?.getColor() ?? '#ffffff').replace('#', ''), 16);
      const barW     = TILE_SIZE - 8;
      const barH     = 4;
      const x        = pos.col * TILE_SIZE + 4;
      const y        = pos.row * TILE_SIZE + TILE_SIZE - barH - 3;

      this.healthBarGraphic.fillStyle(0x000000, 0.8);
      this.healthBarGraphic.fillRect(x, y, barW, barH);
      this.healthBarGraphic.fillStyle(color, 1);
      this.healthBarGraphic.fillRect(x, y, Math.max(0, Math.round(barW * ratio)), barH);
      this.healthBarGraphic.lineStyle(1, 0x000000, 0.7);
      this.healthBarGraphic.strokeRect(x, y, barW, barH);
    }

    // Territory HP bars — only shown while actively under attack
    const grid = this.gameState.getGrid();
    for (const battle of this.tickEngine.getTerritoryBattlesForDisplay()) {
      const pos = battle.position;
      if (!this.currentVisible.has(`${pos.row},${pos.col}`)) continue;

      const territory = grid.getTerritory(pos);
      if (!territory) continue;

      const maxHp = territory.getMaxHealth();
      const ratio  = maxHp > 0 ? territory.getHealth() / maxHp : 0;
      const barW   = TILE_SIZE - 8;
      const barH   = 4;
      const x      = pos.col * TILE_SIZE + 4;
      const y      = pos.row * TILE_SIZE + TILE_SIZE - barH - 3;
      const color  = ratio > 0.5 ? 0x44cc88 : ratio > 0.25 ? 0xffaa22 : 0xff4444;

      this.healthBarGraphic.fillStyle(0x000000, 0.8);
      this.healthBarGraphic.fillRect(x, y, barW, barH);
      this.healthBarGraphic.fillStyle(color, 1);
      this.healthBarGraphic.fillRect(x, y, Math.max(0, Math.round(barW * ratio)), barH);
      this.healthBarGraphic.lineStyle(1, 0x000000, 0.7);
      this.healthBarGraphic.strokeRect(x, y, barW, barH);
    }
  }

  private shouldShowLiveUnitOverlay(unit: Unit, localNationId: string | null): boolean {
    if (this.setup.gameMode === 'sandbox' || this.isTutorialMode) return true;
    if (!localNationId) return true;
    if (unit.getOwnerId() === localNationId) return true;
    return this.currentVisible.has(`${unit.position.row},${unit.position.col}`);
  }

  /** Pulsing ring drawn over the tile the tutorial is currently pointing at. */
  private drawTutorialHighlight(): void {
    if (!this.tutorialGraphic) return;
    this.tutorialGraphic.clear();
    const tile = this.tutorialHighlightTile;
    if (!tile) return;
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 250);
    const x = tile.col * TILE_SIZE;
    const y = tile.row * TILE_SIZE;
    this.tutorialGraphic.lineStyle(3, 0x7bd4ff, 0.4 + 0.5 * pulse);
    this.tutorialGraphic.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  }

  private handleLeftClick(worldX: number, worldY: number): void {
    if (this.uiClickConsumed) { this.uiClickConsumed = false; return; }
    const col = Math.floor(worldX / TILE_SIZE);
    const row = Math.floor(worldY / TILE_SIZE);
    const target = { row, col };

    if (!this.gameState.getGrid().isValidCoordinate(target)) return;

    if (this.tileEditActive) {
      this.cycleTileTerrain(row, col);
      return;
    }

    // ── Ranged target-selection mode ─────────────────────────────────────────
    // Double-click detection for city/territory menus
    const now = Date.now();
    const targetKey = `${row},${col}`;
    const isDoubleClick = (now - this.lastClickMs) < this.DOUBLE_CLICK_MS && this.lastClickTarget === targetKey;
    this.lastClickMs = now;
    this.lastClickTarget = targetKey;

    const localPlayer = this.gameState.getLocalPlayer();
    const localNation = localPlayer
      ? this.gameState.getNation(localPlayer.getControlledNationId())
      : null;

    // ── Determine the local player's nation id via whatever is available ─────
    // localNation can be null if setup isn't complete yet; fall back to the
    // currently-selected unit's owner so re-selection still works.
    const localNationId: string | null =
      localNation?.getId() ??
      (this.selectedUnitId ? (this.gameState.getUnit(this.selectedUnitId)?.getOwnerId() ?? null) : null);

    // ── 1. Click on tile with a unit (possibly also a city) ─────────────────
    // Single-click → select the unit.
    // Double-click → open city menu (if city on tile) OR territory menu (otherwise).
    const clickedUnit = this.getUnitAt(target);
    if (clickedUnit && localNationId && clickedUnit.getOwnerId() === localNationId) {
      if (isDoubleClick) {
        const cityOnTile = this.getCityAt(target);
        if (cityOnTile) {
          if (localNation && cityOnTile.getOwnerId() === localNation.getId()) {
            this.selectCity(cityOnTile);
          } else {
            this.openDiplomacy(cityOnTile.getOwnerId());
          }
        } else {
          this.selectTerritory(target);
        }
        return;
      }
      this.selectUnit(clickedUnit);
      return;
    }

    // ── 2. If a unit is selected, single-click moves it; double-click opens menus ──
    if (this.selectedUnitId && localPlayer) {
      const clickedCity = this.getCityAt(target);

      // Double-click while unit is selected: open the appropriate menu instead
      if (isDoubleClick) {
        if (clickedCity && localNation && clickedCity.getOwnerId() === localNation.getId()) {
          this.selectCity(clickedCity);
          return;
        }
        if (clickedCity) {
          this.openDiplomacy(clickedCity.getOwnerId());
          return;
        }
        // Double-click on empty tile → still move the unit
      }

      // Single-click (or double-click on empty tile): pathfind and move
      const unit = this.gameState.getUnit(this.selectedUnitId);
      if (unit) {
        const path = this.pathfinder.findPath(
          unit.position, target, unit.getUnitType(), unit.getStats(),
          unit.getOwnerId(), this.gameState,
        );
        if (path && path.length > 0) {
          this.dispatchMoveWithWarCheck(localPlayer.getId(), unit.id, path);
        }
      }
      return;
    }

    // ── 3. No unit selected: city / territory click ───────────────────────────
    const clickedCity = this.getCityAt(target);
    if (clickedCity) {
      if (localNation && clickedCity.getOwnerId() === localNation.getId()) {
        if (isDoubleClick) { this.selectCity(clickedCity); }
        else               { this.highlightCity(clickedCity); }
      } else {
        if (isDoubleClick) { this.openDiplomacy(clickedCity.getOwnerId()); }
        else {
          this.selectedCityId    = clickedCity.id;
          this.selectedUnitId    = null;
          this.selectedTerritory = null;
          this.bridge.closeMenu();
          this.updateUISelection(undefined);
          this.eventBus.emit('city:selected', { city: clickedCity });
          this.rangeGraphic.clear();
        }
      }
      return;
    }

    const clickedTerritory = this.gameState.getGrid().getTerritory(target);
    if (clickedTerritory) {
      void clickedTerritory;
      if (isDoubleClick) { this.selectTerritory(target); }
      else               { this.highlightTerritory(target); }
    }
  }

  /**
   * Dispatch MOVE_UNIT, but first check whether the path crosses neutral
   * territory or targets a neutral nation's unit/city.  If so, show the
   * WarConfirmScene popup and only dispatch on confirmation.
   */
  private dispatchMoveWithWarCheck(
    playerId: string,
    unitId:   string,
    path:     GridCoordinates[],
  ): void {
    const localNation = this.gameState.getLocalPlayer()
      ? this.gameState.getNation(this.gameState.getLocalPlayer()!.getControlledNationId())
      : null;

    const neutralsHit = localNation
      ? this.findNeutralNationsOnPath(path, localNation.getId())
      : [];

    const dispatchMove = (): void => {
      void this.networkAdapter.sendCommand({
        type: 'MOVE_UNIT',
        playerId,
        unitId,
        path,
        issuedAtTick: this.tickEngine.getCurrentTick(),
      });
    };

    if (neutralsHit.length === 0) {
      dispatchMove();
      return;
    }

    // Show war confirmation popup; dispatch only if player confirms
    this.bridge.openWarConfirm(
      neutralsHit.map(id => this.gameState.getNation(id)?.getName() ?? id),
      () => {
        void (async () => {
          for (const targetNationId of neutralsHit) {
            await this.networkAdapter.sendCommand({
              type: 'DECLARE_WAR',
              playerId,
              targetNationId,
              issuedAtTick: this.tickEngine.getCurrentTick(),
            });
          }
          dispatchMove();
        })();
      },
    );
  }

  /**
   * Returns IDs of neutral nations (not allied, not already at war) whose
   * territory the path crosses or whose units/cities sit at the destination.
   */
  private findNeutralNationsOnPath(
    path:          GridCoordinates[],
    localNationId: string,
  ): string[] {
    const localNation = this.gameState.getNation(localNationId);
    if (!localNation) return [];

    const found = new Set<string>();

    for (const pos of path) {
      // Territory ownership
      const ctrl = this.gameState.getGrid().getTerritory(pos)?.getControllingNation();
      if (ctrl && ctrl !== localNationId &&
          localNation.getRelation(ctrl) === DiplomaticStatus.NEUTRAL) {
        found.add(ctrl);
      }
      // Foreign cities on any path tile
      const city = this.getCityAt(pos);
      if (city && city.getOwnerId() !== localNationId &&
          localNation.getRelation(city.getOwnerId()) === DiplomaticStatus.NEUTRAL) {
        found.add(city.getOwnerId());
      }
      // Enemy units on tiles along the path
      for (const u of this.gameState.getAllUnits()) {
        if (u.position.row === pos.row && u.position.col === pos.col &&
            u.getOwnerId() !== localNationId &&
            localNation.getRelation(u.getOwnerId()) === DiplomaticStatus.NEUTRAL) {
          found.add(u.getOwnerId());
        }
      }
    }

    return Array.from(found);
  }

  private cycleTileTerrain(row: number, col: number): void {
    const territory = this.gameState.getGrid().getTerritory({ row, col });
    if (!territory) return;
    const current = territory.getTerrainType();
    const idx = TERRAIN_CYCLE.indexOf(current);
    const next = TERRAIN_CYCLE[(idx + 1) % TERRAIN_CYCLE.length]!;
    territory.setTerrainType(next);
    this.terrainImages.get(`${row},${col}`)?.setTexture(TERRAIN_TEXTURE[next]);
  }

  private handleRightClick(): void {
    if (!this.selectedUnitId && !this.selectedCityId && !this.selectedTerritory) return;
    this.clearSelection();
  }

  private selectUnit(unit: Unit): void {
    this.selectedUnitId = unit.id;
    this.selectedCityId = null;
    this.selectedTerritory = null;
    this.bridge.closeMenu();
    this.updateUISelection(unit);
    this.eventBus.emit('city:selected', { city: null });
    this.drawRangeOverlay(unit);
  }

  private selectCity(city: City): void {
    this.selectedCityId = city.id;
    this.selectedUnitId = null;
    this.selectedTerritory = null;
    this.updateUISelection(undefined);
    this.bridge.openCityMenu(city);
  }

  private selectTerritory(position: GridCoordinates): void {
    this.selectedTerritory = { ...position };
    this.selectedUnitId = null;
    this.selectedCityId = null;
    this.updateUISelection(undefined);
    this.bridge.openTerritoryMenu(position);
  }

  /** Single-click: highlight the city tile without opening the menu. */
  private highlightCity(city: City): void {
    this.selectedCityId = city.id;
    this.selectedUnitId = null;
    this.selectedTerritory = null;
    this.bridge.closeMenu();
    this.updateUISelection(undefined);
    this.eventBus.emit('city:selected', { city });
    this.rangeGraphic.clear();
  }

  /** Single-click: highlight the territory tile without opening the menu. */
  private highlightTerritory(position: GridCoordinates): void {
    this.selectedTerritory = { ...position };
    this.selectedUnitId = null;
    this.selectedCityId = null;
    this.bridge.closeMenu();
    this.updateUISelection(undefined);
    this.eventBus.emit('city:selected', { city: null });
    this.eventBus.emit('territory:highlighted', { position: { ...position } });
    this.rangeGraphic.clear();
  }

  private openDiplomacy(targetNationId?: string): void {
    this.bridge.closeMenu();
    this.bridge.openDiplomacy(targetNationId);
  }

  private clearSelection(): void {
    this.selectedUnitId = null;
    this.selectedCityId = null;
    this.selectedTerritory = null;
    this.bridge.closeMenu();
    this.updateUISelection(undefined);
    this.eventBus.emit('city:selected', { city: null });
    this.eventBus.emit('territory:highlighted', { position: null });
    this.rangeGraphic.clear();
  }

  private drawTerritoryBorders(): void {
    this.territoryGraphic.clear();
    const grid = this.gameState.getGrid();
    const { rows, cols } = grid.getSize();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = `${r},${c}`;
        if (!this.currentDiscovered.has(key)) continue;

        const territory = grid.getTerritory({ row: r, col: c });
        if (!territory) continue;

        const ownerId = territory.getControllingNation();
        if (!ownerId) continue;

        const nation = this.gameState.getNation(ownerId);
        if (!nation) continue;

        const color = parseInt(nation.getColor().replace('#', ''), 16);

        const isVisible = this.currentVisible.has(key);
        this.territoryGraphic.fillStyle(color, isVisible ? 0.12 : 0.06);
        this.territoryGraphic.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);

        this.territoryGraphic.lineStyle(2, color, isVisible ? 0.9 : 0.55);
        const neighbors: Array<{ dr: number; dc: number; x1: number; y1: number; x2: number; y2: number }> = [
          { dr: -1, dc: 0, x1: c * TILE_SIZE, y1: r * TILE_SIZE, x2: (c + 1) * TILE_SIZE, y2: r * TILE_SIZE },
          { dr: 1, dc: 0, x1: c * TILE_SIZE, y1: (r + 1) * TILE_SIZE, x2: (c + 1) * TILE_SIZE, y2: (r + 1) * TILE_SIZE },
          { dr: 0, dc: -1, x1: c * TILE_SIZE, y1: r * TILE_SIZE, x2: c * TILE_SIZE, y2: (r + 1) * TILE_SIZE },
          { dr: 0, dc: 1, x1: (c + 1) * TILE_SIZE, y1: r * TILE_SIZE, x2: (c + 1) * TILE_SIZE, y2: (r + 1) * TILE_SIZE },
        ];

        for (const edge of neighbors) {
          const nbr = grid.getTerritory({ row: r + edge.dr, col: c + edge.dc });
          if (!nbr || nbr.getControllingNation() !== ownerId) {
            this.territoryGraphic.beginPath();
            this.territoryGraphic.moveTo(edge.x1, edge.y1);
            this.territoryGraphic.lineTo(edge.x2, edge.y2);
            this.territoryGraphic.strokePath();
          }
        }
      }
    }
  }

  /** Draw a progress bar on each actively contested territory tile. */
  private drawConquestOverlay(): void {
    this.conquestGraphic.clear();

    for (const [posKey, { progress, needed, nationId }] of this.activeConquests) {
      if (!this.currentVisible.has(posKey)) continue;
      const [rowStr, colStr] = posKey.split(',');
      const row = parseInt(rowStr ?? '0', 10);
      const col = parseInt(colStr ?? '0', 10);

      const ratio   = needed > 0 ? Math.min(1, progress / needed) : 0;
      const barW    = TILE_SIZE - 4;
      const barH    = 5;
      const x       = col * TILE_SIZE + 2;
      const y       = (row + 1) * TILE_SIZE - barH - 2;

      const nation  = this.gameState.getNation(nationId);
      const color   = nation ? parseInt(nation.getColor().replace('#', ''), 16) : 0xffffff;

      // Pulsing tint on the tile to show it's being contested
      const pulse = 0.10 + 0.06 * Math.sin(this.time.now / 300);
      this.conquestGraphic.fillStyle(color, pulse);
      this.conquestGraphic.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);

      // Progress bar background
      this.conquestGraphic.fillStyle(0x000000, 0.7);
      this.conquestGraphic.fillRect(x, y, barW, barH);

      // Progress bar fill
      this.conquestGraphic.fillStyle(color, 0.95);
      this.conquestGraphic.fillRect(x, y, Math.max(1, Math.round(barW * ratio)), barH);
    }
  }

  /** Draw progress bars for city queues and territory construction directly on the map. */
  private drawConstructionOverlay(): void {
    this.constructionGraphic.clear();

    for (const city of this.gameState.getAllCities()) {
      const order = city.getCurrentOrder();
      const pos = city.position;
      if (!order || !this.currentVisible.has(`${pos.row},${pos.col}`)) continue;
      const nation = this.gameState.getNation(city.getOwnerId());
      const color = nation ? parseInt(nation.getColor().replace('#', ''), 16) : 0x44cc88;
      this.drawTileProgressBar(pos, city.getProgressFraction(), color, 0);
    }

    const grid = this.gameState.getGrid();
    const { rows, cols } = grid.getSize();
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const territory = grid.getTerritory({ row, col });
        const order = territory?.getCurrentConstruction();
        const key = `${row},${col}`;
        if (!territory || !order || !this.currentVisible.has(key)) continue;

        const nation = this.gameState.getNation(order.nationId);
        const color = nation ? parseInt(nation.getColor().replace('#', ''), 16) : 0xffd166;
        const pulse = 0.10 + 0.05 * Math.sin(this.time.now / 260);
        this.constructionGraphic.fillStyle(color, pulse);
        this.constructionGraphic.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        this.drawTileProgressBar({ row, col }, territory.getConstructionProgressFraction(), color, 6);
      }
    }
  }

  private drawTileProgressBar(position: GridCoordinates, ratio: number, color: number, yOffset: number): void {
    const barW = TILE_SIZE - 8;
    const barH = 5;
    const x = position.col * TILE_SIZE + 4;
    const y = position.row * TILE_SIZE + 4 + yOffset;
    this.constructionGraphic.fillStyle(0x000000, 0.72);
    this.constructionGraphic.fillRect(x, y, barW, barH);
    this.constructionGraphic.fillStyle(color, 0.96);
    this.constructionGraphic.fillRect(x, y, Math.max(1, Math.round(barW * ratio)), barH);
    this.constructionGraphic.lineStyle(1, 0x000000, 0.75);
    this.constructionGraphic.strokeRect(x, y, barW, barH);
  }

  private getUnitAt(coords: GridCoordinates): Unit | null {
    for (const unit of this.gameState.getAllUnits()) {
      const pos = unit.position;
      if (pos.row === coords.row && pos.col === coords.col) return unit;
    }
    return null;
  }

  private getCityAt(coords: GridCoordinates): City | null {
    const territory = this.gameState.getGrid().getTerritory(coords);
    if (!territory) return null;

    const cityId = territory.getCityId();
    if (!cityId) return null;

    return this.gameState.getCity(cityId);
  }

  private drawWaterBorder(): void {
    const { rows, cols } = this.gameState.getGrid().getSize();
    const imgH = TILE_SIZE * (384 / 256);
    for (let r = -WATER_BORDER; r < rows + WATER_BORDER; r++) {
      for (let c = -WATER_BORDER; c < cols + WATER_BORDER; c++) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) continue;
        const cx      = c * TILE_SIZE + TILE_SIZE / 2;
        const bottomY = (r + 1) * TILE_SIZE;
        this.add.image(cx, bottomY, 'terrain_water')
          .setDisplaySize(TILE_SIZE, imgH)
          .setOrigin(0.5, 1)
          .setDepth(-1);
      }
    }
  }

  private onResize(): void {
    const { rows, cols } = this.gameState.getGrid().getSize();
    const totalWidth = (cols + WATER_BORDER * 2) * TILE_SIZE;
    const totalHeight = (rows + WATER_BORDER * 2) * TILE_SIZE;
    this.minZoom = Math.max(0.15, Math.min(
      this.scale.width  / totalWidth,
      this.scale.height / totalHeight,
    ) * 0.85);
    // Clamp current zoom in case it's now below the new minimum
    const clamped = Phaser.Math.Clamp(this.cameras.main.zoom, this.minZoom, 2.5);
    if (clamped !== this.cameras.main.zoom) this.cameras.main.setZoom(clamped);
  }

  /** Keep range overlay in sync with selected unit's movement each frame. */
  private updateRangeOverlay(): void {
    if (!this.selectedUnitId) return;
    const unit = this.gameState.getUnit(this.selectedUnitId);
    if (unit) this.drawRangeOverlay(unit);
  }

  /** Show/update small stance badge above any local-player unit currently in battle. */
  private updateStanceBadges(): void {
    const lp = this.gameState.getLocalPlayer();
    const ln = lp ? this.gameState.getNation(lp.getControlledNationId()) : null;
    if (!ln) return;

    const zoom = this.cameras.main.zoom;
    const activeIds = new Set<string>();

    for (const unit of this.gameState.getAllUnits()) {
      if (!unit.isAlive() || !unit.isEngagedInBattle()) continue;
      if (unit.getOwnerId() !== ln.getId()) continue;

      activeIds.add(unit.id);

      const wx = unit.position.col * TILE_SIZE + TILE_SIZE / 2;
      const wy = unit.position.row * TILE_SIZE;

      let badge = this.stanceBadges.get(unit.id);
      if (!badge) {
        const bg  = this.add.rectangle(0, 0, 52, 14, 0x0a0e1e, 0.88).setStrokeStyle(1, 0x4455bb);
        const txt = this.add.text(0, 0, '', {
          fontSize: '9px', color: '#aabbff', fontFamily: 'monospace', fontStyle: 'bold',
        }).setOrigin(0.5);
        badge = this.add.container(wx, wy, [bg, txt]).setDepth(810);
        this.stanceBadges.set(unit.id, badge);
      }

      badge.setPosition(wx, wy);
      badge.setScale(1 / zoom);

      const effective = effectiveBattleOrder(unit);
      const txt = badge.getAt(1) as Phaser.GameObjects.Text;
      txt.setText(stanceShortLabel(effective));
      txt.setColor(stanceBadgeColor(effective));
    }

    // Remove badges for units no longer in battle
    for (const [id, badge] of this.stanceBadges) {
      if (!activeIds.has(id)) {
        badge.destroy();
        this.stanceBadges.delete(id);
      }
    }
  }

  private drawRangeOverlay(unit: Unit): void {
    this.rangeGraphic.clear();
    const stats = unit.getStats();
    if (stats.attackRange <= 1 || stats.rangedDamage <= 0) return; // melee — no overlay

    const grid = this.gameState.getGrid();
    const range = stats.attackRange;
    const { row: ur, col: uc } = unit.position;

    this.rangeGraphic.fillStyle(0xff3300, 0.13);
    this.rangeGraphic.lineStyle(1, 0xff5500, 0.35);

    for (let dr = -range; dr <= range; dr++) {
      for (let dc = -range; dc <= range; dc++) {
        if (Math.abs(dr) + Math.abs(dc) > range) continue;
        if (dr === 0 && dc === 0) continue; // skip the unit's own tile
        const r = ur + dr;
        const c = uc + dc;
        if (!grid.isValidCoordinate({ row: r, col: c })) continue;
        this.rangeGraphic.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        this.rangeGraphic.strokeRect(c * TILE_SIZE + 1, r * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      }
    }
  }

  private updateUISelection(unit: Unit | undefined): void {
    this.eventBus.emit('unit:selected', { unit: unit ?? null });
  }
}
