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
import { TerrainType } from '@/systems/grid/Territory';
import { TILE_SIZE, TICK_INTERVAL_MS } from '@/config/constants';
import type { GameSetup, GameSaveData } from '@/types/gameSetup';
import type { GridCoordinates } from '@/types/common';
import type { Unit } from '@/entities/units/Unit';
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
  private citySprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private cityLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private selectionGraphic!: Phaser.GameObjects.Graphics;
  private pathGraphic!: Phaser.GameObjects.Graphics;
  private territoryGraphic!: Phaser.GameObjects.Graphics;
  private healthBarGraphic!: Phaser.GameObjects.Graphics;

  private selectedUnitId: string | null = null;
  private selectedCityId: string | null = null;
  private selectedTerritory: GridCoordinates | null = null;
  private tickAccumulator = 0;

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
    this.citySprites.clear();
    this.cityLabels.clear();
    this.selectedUnitId = null;
    this.selectedCityId = null;
    this.selectedTerritory = null;
    this.tickAccumulator = 0;

    this.movementSystem = new MovementSystem();
    this.pathfinder = new Pathfinder(this.gameState.getGrid());
    this.eventBus = new GameEventBus();
    this.tickEngine = new TickEngine(this.gameState, this.movementSystem, this.eventBus);
    this.commandProcessor = new CommandProcessor(this.gameState, this.movementSystem, this.eventBus);

    const sceneData = this.scene.settings.data as GameSceneData;
    if (sceneData.saveData) {
      this.tickEngine.setTick(sceneData.saveData.currentTick);
      this.movementSystem.restoreStates(sceneData.saveData.movementStates);
      this.tickEngine.restoreBattleStates(sceneData.saveData.battleStates ?? []);
    }

    this.drawGrid();

    this.territoryGraphic = this.add.graphics().setDepth(28);
    this.pathGraphic = this.add.graphics().setDepth(100);
    this.selectionGraphic = this.add.graphics().setDepth(200);
    this.healthBarGraphic = this.add.graphics().setDepth(500);

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

    this.eventBus.on('territory:claimed', () => this.drawTerritoryBorders());
    this.eventBus.on('territory:building-built', () => this.drawTerritoryBorders());

    this.cameras.main.setBounds(0, 0, 25 * TILE_SIZE, 25 * TILE_SIZE);

    this.setupMouseControls();

    this.input.keyboard!.on('keydown-ESC', () => {
      this.scene.launch('PauseScene', {
        gameState: this.gameState,
        tickEngine: this.tickEngine,
        movementSystem: this.movementSystem,
        setup: this.setup,
      });
    });

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
    }
    this.drawPaths();
    this.drawSelection();
    this.drawUnitHealthBars();
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
        0.35,
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

    this.add.circle(
      pos.col * TILE_SIZE + TILE_SIZE - 5,
      pos.row * TILE_SIZE + 5,
      5,
      color,
    ).setDepth(51 + pos.row);

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
    const col = Math.floor(worldX / TILE_SIZE);
    const row = Math.floor(worldY / TILE_SIZE);
    const target = { row, col };

    if (!this.gameState.getGrid().isValidCoordinate(target)) return;

    const localPlayer = this.gameState.getLocalPlayer();
    const localNation = localPlayer
      ? this.gameState.getNation(localPlayer.getControlledNationId())
      : null;

    const clickedUnit = this.getUnitAt(target);
    if (clickedUnit && localNation && clickedUnit.getOwnerId() === localNation.getId()) {
      this.selectUnit(clickedUnit);
      return;
    }

    const clickedCity = this.getCityAt(target);
    if (clickedCity && localNation && clickedCity.getOwnerId() === localNation.getId()) {
      this.selectCity(clickedCity);
      return;
    }

    if (this.selectedUnitId) {
      const unit = this.gameState.getUnit(this.selectedUnitId);
      if (!unit || !localPlayer) return;

      const path = this.pathfinder.findPath(
        unit.position,
        target,
        unit.getUnitType(),
        unit.getStats(),
      );

      if (path && path.length > 0) {
        this.commandProcessor.dispatch({
          type: 'MOVE_UNIT',
          playerId: localPlayer.getId(),
          unitId: this.selectedUnitId,
          path,
          issuedAtTick: this.tickEngine.getCurrentTick(),
        });
      }
      return;
    }

    const clickedTerritory = this.gameState.getGrid().getTerritory(target);
    if (clickedTerritory) {
      void clickedTerritory;
      this.selectTerritory(target);
    }
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

  private clearSelection(): void {
    this.selectedUnitId = null;
    this.selectedCityId = null;
    this.selectedTerritory = null;
    this.scene.stop('CityMenuScene');
    this.scene.stop('TerritoryMenuScene');
    this.updateUISelection(undefined);
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
