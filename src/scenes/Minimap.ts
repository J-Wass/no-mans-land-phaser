/**
 * Minimap — a fixed, top-right overview rendered on the HUD (UIScene).
 *
 * Lives on UIScene rather than GameScene so it isn't scaled when the player
 * zooms the world camera. Shows discovered terrain, territory ownership,
 * discovered cities, the local player's units, and the current camera viewport.
 * Clicking recenters the world camera. Fog is respected via the local nation's
 * discovered-tiles set, so it never reveals unexplored map.
 */

import Phaser from 'phaser';
import type { GameState } from '@/managers/GameState';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import { TerrainType } from '@/systems/grid/Territory';
import { TILE_SIZE } from '@/config/constants';
import { coordsToKey } from '@/systems/grid/Grid';

const TERRAIN_COLOR: Record<TerrainType, number> = {
  [TerrainType.PLAINS]:      0x6b8f3a,
  [TerrainType.SNOW_FOREST]: 0xc2cdd8,
  [TerrainType.FOREST]:      0x2f5d2f,
  [TerrainType.MOUNTAIN]:    0x6f6f6f,
  [TerrainType.WATER]:       0x24416b,
  [TerrainType.DESERT]:      0xc9b069,
};
const FOG_COLOR = 0x05070d;
/** Redraw the (slowly-changing) terrain/ownership layer every N frames. */
const BASE_REDRAW_INTERVAL = 12;

export class Minimap {
  private base: Phaser.GameObjects.Graphics;
  private dyn: Phaser.GameObjects.Graphics;
  private frameEl: Phaser.GameObjects.Rectangle;
  private hitZone: Phaser.GameObjects.Rectangle;

  private rows: number;
  private cols: number;
  private frame = 0;
  private originX = 0;
  private originY = 0;
  private mapW = 0;
  private mapH = 0;
  private cell = 2;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly gameState: GameState,
    private readonly eventBus: GameEventBus,
    depth = 5000,
  ) {
    const size = gameState.getGrid().getSize();
    this.rows = size.rows;
    this.cols = size.cols;

    this.frameEl = scene.add.rectangle(0, 0, 10, 10, 0x0a0f1c, 0.85)
      .setScrollFactor(0).setOrigin(0, 0).setDepth(depth).setStrokeStyle(1, 0x3355bb);
    this.base = scene.add.graphics().setScrollFactor(0).setDepth(depth + 1);
    this.dyn = scene.add.graphics().setScrollFactor(0).setDepth(depth + 2);
    this.hitZone = scene.add.rectangle(0, 0, 10, 10, 0x000000, 0.001)
      .setScrollFactor(0).setOrigin(0, 0).setDepth(depth + 3)
      .setInteractive({ useHandCursor: true });
    this.hitZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // Stop GameScene from also treating this as a world click.
      this.eventBus.emit('ui:click-consumed', {});
      this.recenterCamera(p.x, p.y);
    });

    this.layout();
  }

  /**
   * Recompute size/position (call on resize).
   * `topOffset` is the y where the minimap should start — pass the bottom of the HUD
   * top bar so the minimap doesn't sit on top of the resource row when the bar is tall.
   */
  layout(topOffset = 58): void {
    const sw = this.scene.scale.width;
    const pad = 10;
    this.mapW = Math.min(190, Math.max(120, Math.round(sw * 0.2)));
    this.cell = this.mapW / this.cols;
    this.mapH = this.cell * this.rows;
    this.originX = sw - this.mapW - pad;
    this.originY = topOffset;

    this.frameEl.setPosition(this.originX - 2, this.originY - 2).setSize(this.mapW + 4, this.mapH + 4);
    this.hitZone.setPosition(this.originX, this.originY).setSize(this.mapW, this.mapH);
    this.drawBase();
  }

  /** Called every frame from UIScene.update(). */
  update(): void {
    this.frame++;
    if (this.frame % BASE_REDRAW_INTERVAL === 0) this.drawBase();
    this.drawDynamic();
  }

  private localNationId(): string | null {
    return this.gameState.getLocalPlayer()?.getControlledNationId() ?? null;
  }

  private discovered(): Set<string> {
    const id = this.localNationId();
    return id ? this.gameState.getDiscoveredTiles(id) : new Set();
  }

  private drawBase(): void {
    const g = this.base;
    g.clear();
    const grid = this.gameState.getGrid();
    const discovered = this.discovered();

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = this.originX + c * this.cell;
        const y = this.originY + r * this.cell;
        const key = coordsToKey({ row: r, col: c });
        if (!discovered.has(key)) {
          g.fillStyle(FOG_COLOR, 1);
          g.fillRect(x, y, this.cell + 0.5, this.cell + 0.5);
          continue;
        }
        const territory = grid.getTerritory({ row: r, col: c });
        if (!territory) continue;
        g.fillStyle(TERRAIN_COLOR[territory.getTerrainType()], 1);
        g.fillRect(x, y, this.cell + 0.5, this.cell + 0.5);

        const owner = territory.getControllingNation();
        if (owner) {
          const nation = this.gameState.getNation(owner);
          if (nation) {
            g.fillStyle(parseInt(nation.getColor().replace('#', ''), 16), 0.45);
            g.fillRect(x, y, this.cell + 0.5, this.cell + 0.5);
          }
        }
      }
    }
  }

  private drawDynamic(): void {
    const g = this.dyn;
    g.clear();
    const discovered = this.discovered();
    const localId = this.localNationId();
    const dot = Math.max(2, Math.round(this.cell * 1.4));

    // Cities on discovered tiles, colored by owner.
    for (const city of this.gameState.getAllCities()) {
      const pos = city.position;
      const key = coordsToKey(pos);
      if (city.getOwnerId() !== localId && !discovered.has(key)) continue;
      const nation = this.gameState.getNation(city.getOwnerId());
      const color = nation ? parseInt(nation.getColor().replace('#', ''), 16) : 0xffffff;
      const x = this.originX + pos.col * this.cell;
      const y = this.originY + pos.row * this.cell;
      g.fillStyle(0x000000, 0.9);
      g.fillRect(x - 1, y - 1, dot + 2, dot + 2);
      g.fillStyle(color, 1);
      g.fillRect(x, y, dot, dot);
    }

    // The local player's units only (showing enemies would leak through fog).
    if (localId) {
      const nation = this.gameState.getNation(localId);
      const color = nation ? parseInt(nation.getColor().replace('#', ''), 16) : 0xffffff;
      for (const unit of this.gameState.getUnitsByNation(localId)) {
        if (!unit.isAlive()) continue;
        const x = this.originX + unit.position.col * this.cell;
        const y = this.originY + unit.position.row * this.cell;
        g.fillStyle(0xffffff, 1);
        g.fillRect(x, y, Math.max(1.5, this.cell), Math.max(1.5, this.cell));
        g.fillStyle(color, 1);
        g.fillRect(x + 0.5, y + 0.5, Math.max(1, this.cell - 1), Math.max(1, this.cell - 1));
      }
    }

    // Camera viewport rectangle.
    const cam = this.gameCamera();
    if (cam) {
      const worldW = this.cols * TILE_SIZE;
      const worldH = this.rows * TILE_SIZE;
      const view = cam.worldView;
      const vx = this.originX + Phaser.Math.Clamp(view.x / worldW, 0, 1) * this.mapW;
      const vy = this.originY + Phaser.Math.Clamp(view.y / worldH, 0, 1) * this.mapH;
      const vw = Phaser.Math.Clamp(view.width / worldW, 0, 1) * this.mapW;
      const vh = Phaser.Math.Clamp(view.height / worldH, 0, 1) * this.mapH;
      g.lineStyle(1, 0xffffff, 0.9);
      g.strokeRect(vx, vy, Math.min(vw, this.mapW), Math.min(vh, this.mapH));
    }
  }

  private gameCamera(): Phaser.Cameras.Scene2D.Camera | null {
    const gameScene = this.scene.scene.get('GameScene');
    return gameScene?.cameras?.main ?? null;
  }

  private recenterCamera(screenX: number, screenY: number): void {
    const cam = this.gameCamera();
    if (!cam) return;
    const localX = Phaser.Math.Clamp((screenX - this.originX) / this.mapW, 0, 1);
    const localY = Phaser.Math.Clamp((screenY - this.originY) / this.mapH, 0, 1);
    cam.centerOn(localX * this.cols * TILE_SIZE, localY * this.rows * TILE_SIZE);
  }

  destroy(): void {
    this.frameEl.destroy();
    this.base.destroy();
    this.dyn.destroy();
    this.hitZone.destroy();
  }
}
