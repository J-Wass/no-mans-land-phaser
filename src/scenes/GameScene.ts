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
import { CommandProcessor } from '@/commands/CommandProcessor';
import { AISystem } from '@/systems/ai/AISystem';
import { DiplomacySystem } from '@/systems/diplomacy/DiplomacySystem';
import { DiplomaticStatus } from '@/types/diplomacy';
import { TerrainType } from '@/systems/grid/Territory';
import { TILE_SIZE, TICK_INTERVAL_MS } from '@/config/constants';

const WATER_BORDER = 10;
const GRID_SIZE    = 25;
import type { GameSetup, GameSaveData } from '@/types/gameSetup';
import type { GridCoordinates } from '@/types/common';
import type { Unit, BattleOrder } from '@/entities/units/Unit';
import type { City } from '@/entities/cities/City';

interface GameSceneData {
  gameState?: GameState;
  setup?: GameSetup;
  saveData?: GameSaveData;
}

const TERRAIN_TEXTURE: Record<TerrainType, string> = {
  [TerrainType.PLAINS]: 'terrain_plains',
  [TerrainType.HILLS]: 'terrain_hills',
  [TerrainType.FOREST]: 'terrain_forest',
  [TerrainType.MOUNTAIN]: 'terrain_mountain',
  [TerrainType.WATER]: 'terrain_water',
  [TerrainType.DESERT]: 'terrain_desert',
};

export class GameScene extends Phaser.Scene {
  private gameState!: GameState;
  private setup!: GameSetup;
  private movementSystem!: MovementSystem;
  private pathfinder!: Pathfinder;
  private tickEngine!: TickEngine;
  private eventBus!: GameEventBus;
  private commandProcessor!: CommandProcessor;

  private unitSprites: Map<string, Phaser.GameObjects.Arc> = new Map();
  private unitLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private unitColors: Map<string, number> = new Map();   // base fill color per unit
  private citySprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private cityLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private cityDots: Map<string, Phaser.GameObjects.Arc> = new Map();
  private selectionGraphic!: Phaser.GameObjects.Graphics;
  private pathGraphic!: Phaser.GameObjects.Graphics;
  private territoryGraphic!: Phaser.GameObjects.Graphics;
  private rangeGraphic!: Phaser.GameObjects.Graphics;
  private healthBarGraphic!: Phaser.GameObjects.Graphics;

  private selectedUnitId: string | null = null;
  private selectedCityId: string | null = null;
  private selectedTerritory: GridCoordinates | null = null;
  private tickAccumulator = 0;
  private aiSystem!: AISystem;
  private diplomacySystem!: DiplomacySystem;

  private uiClickConsumed = false;
  private stanceBadges: Map<string, Phaser.GameObjects.Container> = new Map();
  private minZoom = 0.25;
  private targetingUnitId: string | null = null;   // ranged target-selection mode
  private targetingGraphic!: Phaser.GameObjects.Graphics;

  // Double-click detection for city/territory menus
  private lastClickMs     = 0;
  private lastClickTarget = '';
  private readonly DOUBLE_CLICK_MS = 350;

  constructor() {
    super({ key: 'GameScene' });
  }

  preload(): void {
    this.load.image('terrain_plains', 'terrain_squares/plains.png');
    this.load.image('terrain_hills', 'terrain_squares/snowforest.png');
    this.load.image('terrain_forest', 'terrain_squares/forest.png');
    this.load.image('terrain_mountain', 'terrain_squares/mountains.png');
    this.load.image('terrain_water', 'terrain_squares/ocean.png');
    this.load.image('terrain_desert', 'terrain_squares/desert.png');
    this.load.image('city_town', 'terrain_squares/town.png');
  }

  init(data: GameSceneData): void {
    if (data.saveData) {
      const sd = data.saveData;
      this.gameState = GameState.fromJSON(sd.state as ReturnType<GameState['toJSON']>);
      this.setup = sd.setup;
    } else {
      this.gameState = data.gameState!;
      this.setup = data.setup ?? { opponentCount: 1, difficulty: 'medium' };
    }
  }

  create(): void {
    this.unitSprites.clear();
    this.unitLabels.clear();
    this.unitColors.clear();
    this.citySprites.clear();
    this.cityLabels.clear();
    this.cityDots.clear();
    this.selectedUnitId = null;
    this.selectedCityId = null;
    this.selectedTerritory = null;
    this.targetingUnitId = null;
    this.tickAccumulator = 0;

    this.movementSystem = new MovementSystem();
    this.pathfinder = new Pathfinder(this.gameState.getGrid());
    this.eventBus = new GameEventBus();
    this.tickEngine = new TickEngine(this.gameState, this.movementSystem, this.eventBus);
    this.diplomacySystem  = new DiplomacySystem(this.gameState, this.eventBus);
    this.commandProcessor = new CommandProcessor(
      this.gameState, this.movementSystem, this.eventBus, this.diplomacySystem,
    );
    this.aiSystem = new AISystem(
      this.gameState,
      this.commandProcessor,
      this.movementSystem,
      this.pathfinder,
      this.setup.difficulty,
    );

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

    this.territoryGraphic = this.add.graphics().setDepth(28);
    this.rangeGraphic     = this.add.graphics().setDepth(29);
    this.pathGraphic      = this.add.graphics().setDepth(100);
    this.selectionGraphic = this.add.graphics().setDepth(200);
    this.healthBarGraphic = this.add.graphics().setDepth(500);
    this.targetingGraphic = this.add.graphics().setDepth(210);

    this.createCitySprites();
    this.createUnitSprites();
    this.drawTerritoryBorders();

    this.eventBus.on('unit:step-complete', ({ unitId, to }) => {
      this.moveSpriteTo(unitId, to);
    });

    this.eventBus.on('city:unit-spawned', ({ unitId }) => {
      const unit = this.gameState.getUnit(unitId);
      if (unit) this.createSpriteForUnit(unit);
    });
    this.eventBus.on('unit:destroyed', ({ unitId }) => {
      this.removeUnitSprite(unitId);
      if (this.selectedUnitId === unitId) this.clearSelection();
    });

    this.eventBus.on('unit:battle-order-changed', () => { /* UIScene handles this */ });

    // Flash the firing unit briefly white on each ranged shot
    this.eventBus.on('ranged:fired', ({ unitId }) => {
      const sprite = this.unitSprites.get(unitId);
      const baseColor = this.unitColors.get(unitId);
      if (!sprite || baseColor === undefined) return;
      sprite.setFillStyle(0xffffff);
      this.time.delayedCall(130, () => {
        if (sprite.active) sprite.setFillStyle(baseColor);
      });
    });

    // Enter ranged target-selection mode when UIScene requests it
    this.eventBus.on('ui:ranged-targeting', ({ unitId }) => {
      this.targetingUnitId = unitId;
    });

    // Auto-show order popup when a local-player unit enters any battle
    this.eventBus.on('battle:started', ({ unitAId, unitBId }) => {
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

    this.eventBus.on('city:siege-started', ({ unitId }) => {
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

    this.eventBus.on('city:conquered', ({ cityId, byNationId, position }) => {
      // Update the nation-color dot on the city sprite
      const dot = this.cityDots.get(cityId);
      if (dot) {
        const nation = this.gameState.getNation(byNationId);
        const newColor = parseInt((nation?.getColor() ?? '#ffffff').replace('#', ''), 16);
        dot.setFillStyle(newColor);
      }
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
      this.drawTerritoryBorders();
    });

    this.eventBus.on('territory:claimed', () => this.drawTerritoryBorders());
    this.eventBus.on('territory:building-built', () => this.drawTerritoryBorders());

    // Camera bounds include the visual water border
    const totalSize = (GRID_SIZE + WATER_BORDER * 2) * TILE_SIZE;
    this.cameras.main.setBounds(
      -WATER_BORDER * TILE_SIZE, -WATER_BORDER * TILE_SIZE,
      totalSize, totalSize,
    );
    // Set minimum zoom so user can't zoom out past the water ring
    this.minZoom = Math.max(0.15, Math.min(
      this.scale.width  / totalSize,
      this.scale.height / totalSize,
    ) * 0.85);
    // Default zoom: fit the playable grid comfortably
    const defaultZoom = Math.min(
      this.scale.width  / (GRID_SIZE * TILE_SIZE),
      this.scale.height / (GRID_SIZE * TILE_SIZE),
      1.5,
    );
    this.cameras.main.setZoom(defaultZoom);
    this.cameras.main.centerOn(
      (GRID_SIZE * TILE_SIZE) / 2,
      (GRID_SIZE * TILE_SIZE) / 2,
    );
    this.scale.on('resize', this.onResize, this);

    this.setupMouseControls();

    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.targetingUnitId) {
        // Cancel ranged target-selection mode first; don't open pause
        this.targetingUnitId = null;
        return;
      }
      this.scene.launch('PauseScene', {
        gameState:       this.gameState,
        tickEngine:      this.tickEngine,
        movementSystem:  this.movementSystem,
        diplomacySystem: this.diplomacySystem,
        setup:           this.setup,
      });
    });

    this.eventBus.on('ui:click-consumed', () => { this.uiClickConsumed = true; });

    this.scene.launch('UIScene', {
      setup: this.setup,
      gameState: this.gameState,
      commandProcessor: this.commandProcessor,
      eventBus: this.eventBus,
    });
  }

  override update(_time: number, delta: number): void {
    this.tickAccumulator += delta;
    while (this.tickAccumulator >= TICK_INTERVAL_MS) {
      this.tickAccumulator -= TICK_INTERVAL_MS;
      this.tickEngine.advance();
      this.aiSystem.tick(this.tickEngine.getCurrentTick());
    }
    this.drawPaths();
    this.drawSelection();
    this.drawUnitHealthBars();
    this.updateRangeOverlay();
    this.drawTargetingReticle();
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

        this.add.image(cx, bottomY, TERRAIN_TEXTURE[territory.getTerrainType()])
          .setDisplaySize(TILE_SIZE, imgH)
          .setOrigin(0.5, 1)
          .setDepth(r);
      }
    }
  }

  private createCitySprites(): void {
    for (const city of this.gameState.getAllCities()) {
      this.createSpriteForCity(city);
    }
  }

  private createSpriteForCity(city: City): void {
    const nation = this.gameState.getNation(city.getOwnerId());
    const colorHex = nation?.getColor() ?? '#ffffff';
    const color = parseInt(colorHex.replace('#', ''), 16);
    const pos = city.position;

    const imgH = TILE_SIZE * (384 / 256);
    const cx = pos.col * TILE_SIZE + TILE_SIZE / 2;
    const bottomY = (pos.row + 1) * TILE_SIZE;

    const img = this.add.image(cx, bottomY, 'city_town')
      .setDisplaySize(TILE_SIZE, imgH)
      .setOrigin(0.5, 1)
      .setDepth(50 + pos.row);

    const dot = this.add.circle(
      pos.col * TILE_SIZE + TILE_SIZE - 5,
      pos.row * TILE_SIZE + 5,
      5,
      color,
    ).setDepth(51 + pos.row);
    this.cityDots.set(city.id, dot);

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

    const circle = this.add.circle(cx, cy, TILE_SIZE * 0.35, color)
      .setStrokeStyle(2, 0xffffff, 0.8)
      .setDepth(300 + pos.row);

    const label = this.add.text(cx, cy, unitInitial(unit), {
      fontSize: '11px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(400 + pos.row);

    this.unitSprites.set(unit.id, circle);
    this.unitLabels.set(unit.id, label);
    this.unitColors.set(unit.id, color);
  }

  private moveSpriteTo(unitId: string, coords: GridCoordinates): void {
    const circle = this.unitSprites.get(unitId);
    const label = this.unitLabels.get(unitId);
    if (!circle || !label) return;

    const cx = coords.col * TILE_SIZE + TILE_SIZE / 2;
    const cy = coords.row * TILE_SIZE + TILE_SIZE / 2;
    circle.setPosition(cx, cy).setDepth(300 + coords.row);
    label.setPosition(cx, cy).setDepth(400 + coords.row);
  }

  private removeUnitSprite(unitId: string): void {
    this.unitSprites.get(unitId)?.destroy();
    this.unitLabels.get(unitId)?.destroy();
    this.unitSprites.delete(unitId);
    this.unitLabels.delete(unitId);
    this.unitColors.delete(unitId);
    if (this.targetingUnitId === unitId) this.targetingUnitId = null;
  }

  private drawPaths(): void {
    this.pathGraphic.clear();

    for (const [unitId, state] of this.movementSystem.getAllStates()) {
      if (state.path.length === 0) continue;

      const unit = this.gameState.getUnit(unitId);
      if (!unit) continue;

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

    const unitsByTile = new Map<string, Unit[]>();
    for (const unit of this.gameState.getAllUnits()) {
      if (!unit.isAlive()) continue;
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
        const ratio = maxHealth > 0 ? unit.getHealth() / maxHealth : 0;

        const barWidth = 24;
        const barHeight = 4;
        const x = unit.position.col * TILE_SIZE + TILE_SIZE / 2 - barWidth / 2;
        const y = unit.position.row * TILE_SIZE - 10 - index * 7;

        this.healthBarGraphic.fillStyle(0x000000, 1);
        this.healthBarGraphic.fillRect(x, y, barWidth, barHeight);

        this.healthBarGraphic.fillStyle(teamColor, 1);
        this.healthBarGraphic.fillRect(x, y, Math.max(0, Math.round(barWidth * ratio)), barHeight);

        this.healthBarGraphic.lineStyle(1, 0x000000, 1);
        this.healthBarGraphic.strokeRect(x, y, barWidth, barHeight);
      });
    }
  }

  private handleLeftClick(worldX: number, worldY: number): void {
    if (this.uiClickConsumed) { this.uiClickConsumed = false; return; }
    const col = Math.floor(worldX / TILE_SIZE);
    const row = Math.floor(worldY / TILE_SIZE);
    const target = { row, col };

    if (!this.gameState.getGrid().isValidCoordinate(target)) return;

    // ── Ranged target-selection mode ─────────────────────────────────────────
    if (this.targetingUnitId) {
      const localPlayer = this.gameState.getLocalPlayer();
      const localNation = localPlayer
        ? this.gameState.getNation(localPlayer.getControlledNationId())
        : null;
      const clickedEnemy = this.getUnitAt(target);
      if (clickedEnemy && localNation && clickedEnemy.getOwnerId() !== localNation.getId()) {
        this.commandProcessor.dispatch({
          type:         'SET_RANGED_TARGET',
          playerId:     localPlayer!.getId(),
          unitId:       this.targetingUnitId,
          targetId:     clickedEnemy.id,
          issuedAtTick: 0,
        });
      }
      // Any click ends targeting mode (confirmed or cancelled)
      this.targetingUnitId = null;
      return;
    }

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

    // ── 1. Clicking any own unit always selects it (even while another is selected)
    const clickedUnit = this.getUnitAt(target);
    if (clickedUnit && localNationId && clickedUnit.getOwnerId() === localNationId) {
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
          this.scene.stop('TerritoryMenuScene');
          this.scene.stop('CityMenuScene');
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
      this.commandProcessor.dispatch({
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
    this.scene.launch('WarConfirmScene', {
      nationNames: neutralsHit.map(id => this.gameState.getNation(id)?.getName() ?? id),
      onConfirm:   dispatchMove,
    });
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
      // Enemy units on tiles along the path
      for (const u of this.gameState.getAllUnits()) {
        if (u.position.row === pos.row && u.position.col === pos.col &&
            u.getOwnerId() !== localNationId &&
            localNation.getRelation(u.getOwnerId()) === DiplomaticStatus.NEUTRAL) {
          found.add(u.getOwnerId());
        }
      }
    }

    // City at destination
    const dest = path[path.length - 1];
    if (dest) {
      const city = this.getCityAt(dest);
      if (city && city.getOwnerId() !== localNationId &&
          localNation.getRelation(city.getOwnerId()) === DiplomaticStatus.NEUTRAL) {
        found.add(city.getOwnerId());
      }
    }

    return Array.from(found);
  }

  private handleRightClick(): void {
    if (!this.selectedUnitId && !this.selectedCityId && !this.selectedTerritory) return;
    this.clearSelection();
  }

  private selectUnit(unit: Unit): void {
    this.selectedUnitId = unit.id;
    this.selectedCityId = null;
    this.selectedTerritory = null;
    this.scene.stop('CityMenuScene');
    this.scene.stop('TerritoryMenuScene');
    this.updateUISelection(unit);
    this.eventBus.emit('city:selected', { city: null });
    this.drawRangeOverlay(unit);
  }

  private selectCity(city: City): void {
    this.selectedCityId = city.id;
    this.selectedUnitId = null;
    this.selectedTerritory = null;
    this.scene.stop('TerritoryMenuScene');
    this.scene.stop('CityMenuScene');
    this.updateUISelection(undefined);
    this.scene.launch('CityMenuScene', {
      city,
      gameState: this.gameState,
      commandProcessor: this.commandProcessor,
      eventBus: this.eventBus,
    });
  }

  private selectTerritory(position: GridCoordinates): void {
    this.selectedTerritory = { ...position };
    this.selectedUnitId = null;
    this.selectedCityId = null;
    this.scene.stop('CityMenuScene');
    this.scene.stop('TerritoryMenuScene');
    this.updateUISelection(undefined);
    this.scene.launch('TerritoryMenuScene', {
      position,
      gameState: this.gameState,
      commandProcessor: this.commandProcessor,
      eventBus: this.eventBus,
    });
  }

  /** Single-click: highlight the city tile without opening the menu. */
  private highlightCity(city: City): void {
    this.selectedCityId = city.id;
    this.selectedUnitId = null;
    this.selectedTerritory = null;
    this.scene.stop('TerritoryMenuScene');
    this.scene.stop('CityMenuScene');
    this.updateUISelection(undefined);
    this.eventBus.emit('city:selected', { city });
    this.rangeGraphic.clear();
  }

  /** Single-click: highlight the territory tile without opening the menu. */
  private highlightTerritory(position: GridCoordinates): void {
    this.selectedTerritory = { ...position };
    this.selectedUnitId = null;
    this.selectedCityId = null;
    this.scene.stop('CityMenuScene');
    this.scene.stop('TerritoryMenuScene');
    this.updateUISelection(undefined);
    this.eventBus.emit('city:selected', { city: null });
    this.rangeGraphic.clear();
  }

  private openDiplomacy(targetNationId: string): void {
    this.scene.stop('CityMenuScene');
    this.scene.stop('TerritoryMenuScene');
    this.scene.stop('DiplomacyScene');
    this.scene.launch('DiplomacyScene', {
      targetNationId,
      gameState:        this.gameState,
      commandProcessor: this.commandProcessor,
      diplomacySystem:  this.diplomacySystem,
      eventBus:         this.eventBus,
      currentTick:      this.tickEngine.getCurrentTick(),
    });
  }

  private clearSelection(): void {
    this.selectedUnitId = null;
    this.selectedCityId = null;
    this.selectedTerritory = null;
    this.scene.stop('CityMenuScene');
    this.scene.stop('TerritoryMenuScene');
    this.updateUISelection(undefined);
    this.eventBus.emit('city:selected', { city: null });
    this.rangeGraphic.clear();
  }

  private drawTerritoryBorders(): void {
    this.territoryGraphic.clear();
    const grid = this.gameState.getGrid();
    const { rows, cols } = grid.getSize();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const territory = grid.getTerritory({ row: r, col: c });
        if (!territory) continue;

        const ownerId = territory.getControllingNation();
        if (!ownerId) continue;

        const nation = this.gameState.getNation(ownerId);
        if (!nation) continue;

        const color = parseInt(nation.getColor().replace('#', ''), 16);

        this.territoryGraphic.fillStyle(color, 0.12);
        this.territoryGraphic.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);

        this.territoryGraphic.lineStyle(2, color, 0.9);
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
    const imgH = TILE_SIZE * (384 / 256);
    for (let r = -WATER_BORDER; r < GRID_SIZE + WATER_BORDER; r++) {
      for (let c = -WATER_BORDER; c < GRID_SIZE + WATER_BORDER; c++) {
        if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) continue;
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
    const totalSize = (GRID_SIZE + WATER_BORDER * 2) * TILE_SIZE;
    this.minZoom = Math.max(0.15, Math.min(
      this.scale.width  / totalSize,
      this.scale.height / totalSize,
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

  /** Draw a pulsing red reticle around the targeting unit while in target-selection mode. */
  private drawTargetingReticle(): void {
    this.targetingGraphic.clear();
    if (!this.targetingUnitId) return;

    const unit = this.gameState.getUnit(this.targetingUnitId);
    if (!unit) { this.targetingUnitId = null; return; }

    const cx = unit.position.col * TILE_SIZE + TILE_SIZE / 2;
    const cy = unit.position.row * TILE_SIZE + TILE_SIZE / 2;
    const r  = TILE_SIZE * 0.42;
    const pulse = 0.55 + 0.45 * Math.sin(this.time.now / 220);
    this.targetingGraphic.lineStyle(2, 0xff3322, pulse);
    this.targetingGraphic.strokeCircle(cx, cy, r);
    // Four cardinal tick marks
    const tick = TILE_SIZE * 0.15;
    this.targetingGraphic.lineStyle(2, 0xff5544, pulse);
    this.targetingGraphic.lineBetween(cx, cy - r - 1, cx, cy - r - tick);
    this.targetingGraphic.lineBetween(cx, cy + r + 1, cx, cy + r + tick);
    this.targetingGraphic.lineBetween(cx - r - 1, cy, cx - r - tick, cy);
    this.targetingGraphic.lineBetween(cx + r + 1, cy, cx + r + tick, cy);
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

      const order = unit.getBattleOrder();
      const morale = unit.getMorale();
      const effective = morale <= 10 ? 'RETREAT' : (morale <= 30 && (order === 'ADVANCE' || order === 'CHARGE')) ? 'HOLD' : order;
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

function unitInitial(unit: Unit): string {
  switch (unit.getUnitType()) {
    case 'INFANTRY': return 'I';
    case 'SCOUT': return 'S';
    case 'HEAVY_INFANTRY': return 'H';
    case 'CAVALRY': return 'C';
    case 'LONGBOWMAN': return 'L';
    case 'CROSSBOWMAN': return 'X';
    case 'CATAPULT': return 'K';
    case 'TREBUCHET': return 'T';
    default: return '?';
  }
}

function stanceShortLabel(order: BattleOrder): string {
  switch (order) {
    case 'RETREAT':   return 'RETREAT';
    case 'FALL_BACK': return 'FALL BACK';
    case 'HOLD':      return 'HOLD';
    case 'ADVANCE':   return 'ADVANCE';
    case 'CHARGE':    return 'CHARGE';
  }
}

function stanceBadgeColor(order: BattleOrder): string {
  switch (order) {
    case 'RETREAT':   return '#ff5533';
    case 'FALL_BACK': return '#ffaa44';
    case 'HOLD':      return '#aaaacc';
    case 'ADVANCE':   return '#44ddff';
    case 'CHARGE':    return '#ff4488';
  }
}
