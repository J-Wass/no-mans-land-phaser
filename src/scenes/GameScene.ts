/**
 * GameScene — main game loop scene.
 * Renders the grid and units; drives the tick engine; handles click-to-move.
 */

import Phaser from 'phaser';
import { GameState } from '@/managers/GameState';
import { MovementSystem } from '@/systems/movement/MovementSystem';
import { Pathfinder } from '@/systems/pathfinding/Pathfinder';
import { TickEngine } from '@/systems/tick/TickEngine';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { CommandProcessor } from '@/commands/CommandProcessor';
import { TerrainType } from '@/systems/grid/Territory';
import { TILE_SIZE, TICK_INTERVAL_MS } from '@/config/constants';
import type { GameSetup, GameSaveData } from '@/types/gameSetup';
import type { GridCoordinates } from '@/types/common';
import type { Unit } from '@/entities/units/Unit';
import type { City } from '@/entities/cities/City';

interface GameSceneData {
  // Fresh game from BootScene
  gameState?: GameState;
  setup?: GameSetup;
  // Loaded from a save (GameState.fromJSON already applied in PauseScene/MenuScene)
  saveData?: GameSaveData;
}

const TERRAIN_TEXTURE: Record<TerrainType, string> = {
  [TerrainType.PLAINS]:   'terrain_plains',
  [TerrainType.HILLS]:    'terrain_hills',
  [TerrainType.FOREST]:   'terrain_forest',
  [TerrainType.MOUNTAIN]: 'terrain_mountain',
  [TerrainType.WATER]:    'terrain_water',
  [TerrainType.DESERT]:   'terrain_desert',
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
  private citySprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private cityLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private selectionGraphic!: Phaser.GameObjects.Graphics;
  private pathGraphic!: Phaser.GameObjects.Graphics;
  private territoryGraphic!: Phaser.GameObjects.Graphics;

  private selectedUnitId: string | null = null;
  private selectedCityId: string | null = null;
  private tickAccumulator = 0;

  constructor() {
    super({ key: 'GameScene' });
  }

  preload(): void {
    this.load.image('terrain_plains',   'terrain_squares/plains.png');
    this.load.image('terrain_hills',    'terrain_squares/snowforest.png');
    this.load.image('terrain_forest',   'terrain_squares/forest.png');
    this.load.image('terrain_mountain', 'terrain_squares/mountains.png');
    this.load.image('terrain_water',    'terrain_squares/ocean.png');
    this.load.image('terrain_desert',   'terrain_squares/desert.png');
    this.load.image('city_town',        'terrain_squares/town.png');
  }

  init(data: GameSceneData): void {
    // Support both fresh-game and load-from-save paths
    if (data.saveData) {
      const sd = data.saveData;
      this.gameState = GameState.fromJSON(sd.state as ReturnType<GameState['toJSON']>);
      this.setup     = sd.setup;
      // movementStates and currentTick are applied in create() after systems are built
    } else {
      this.gameState = data.gameState!;
      this.setup     = data.setup ?? { opponentCount: 1, difficulty: 'medium' };
    }
  }

  create(): void {
    // Reset per-scene state from previous session
    this.unitSprites.clear();
    this.unitLabels.clear();
    this.citySprites.clear();
    this.cityLabels.clear();
    this.selectedUnitId  = null;
    this.selectedCityId  = null;
    this.tickAccumulator = 0;

    this.movementSystem  = new MovementSystem();
    this.pathfinder      = new Pathfinder(this.gameState.getGrid());
    this.eventBus        = new GameEventBus();
    this.tickEngine      = new TickEngine(this.gameState, this.movementSystem, this.eventBus);
    this.commandProcessor = new CommandProcessor(this.gameState, this.movementSystem, this.eventBus);

    // If we came from a save, restore tick and movement
    const sceneData = this.scene.settings.data as GameSceneData;
    if (sceneData.saveData) {
      this.tickEngine.setTick(sceneData.saveData.currentTick);
      this.movementSystem.restoreStates(sceneData.saveData.movementStates);
    }

    this.drawGrid();

    // Depth layers: tiles 0-24 → territory fill 25 → territory borders 28
    //               → cities 50 → paths 100 → selection 200 → units 300+row / 400+row
    this.territoryGraphic = this.add.graphics().setDepth(28);
    this.pathGraphic      = this.add.graphics().setDepth(100);
    this.selectionGraphic = this.add.graphics().setDepth(200);

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

    this.eventBus.on('territory:claimed',       () => this.drawTerritoryBorders());
    this.eventBus.on('territory:building-built',() => this.drawTerritoryBorders());

    // ── Camera bounds ─────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, 25 * TILE_SIZE, 25 * TILE_SIZE);

    // ── Input: pan + pinch-zoom + tap/click ───────────────────────────────
    // Supports mouse drag, touch pan, two-finger pinch zoom, and scroll wheel.
    // A tap/click fires only when the pointer didn't travel past PAN_THRESHOLD.
    this.input.addPointer(1); // enable a second touch pointer for pinch

    const PAN_THRESHOLD = 6;
    let activePanPtr: Phaser.Input.Pointer | null = null;
    let panStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
    let hasPanned = false;
    let lastPinchDist = 0;

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (activePanPtr) return; // already tracking a pointer
      if (ptr !== this.input.mousePointer && ptr !== this.input.pointer1) return;
      activePanPtr = ptr;
      const cam = this.cameras.main;
      panStart = { x: ptr.x, y: ptr.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
      hasPanned = false;
    });

    this.input.on('pointermove', () => {
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;

      // Two-finger pinch-to-zoom
      if (p1.isDown && p2.isDown) {
        const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (lastPinchDist > 0 && dist > 0) {
          const zoom = Phaser.Math.Clamp(
            this.cameras.main.zoom * (dist / lastPinchDist),
            0.35, 2.5,
          );
          this.cameras.main.setZoom(zoom);
        }
        lastPinchDist = dist;
        activePanPtr = null;
        panStart = null; // cancel tap/pan while pinching
        return;
      }
      lastPinchDist = 0;

      // Single-pointer pan
      if (!activePanPtr || !panStart || !activePanPtr.isDown) return;
      const dx = activePanPtr.x - panStart.x;
      const dy = activePanPtr.y - panStart.y;
      if (!hasPanned && Math.hypot(dx, dy) > PAN_THRESHOLD) hasPanned = true;
      if (hasPanned) {
        const cam = this.cameras.main;
        cam.setScroll(
          panStart.scrollX - dx / cam.zoom,
          panStart.scrollY - dy / cam.zoom,
        );
      }
    });

    this.input.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      lastPinchDist = 0;
      if (ptr !== activePanPtr) return;
      const wasPan = hasPanned;
      activePanPtr = null;
      panStart = null;
      hasPanned = false;
      if (!wasPan) this.handleClick(ptr.worldX, ptr.worldY);
    });

    // Scroll-wheel zoom (desktop)
    this.input.on('wheel',
      (_ptr: Phaser.Input.Pointer, _gos: unknown, _dx: number, dy: number) => {
        const zoom = Phaser.Math.Clamp(
          this.cameras.main.zoom * (dy > 0 ? 0.9 : 1.1),
          0.35, 2.5,
        );
        this.cameras.main.setZoom(zoom);
      },
    );

    // ESC opens pause menu
    this.input.keyboard!.on('keydown-ESC', () => {
      this.scene.launch('PauseScene', {
        gameState:      this.gameState,
        tickEngine:     this.tickEngine,
        movementSystem: this.movementSystem,
        setup:          this.setup,
      });
    });

    this.scene.launch('UIScene', {
      setup:            this.setup,
      gameState:        this.gameState,
      commandProcessor: this.commandProcessor,
      eventBus:         this.eventBus,
    });
  }

  override update(_time: number, delta: number): void {
    this.tickAccumulator += delta;
    while (this.tickAccumulator >= TICK_INTERVAL_MS) {
      this.tickAccumulator -= TICK_INTERVAL_MS;
      this.tickEngine.advance();
    }
    this.drawPaths();
    this.drawSelection();
  }

  private drawGrid(): void {
    const grid = this.gameState.getGrid();
    const { rows, cols } = grid.getSize();

    // Each PNG is 256×384: bottom 256×256 is the tile face,
    // top 256×128 is decoration that overhangs the row above.
    // Anchor at bottom-center so the tile face aligns to the grid cell,
    // and the decoration extends upward into the row above.
    // Depth = row index so lower rows render on top of upper rows' decorations.
    const imgH = TILE_SIZE * (384 / 256); // 60px at TILE_SIZE=40

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const territory = grid.getTerritory({ row: r, col: c });
        if (!territory) continue;

        const terrain = territory.getTerrainType();
        const cx = c * TILE_SIZE + TILE_SIZE / 2;
        const bottomY = (r + 1) * TILE_SIZE; // bottom edge of cell

        this.add.image(cx, bottomY, TERRAIN_TEXTURE[terrain])
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
    const nation   = this.gameState.getNation(city.getOwnerId());
    const colorHex = nation?.getColor() ?? '#ffffff';
    const color    = parseInt(colorHex.replace('#', ''), 16);
    const pos      = city.position;

    // Same render technique as terrain tiles: bottom-anchored, 256×384 proportions.
    // Depth 50+row puts cities above terrain (0–24) but below paths (100).
    const imgH   = TILE_SIZE * (384 / 256); // 60px
    const cx     = pos.col * TILE_SIZE + TILE_SIZE / 2;
    const bottomY = (pos.row + 1) * TILE_SIZE;

    const img = this.add.image(cx, bottomY, 'city_town')
      .setDisplaySize(TILE_SIZE, imgH)
      .setOrigin(0.5, 1)
      .setDepth(50 + pos.row);

    // Small nation-color dot in top-right corner to show ownership
    this.add.circle(
      pos.col * TILE_SIZE + TILE_SIZE - 5,
      pos.row * TILE_SIZE + 5,
      5, color
    ).setDepth(51 + pos.row);

    // City name label, small text below the building (top of next tile row)
    const label = this.add.text(cx, pos.row * TILE_SIZE + 2, city.getName(), {
      fontSize: '8px', color: '#ffffff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2,
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
  }

  private moveSpriteTo(unitId: string, coords: GridCoordinates): void {
    const circle = this.unitSprites.get(unitId);
    const label  = this.unitLabels.get(unitId);
    if (!circle || !label) return;
    const cx = coords.col * TILE_SIZE + TILE_SIZE / 2;
    const cy = coords.row * TILE_SIZE + TILE_SIZE / 2;
    circle.setPosition(cx, cy).setDepth(300 + coords.row);
    label.setPosition(cx, cy).setDepth(400 + coords.row);
  }

  /** Draw movement paths for all units currently in motion. */
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
          pos.col * TILE_SIZE + 1, pos.row * TILE_SIZE + 1,
          TILE_SIZE - 2, TILE_SIZE - 2
        );
      }
    }

    if (this.selectedCityId) {
      const city = this.gameState.getCity(this.selectedCityId);
      if (city) {
        const pos = city.position;
        this.selectionGraphic.lineStyle(2, 0x88aaff, 1);
        this.selectionGraphic.strokeRect(
          pos.col * TILE_SIZE + 1, pos.row * TILE_SIZE + 1,
          TILE_SIZE - 2, TILE_SIZE - 2
        );
      }
    }
  }

  private handleClick(worldX: number, worldY: number): void {
    const col = Math.floor(worldX / TILE_SIZE);
    const row = Math.floor(worldY / TILE_SIZE);

    if (!this.gameState.getGrid().isValidCoordinate({ row, col })) return;

    const localPlayer = this.gameState.getLocalPlayer();
    const localNation = localPlayer
      ? this.gameState.getNation(localPlayer.getControlledNationId())
      : null;

    // Priority 1: click on a friendly unit → select it
    const clickedUnit = this.getUnitAt({ row, col });
    if (clickedUnit && localNation && clickedUnit.getOwnerId() === localNation.getId()) {
      this.selectedUnitId = clickedUnit.id;
      this.selectedCityId = null;
      this.updateUISelection(clickedUnit);
      return;
    }

    // Priority 2: click on a friendly city → open city menu
    const clickedCity = this.getCityAt({ row, col });
    if (clickedCity && localNation && clickedCity.getOwnerId() === localNation.getId()) {
      this.selectedCityId = clickedCity.id;
      this.selectedUnitId = null;
      this.updateUISelection(undefined);
      this.scene.launch('CityMenuScene', {
        city: clickedCity, gameState: this.gameState,
        commandProcessor: this.commandProcessor, eventBus: this.eventBus,
      });
      return;
    }

    // Priority 3: move selected unit to clicked tile (takes priority over territory menu)
    if (this.selectedUnitId) {
      const unit = this.gameState.getUnit(this.selectedUnitId);
      if (!unit || !localPlayer) return;

      const path = this.pathfinder.findPath(
        unit.position,
        { row, col },
        unit.getUnitType(),
        unit.getStats()
      );

      if (path && path.length > 0) {
        this.commandProcessor.dispatch({
          type:         'MOVE_UNIT',
          playerId:     localPlayer.getId(),
          unitId:       this.selectedUnitId,
          path,
          issuedAtTick: this.tickEngine.getCurrentTick(),
        });
      }
      return;
    }

    // Priority 4: click on any territory (owned or not) → territory menu
    const clickedTerritory = this.gameState.getGrid().getTerritory({ row, col });
    if (clickedTerritory) {
      this.scene.launch('TerritoryMenuScene', {
        position: { row, col },
        gameState: this.gameState,
        commandProcessor: this.commandProcessor,
        eventBus: this.eventBus,
      });
      return;
    }

  }

  /** Draw colored borders around all nationally-controlled territories. */
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

        // Tinted fill to show ownership
        this.territoryGraphic.fillStyle(color, 0.12);
        this.territoryGraphic.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);

        // Border on each edge that touches a different owner or unowned tile
        this.territoryGraphic.lineStyle(2, color, 0.9);
        const neighbors: Array<{ dr: number; dc: number; x1: number; y1: number; x2: number; y2: number }> = [
          { dr: -1, dc:  0, x1: c * TILE_SIZE,            y1: r * TILE_SIZE,            x2: (c + 1) * TILE_SIZE, y2: r * TILE_SIZE            }, // N
          { dr:  1, dc:  0, x1: c * TILE_SIZE,            y1: (r + 1) * TILE_SIZE,      x2: (c + 1) * TILE_SIZE, y2: (r + 1) * TILE_SIZE      }, // S
          { dr:  0, dc: -1, x1: c * TILE_SIZE,            y1: r * TILE_SIZE,            x2: c * TILE_SIZE,        y2: (r + 1) * TILE_SIZE      }, // W
          { dr:  0, dc:  1, x1: (c + 1) * TILE_SIZE,     y1: r * TILE_SIZE,            x2: (c + 1) * TILE_SIZE,  y2: (r + 1) * TILE_SIZE      }, // E
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

  private updateUISelection(unit: Unit | undefined): void {
    this.eventBus.emit('unit:selected', { unit: unit ?? null });
  }
}

function unitInitial(unit: Unit): string {
  switch (unit.getUnitType()) {
    case 'INFANTRY':       return 'I';
    case 'SCOUT':          return 'S';
    case 'HEAVY_INFANTRY': return 'H';
    case 'CAVALRY':        return 'C';
    case 'LONGBOWMAN':     return 'L';
    case 'CROSSBOWMAN':    return 'X';
    case 'CATAPULT':       return 'K';
    case 'TREBUCHET':      return 'T';
    default:               return '?';
  }
}
