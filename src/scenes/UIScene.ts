/**
 * UIScene — full-screen HUD overlay, rendered on top of GameScene.
 *
 * Layout:
 *   Top-right bar  — tick counter, resources, RESEARCH + MENU buttons
 *   Bottom-left panel — unit detail card OR city detail card (selection-driven)
 *
 * Fully responsive: rebuilds whenever the window is resized.
 * Text sizes scale with viewport height so larger screens get larger text.
 */

import Phaser from 'phaser';
import type { Unit, BattleOrder } from '@/entities/units/Unit';
import { MORALE_LOW } from '@/entities/units/Unit';
import type { City } from '@/entities/cities/City';
import type { GameState } from '@/managers/GameState';
import type { GameSetup } from '@/types/gameSetup';
import type { CommandProcessor } from '@/commands/CommandProcessor';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import { ResourceType } from '@/systems/resources/ResourceType';
import { TerrainType } from '@/systems/grid/Territory';
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import { RESOURCE_EMOJI } from '@/scenes/CityMenuScene';

interface UISceneData {
  setup:            GameSetup;
  gameState:        GameState;
  commandProcessor: CommandProcessor;
  eventBus:         GameEventBus;
}

// ── Scale helpers ─────────────────────────────────────────────────────────────

/** Scale factor based on viewport height. Reference = 900 px. */
function uiScale(h: number): number {
  return Math.min(2.0, Math.max(0.7, h / 900));
}

/** Return a px font-size string scaled to the viewport. */
function fs(base: number, s: number): string {
  return `${Math.round(base * s)}px`;
}

const MONO: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'monospace' };

// ── Stance metadata (used by both info panel and display helpers) ──────────────
const STANCE_ORDERS: Array<{ order: BattleOrder; label: string }> = [
  { order: 'RETREAT',   label: 'RETREAT'  },
  { order: 'FALL_BACK', label: 'FALLBACK' },
  { order: 'HOLD',      label: 'HOLD' },
  { order: 'ADVANCE',   label: 'ADVANCE'  },
  { order: 'CHARGE',    label: 'CHARGE'  },
];

export class UIScene extends Phaser.Scene {
  private setup!:            GameSetup;
  private gameState!:        GameState;
  private commandProcessor!: CommandProcessor;
  private eventBus!:         GameEventBus;
  private playerId           = '';

  // ── Selection state ────────────────────────────────────────────────────────
  private selectedUnit:   Unit | null = null;
  private selectedCity:   City | null = null;

  // ── Dynamic text refs (updated every tick / frame) ─────────────────────────
  private tickText!:      Phaser.GameObjects.Text;
  private resourceText!:  Phaser.GameObjects.Text;

  // ── Info panel dynamic refs (updated in update()) ──────────────────────────
  private panelVisible    = false;
  private hpFillRect:     Phaser.GameObjects.Rectangle | null = null;
  private hpText:         Phaser.GameObjects.Text      | null = null;
  private hpBarW          = 0;
  private moraleFillRect: Phaser.GameObjects.Rectangle | null = null;
  private moraleText:     Phaser.GameObjects.Text      | null = null;
  private moraleWarnText: Phaser.GameObjects.Text      | null = null;
  private infoLineText:   Phaser.GameObjects.Text      | null = null;

  // ── All scene objects — cleared on rebuild ─────────────────────────────────
  private allObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() { super({ key: 'UIScene' }); }

  // ── Init / create ──────────────────────────────────────────────────────────

  init(data: UISceneData): void {
    this.setup            = data.setup;
    this.gameState        = data.gameState;
    this.commandProcessor = data.commandProcessor;
    this.eventBus         = data.eventBus;
    this.playerId         = this.gameState.getLocalPlayer()?.getId() ?? '';
  }

  create(): void {
    this.setupEventListeners();
    this.buildHUD();
    this.scale.on('resize', this.onResize, this);
  }

  // ── Resize ─────────────────────────────────────────────────────────────────

  private onResize(): void {
    this.destroyAllObjects();
    this.buildHUD();
    // Refresh dynamic state that was just rebuilt
    this.refreshResources();
  }

  private destroyAllObjects(): void {
    for (const obj of this.allObjects) {
      if (obj?.active) obj.destroy();
    }
    this.allObjects = [];
    this.hpFillRect     = null;
    this.hpText         = null;
    this.moraleFillRect = null;
    this.moraleText     = null;
    this.moraleWarnText = null;
    this.infoLineText   = null;
    this.panelVisible   = false;
  }

  private track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.allObjects.push(obj);
    return obj;
  }

  // ── Event listeners (set up once, not rebuilt on resize) ──────────────────

  private setupEventListeners(): void {
    this.eventBus.on('game:tick', ({ tick }) => {
      if (this.tickText?.active) this.tickText.setText(`Tick ${tick}`);
      this.refreshResources();
    });

    this.eventBus.on('unit:selected', ({ unit }) => {
      this.selectedUnit = unit;
      if (unit !== null) this.selectedCity = null; // don't wipe city when unit:selected fires with null (e.g. from clearSelection)
      this.rebuildInfoPanel();
    });

    this.eventBus.on('city:selected', ({ city }) => {
      this.selectedCity = city;
      if (city !== null) this.selectedUnit = null; // don't wipe unit when city:selected fires with null (e.g. from selectUnit)
      this.rebuildInfoPanel();
    });

    this.eventBus.on('unit:battle-order-changed', ({ unitId }) => {
      if (this.selectedUnit?.id === unitId) this.rebuildInfoPanel();
    });

    this.eventBus.on('unit:destroyed', ({ unitId }) => {
      if (this.selectedUnit?.id === unitId) {
        this.selectedUnit = null;
        this.rebuildInfoPanel();
      }
    });

    this.eventBus.on('territory:claimed', () => {
      if (this.selectedUnit) this.rebuildInfoPanel();
    });
  }

  // ── Build full HUD ─────────────────────────────────────────────────────────

  private buildHUD(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const s = uiScale(H);

    this.buildTopBar(W, H, s);
    this.rebuildInfoPanel();
  }

  // ── Top bar (right-aligned) ────────────────────────────────────────────────

  private buildTopBar(W: number, _H: number, s: number): void {
    const BAR_H  = Math.round(46 * s);
    const PAD    = Math.round(10 * s);
    const BTN_W  = Math.round(110 * s);
    const BTN_H  = Math.round(32 * s);
    const BTN_GAP = Math.round(8 * s);
    const midY   = BAR_H / 2;

    // Full-width semi-transparent bar
    this.track(
      this.add.rectangle(W / 2, 0, W, BAR_H, 0x0d1020, 0.92).setOrigin(0.5, 0),
    );
    this.track(
      this.add.rectangle(W / 2, BAR_H, W, 1, 0x3344aa, 0.6).setOrigin(0.5, 0),
    );

    // ── Left side: tick + difficulty ──────────────────────────────────────
    this.tickText = this.track(
      this.add.text(PAD, midY, 'Tick 0', {
        ...MONO, fontSize: fs(15, s), color: '#8899cc',
      }).setOrigin(0, 0.5),
    ) as Phaser.GameObjects.Text;

    const diffColor: Record<GameSetup['difficulty'], string> = {
      easy: '#66cc66', medium: '#ddcc44', hard: '#ee6666',
    };
    this.track(
      this.add.text(PAD + Math.round(80 * s), midY, this.setup.difficulty.toUpperCase(), {
        ...MONO, fontSize: fs(13, s), color: diffColor[this.setup.difficulty], fontStyle: 'bold',
      }).setOrigin(0, 0.5),
    );

    // ── Right side: resources → research → menu ────────────────────────────
    const menuX     = W - PAD - BTN_W / 2;
    const researchX = menuX - BTN_W - BTN_GAP;
    // Position resource text so its RIGHT edge sits 16px left of the research button's LEFT edge
    const resX      = researchX - BTN_W / 2 - Math.round(16 * s);

    // MENU button
    this.makeTopBtn(menuX, midY, BTN_W, BTN_H, s, 'MENU [ESC]', 0x1e2244, 0x3355cc, '#aabbff', () => {
      this.scene.get('GameScene')?.input.keyboard?.emit('keydown-ESC');
    });

    // RESEARCH button
    this.makeTopBtn(researchX, midY, BTN_W, BTN_H, s, '🔬 RESEARCH', 0x1a1e3c, 0x3355cc, '#aabbff', () => {
      if (this.scene.isActive('ResearchScene')) {
        this.scene.stop('ResearchScene');
      } else {
        this.scene.launch('ResearchScene', {
          gameState:        this.gameState,
          commandProcessor: this.commandProcessor,
          eventBus:         this.eventBus,
        });
      }
    });

    // Resource text (right-aligned, left of research button)
    this.resourceText = this.track(
      this.add.text(resX, midY, '', {
        ...MONO, fontSize: fs(15, s), color: '#ddeeff',
      }).setOrigin(1, 0.5),
    ) as Phaser.GameObjects.Text;

    this.refreshResources();
  }

  private makeTopBtn(
    x: number, y: number, w: number, h: number, s: number,
    label: string, fill: number, stroke: number, textColor: string,
    onClick: () => void,
  ): void {
    const bg = this.track(
      this.add.rectangle(x, y, w, h, fill).setStrokeStyle(1, stroke).setInteractive({ useHandCursor: true }),
    ) as Phaser.GameObjects.Rectangle;
    this.track(
      this.add.text(x, y, label, { ...MONO, fontSize: fs(12, s), color: textColor }).setOrigin(0.5),
    );
    bg.on('pointerover', () => bg.setFillStyle(fill + 0x111122));
    bg.on('pointerout',  () => bg.setFillStyle(fill));
    bg.on('pointerup',   () => { this.eventBus.emit('ui:click-consumed', {}); onClick(); });
  }

  // ── Info panel (bottom-left) ───────────────────────────────────────────────

  /** Destroy and rebuild only the bottom-left info panel area. */
  private rebuildInfoPanel(): void {
    // Remove only info-panel objects (those tagged after buildTopBar)
    // Simpler: just rebuild whole HUD on selection change.
    // But that's too disruptive. Instead, track panel objects separately.
    this.destroyPanelObjects();

    if (this.selectedUnit) {
      this.buildUnitPanel();
    } else if (this.selectedCity) {
      this.buildCityPanel();
    }
  }

  private panelObjects: Phaser.GameObjects.GameObject[] = [];

  private trackPanel<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.panelObjects.push(obj);
    this.allObjects.push(obj);
    return obj;
  }

  private destroyPanelObjects(): void {
    for (const obj of this.panelObjects) {
      if (obj?.active) obj.destroy();
    }
    // Remove from allObjects too
    const panelSet = new Set(this.panelObjects);
    this.allObjects = this.allObjects.filter(o => !panelSet.has(o));
    this.panelObjects = [];

    this.hpFillRect     = null;
    this.hpText         = null;
    this.moraleFillRect = null;
    this.moraleText     = null;
    this.moraleWarnText = null;
    this.infoLineText   = null;
    this.panelVisible   = false;
  }

  private buildUnitPanel(): void {
    const unit = this.selectedUnit!;
    const H    = this.scale.height;
    const s    = uiScale(H);

    const PAD     = Math.round(12 * s);
    const ROW_H   = Math.round(24 * s);
    const BAR_W   = Math.round(160 * s);
    const BAR_H   = Math.round(9 * s);
    const BTN_W   = Math.round(56 * s);  // wider to fit full labels
    const BTN_H   = Math.round(26 * s);
    const BTN_GAP = Math.round(4 * s);

    const stats      = unit.getStats();
    const isRanged   = stats.attackRange > 1 && stats.rangedDamage > 0;
    const territory0 = this.gameState.getGrid().getTerritory(unit.position);
    const terrain0   = territory0?.getTerrainType();
    const unclaimed0 = territory0?.getControllingNation() === null;
    const hasOutpost = unclaimed0 && terrain0 !== TerrainType.WATER && terrain0 !== TerrainType.MOUNTAIN;
    const hasActions = isRanged || hasOutpost;

    // Width must fit 5 stance buttons; action row buttons are narrower
    const stanceRowW = STANCE_ORDERS.length * BTN_W + (STANCE_ORDERS.length - 1) * BTN_GAP;
    const panelW     = Math.max(Math.round(300 * s), stanceRowW + PAD * 2);
    const panelH     = PAD
      + ROW_H                                   // header
      + ROW_H                                   // HP bar
      + ROW_H                                   // morale bar
      + Math.round(ROW_H * 0.75)               // info line
      + (hasActions ? BTN_H + BTN_GAP : 0)     // action row
      + BTN_H                                   // stance row
      + PAD;
    const panelX = 0;
    const panelY = H - panelH;

    // Panel background
    this.trackPanel(
      this.add.rectangle(panelX, panelY, panelW, panelH, 0x0a0e1e, 0.94)
        .setOrigin(0, 0).setStrokeStyle(1, 0x233660),
    );
    this.trackPanel(
      this.add.rectangle(panelX, panelY, panelW, 1, 0x3355bb, 0.8).setOrigin(0, 0),
    );
    this.trackPanel(
      this.add.rectangle(panelX + panelW, panelY, 1, panelH, 0x3355bb, 0.5).setOrigin(0, 0),
    );

    let y  = panelY + PAD;
    const lx = panelX + PAD;
    const curOrder = unit.getBattleOrder();
    const morale   = unit.getMorale();

    // ── Header: unit type + nation ──────────────────────────────────────────
    this.trackPanel(
      this.add.text(lx, y + ROW_H * 0.4, unitDisplayName(unit), {
        ...MONO, fontSize: fs(15, s), color: '#aabbff', fontStyle: 'bold',
      }).setOrigin(0, 0.5),
    );
    const nation = this.gameState.getNation(unit.getOwnerId());
    this.trackPanel(
      this.add.text(panelX + panelW - PAD, y + ROW_H * 0.4,
        nation?.getName() ?? '', {
          ...MONO, fontSize: fs(11, s), color: '#667799',
        }).setOrigin(1, 0.5),
    );
    y += ROW_H;

    // ── HP bar ──────────────────────────────────────────────────────────────
    this.buildBar(lx, y, BAR_W, BAR_H, s, 'HP', panelW);
    y += ROW_H;

    // ── Morale bar ──────────────────────────────────────────────────────────
    this.buildMoraleBar(lx, y, BAR_W, BAR_H, s, panelW);
    y += ROW_H;

    // ── Info line: battles + home city ──────────────────────────────────────
    this.infoLineText = this.trackPanel(
      this.add.text(lx, y + Math.round(ROW_H * 0.35), '', {
        ...MONO, fontSize: fs(11, s), color: '#5566aa',
      }).setOrigin(0, 0.5),
    ) as Phaser.GameObjects.Text;
    y += Math.round(ROW_H * 0.75);

    // ── Action row: FIRE toggle (ranged units) + OUTPOST — sits above stances
    if (hasActions) {
      let ax = lx;

      if (isRanged) {
        // Ranged units auto-fire every ~1 s at any enemy in range, UNLESS on CHARGE order.
        // CHARGE means "close into melee" — ranged fire is suppressed while charging.
        // This button toggles between ranged-fire mode and melee-charge mode.
        const firingNow  = curOrder !== 'CHARGE';
        const fireFill   = firingNow ? 0x0f2a44 : 0x101828;
        const fireStroke = firingNow ? 0x2299cc : 0x1e2e3e;
        const fireLabel  = firingNow ? '🏹 FIRE' : '🏹 OFF';
        const fireColor  = firingNow ? '#55ccff' : '#335566';
        const fireBg = this.trackPanel(
          this.add.rectangle(ax + BTN_W / 2, y + BTN_H / 2, BTN_W, BTN_H, fireFill)
            .setOrigin(0.5).setStrokeStyle(1, fireStroke).setInteractive({ useHandCursor: true }),
        ) as Phaser.GameObjects.Rectangle;
        this.trackPanel(
          this.add.text(ax + BTN_W / 2, y + BTN_H / 2, fireLabel, {
            ...MONO, fontSize: fs(9, s), color: fireColor,
          }).setOrigin(0.5),
        );
        fireBg.on('pointerover', () => fireBg.setFillStyle(fireFill + 0x0d0d0d));
        fireBg.on('pointerout',  () => fireBg.setFillStyle(fireFill));
        fireBg.on('pointerup',   () => {
          this.eventBus.emit('ui:click-consumed', {});
          if (firingNow) {
            // Already firing — enter target-selection mode so player picks a specific enemy
            this.eventBus.emit('ui:ranged-targeting', { unitId: unit.id });
          } else {
            // On CHARGE (melee mode) — switch back to HOLD so ranged fire re-enables
            this.commandProcessor.dispatch({
              type: 'SET_UNIT_BATTLE_ORDER',
              playerId: this.playerId,
              unitId: unit.id,
              battleOrder: 'HOLD',
              issuedAtTick: 0,
            });
          }
        });
        ax += BTN_W + BTN_GAP;
      }

      if (hasOutpost) {
        const oBg = this.trackPanel(
          this.add.rectangle(ax + BTN_W / 2, y + BTN_H / 2, BTN_W, BTN_H, 0x182818)
            .setOrigin(0.5).setStrokeStyle(1, 0x44cc66).setInteractive({ useHandCursor: true }),
        ) as Phaser.GameObjects.Rectangle;
        this.trackPanel(
          this.add.text(ax + BTN_W / 2, y + BTN_H / 2, '⚑ OUTPOST', {
            ...MONO, fontSize: fs(9, s), color: '#88ffaa',
          }).setOrigin(0.5),
        );
        oBg.on('pointerover', () => oBg.setFillStyle(0x243824));
        oBg.on('pointerout',  () => oBg.setFillStyle(0x182818));
        oBg.on('pointerup', () => {
          this.eventBus.emit('ui:click-consumed', {});
          this.commandProcessor.dispatch({
            type: 'BUILD_TERRITORY',
            playerId: this.playerId,
            position: unit.position,
            building: TerritoryBuildingType.OUTPOST,
            issuedAtTick: 0,
          });
        });
      }

      y += BTN_H + BTN_GAP;
    }

    // ── Stance buttons (bottom row) ─────────────────────────────────────────
    STANCE_ORDERS.forEach(({ order, label }, i) => {
      const bx       = lx + i * (BTN_W + BTN_GAP);
      const active   = curOrder === order;
      const disabled = morale <= MORALE_LOW && (order === 'ADVANCE' || order === 'CHARGE') && !active;
      const fillCol  = active ? 0x2a3a80 : 0x101828;
      const strokeC  = active ? 0x88aaff : disabled ? 0x1e1e30 : 0x2e3e62;
      const txtCol   = active ? '#ffffff' : disabled ? '#333355' : '#7788bb';

      const bg = this.trackPanel(
        this.add.rectangle(bx + BTN_W / 2, y + BTN_H / 2, BTN_W, BTN_H, fillCol)
          .setOrigin(0.5).setStrokeStyle(1, strokeC),
      ) as Phaser.GameObjects.Rectangle;
      this.trackPanel(
        this.add.text(bx + BTN_W / 2, y + BTN_H / 2, label, {
          ...MONO, fontSize: fs(10, s), color: txtCol,
        }).setOrigin(0.5),
      );

      if (!disabled) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => bg.setFillStyle(active ? 0x3a4a90 : 0x1e2a40));
        bg.on('pointerout',  () => bg.setFillStyle(fillCol));
        bg.on('pointerup',   () => {
          this.eventBus.emit('ui:click-consumed', {});
          this.commandProcessor.dispatch({
            type: 'SET_UNIT_BATTLE_ORDER',
            playerId: this.playerId,
            unitId: unit.id,
            battleOrder: order,
            issuedAtTick: 0,
          });
        });
      }
    });

    this.hpBarW       = BAR_W;
    this.panelVisible = true;
  }

  private buildBar(
    lx: number, y: number, barW: number, barH: number, s: number,
    label: string, panelW: number,
  ): void {
    this.trackPanel(
      this.add.text(lx, y + barH / 2 + Math.round(4 * s), label, {
        ...MONO, fontSize: fs(11, s), color: '#556688',
      }).setOrigin(0, 0.5),
    );
    const barX = lx + Math.round(28 * s);
    // Background
    this.trackPanel(
      this.add.rectangle(barX, y + barH / 2 + Math.round(4 * s), barW, barH, 0x111828)
        .setOrigin(0, 0.5),
    );
    // Fill (dynamic — updated in update())
    this.hpFillRect = this.trackPanel(
      this.add.rectangle(barX, y + barH / 2 + Math.round(4 * s), 1, barH, 0x44cc66)
        .setOrigin(0, 0.5),
    ) as Phaser.GameObjects.Rectangle;
    // HP text
    this.hpText = this.trackPanel(
      this.add.text(barX + barW + Math.round(6 * s), y + barH / 2 + Math.round(4 * s), '', {
        ...MONO, fontSize: fs(11, s), color: '#aaaacc',
      }).setOrigin(0, 0.5),
    ) as Phaser.GameObjects.Text;

    void panelW; // used for layout context by caller
  }

  private buildMoraleBar(
    lx: number, y: number, barW: number, barH: number, s: number, _panelW: number,
  ): void {
    this.trackPanel(
      this.add.text(lx, y + barH / 2 + Math.round(4 * s), 'MRL', {
        ...MONO, fontSize: fs(11, s), color: '#556688',
      }).setOrigin(0, 0.5),
    );
    const barX = lx + Math.round(28 * s);
    this.trackPanel(
      this.add.rectangle(barX, y + barH / 2 + Math.round(4 * s), barW, barH, 0x111828)
        .setOrigin(0, 0.5),
    );
    this.moraleFillRect = this.trackPanel(
      this.add.rectangle(barX, y + barH / 2 + Math.round(4 * s), 1, barH, 0x4488ff)
        .setOrigin(0, 0.5),
    ) as Phaser.GameObjects.Rectangle;
    this.moraleText = this.trackPanel(
      this.add.text(barX + barW + Math.round(6 * s), y + barH / 2 + Math.round(4 * s), '', {
        ...MONO, fontSize: fs(11, s), color: '#aaaacc',
      }).setOrigin(0, 0.5),
    ) as Phaser.GameObjects.Text;
    this.moraleWarnText = this.trackPanel(
      this.add.text(barX + barW + Math.round(44 * s), y + barH / 2 + Math.round(4 * s), '', {
        ...MONO, fontSize: fs(10, s), color: '#ff6644', fontStyle: 'bold',
      }).setOrigin(0, 0.5),
    ) as Phaser.GameObjects.Text;
  }

  private buildCityPanel(): void {
    const city = this.selectedCity!;
    const H    = this.scale.height;
    const s    = uiScale(H);

    const PAD   = Math.round(12 * s);
    const ROW_H = Math.round(24 * s);
    const BAR_W = Math.round(160 * s);
    const BAR_H = Math.round(9 * s);

    const panelW = Math.round(320 * s);
    const panelH = PAD + ROW_H * 4 + PAD;
    const panelX = 0;
    const panelY = H - panelH;

    this.trackPanel(
      this.add.rectangle(panelX, panelY, panelW, panelH, 0x0a0e1e, 0.94)
        .setOrigin(0, 0),
    );
    this.trackPanel(
      this.add.rectangle(panelX, panelY, panelW, 1, 0x3355bb, 0.8).setOrigin(0, 0),
    );
    this.trackPanel(
      this.add.rectangle(panelX + panelW, panelY, 1, panelH, 0x3355bb, 0.5).setOrigin(0, 0),
    );

    let y = panelY + PAD;
    const lx = panelX + PAD;

    // City name + owner
    const nation = this.gameState.getNation(city.getOwnerId());
    this.trackPanel(
      this.add.text(lx, y + ROW_H * 0.4, city.getName(), {
        ...MONO, fontSize: fs(15, s), color: '#ffddaa', fontStyle: 'bold',
      }).setOrigin(0, 0.5),
    );
    this.trackPanel(
      this.add.text(panelX + panelW - PAD, y + ROW_H * 0.4,
        nation?.getName() ?? '', {
          ...MONO, fontSize: fs(11, s), color: '#667799',
        }).setOrigin(1, 0.5),
    );
    y += ROW_H;

    // HP bar (static — city HP doesn't need per-frame update during pause browsing)
    const hp    = city.getHealth();
    const hpMax = city.getMaxHealth();
    const ratio = hpMax > 0 ? hp / hpMax : 0;
    this.trackPanel(
      this.add.text(lx, y + BAR_H / 2 + Math.round(4 * s), 'HP', {
        ...MONO, fontSize: fs(11, s), color: '#556688',
      }).setOrigin(0, 0.5),
    );
    const barX = lx + Math.round(28 * s);
    this.trackPanel(
      this.add.rectangle(barX, y + BAR_H / 2 + Math.round(4 * s), BAR_W, BAR_H, 0x111828)
        .setOrigin(0, 0.5),
    );
    const hpColor = ratio > 0.5 ? 0x44cc66 : ratio > 0.25 ? 0xddcc22 : 0xcc3322;
    this.trackPanel(
      this.add.rectangle(barX, y + BAR_H / 2 + Math.round(4 * s),
        Math.max(1, Math.round(BAR_W * ratio)), BAR_H, hpColor)
        .setOrigin(0, 0.5),
    );
    this.trackPanel(
      this.add.text(barX + BAR_W + Math.round(6 * s), y + BAR_H / 2 + Math.round(4 * s),
        `${hp}/${hpMax}`, {
          ...MONO, fontSize: fs(11, s), color: '#aaaacc',
        }).setOrigin(0, 0.5),
    );
    y += ROW_H;

    // Buildings
    const buildings = city.getBuildings?.() ?? [];
    const buildStr  = buildings.length > 0
      ? buildings.map(b => b.replace(/_/g, ' ')).join(', ')
      : 'None';
    this.trackPanel(
      this.add.text(lx, y + ROW_H * 0.4, `Buildings: ${buildStr}`, {
        ...MONO, fontSize: fs(11, s), color: '#6677aa',
      }).setOrigin(0, 0.5),
    );
    y += ROW_H;

    // Current production
    const order = city.getCurrentOrder();
    const prodStr = order
      ? `Producing: ${order.kind === 'unit' ? order.unitType : order.kind}`
      : 'Idle';
    this.trackPanel(
      this.add.text(lx, y + ROW_H * 0.4, prodStr, {
        ...MONO, fontSize: fs(11, s), color: '#557755',
      }).setOrigin(0, 0.5),
    );

    this.panelVisible = false; // no per-frame updates needed for city panel
  }

  // ── Per-frame dynamic update ───────────────────────────────────────────────

  override update(): void {
    if (!this.panelVisible || !this.selectedUnit) return;
    const unit = this.selectedUnit;
    const barW = this.hpBarW;

    // HP bar
    if (this.hpFillRect && this.hpText) {
      const hp    = unit.getHealth();
      const hpMax = unit.getStats().maxHealth;
      const ratio = hpMax > 0 ? hp / hpMax : 0;
      const fill  = Math.max(1, Math.round(barW * ratio));
      const color = ratio > 0.5 ? 0x44cc66 : ratio > 0.25 ? 0xddcc22 : 0xcc3322;
      this.hpFillRect.setSize(fill, this.hpFillRect.height).setFillStyle(color);
      this.hpText.setText(`${hp}/${hpMax}`);
    }

    // Morale bar
    if (this.moraleFillRect && this.moraleText) {
      const morale = unit.getMorale();
      const fill   = Math.max(1, Math.round(barW * morale / 100));
      const color  = morale > 50 ? 0x4488ff : morale > 30 ? 0xffaa22 : 0xff3333;
      this.moraleFillRect.setSize(fill, this.moraleFillRect.height).setFillStyle(color);
      this.moraleText.setText(`${morale}`);
      if (this.moraleWarnText) {
        this.moraleWarnText.setText(
          morale <= 10 ? '⚠ ROUTED' : morale <= MORALE_LOW ? '⚠ LOW' : '',
        );
      }
    }

    // Info line
    if (this.infoLineText) {
      const battles  = unit.getBattlesEngaged();
      const homeId   = unit.getHomeCityId();
      const homeName = homeId ? (this.gameState.getCity(homeId)?.getName() ?? '—') : '—';
      const engStr   = unit.isEngagedInBattle() ? '  ⚔ IN BATTLE' : '';
      this.infoLineText.setText(`Battles: ${battles}  Home: ${homeName}${engStr}`);
    }
  }

  // ── Resource refresh ───────────────────────────────────────────────────────

  private refreshResources(): void {
    if (!this.resourceText?.active) return;
    const lp = this.gameState.getLocalPlayer();
    if (!lp) return;
    const t = this.gameState.getNation(lp.getControlledNationId())?.getTreasury();
    if (!t) return;

    const f = t.getAmount(ResourceType.FOOD);
    const m = t.getAmount(ResourceType.RAW_MATERIAL);
    const g = t.getAmount(ResourceType.GOLD);
    const r = t.getAmount(ResourceType.RESEARCH);

    this.resourceText.setText(
      `${RESOURCE_EMOJI[ResourceType.FOOD]}${f}  ${RESOURCE_EMOJI[ResourceType.RAW_MATERIAL]}${m}  ${RESOURCE_EMOJI[ResourceType.GOLD]}${g}  ${RESOURCE_EMOJI[ResourceType.RESEARCH]}${r}`,
    );
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────────

function unitDisplayName(unit: Unit): string {
  switch (unit.getUnitType()) {
    case 'INFANTRY':       return 'Infantry';
    case 'SCOUT':          return 'Scout';
    case 'HEAVY_INFANTRY': return 'Heavy Infantry';
    case 'CAVALRY':        return 'Cavalry';
    case 'LONGBOWMAN':     return 'Longbowman';
    case 'CROSSBOWMAN':    return 'Crossbowman';
    case 'CATAPULT':       return 'Catapult';
    case 'TREBUCHET':      return 'Trebuchet';
    default:               return 'Unit';
  }
}
