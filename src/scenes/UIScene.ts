/**
 * UIScene — HUD overlay running in parallel with GameScene.
 * Shows tick counter, live resources with emoji, selected unit info, menu button,
 * research button, and a conditional "Build Outpost" button.
 *
 * Tick/resource updates are event-driven (game:tick). Unit selection is event-driven
 * (unit:selected). Only the per-frame unit position display remains in update().
 */

import Phaser from 'phaser';
import type { Unit } from '@/entities/units/Unit';
import type { BattleOrder } from '@/entities/units/Unit';
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

export class UIScene extends Phaser.Scene {
  private setup!:            GameSetup;
  private gameState!:        GameState;
  private commandProcessor!: CommandProcessor;
  private eventBus!:         GameEventBus;
  private playerId:          string = '';

  private tickText!:      Phaser.GameObjects.Text;
  private resourceText!:  Phaser.GameObjects.Text;
  private unitInfoText!:  Phaser.GameObjects.Text;
  private selectedUnit:   Unit | null = null;

  // Conditional "Build Outpost" button
  private outpostBtnBg!:   Phaser.GameObjects.Rectangle;
  private outpostBtnText!: Phaser.GameObjects.Text;
  private battleOrderButtons: Array<{
    order: BattleOrder;
    bg: Phaser.GameObjects.Rectangle;
    text: Phaser.GameObjects.Text;
  }> = [];

  constructor() {
    super({ key: 'UIScene' });
  }

  init(data: UISceneData): void {
    this.setup             = data.setup;
    this.gameState         = data.gameState;
    this.commandProcessor  = data.commandProcessor;
    this.eventBus          = data.eventBus;
    this.playerId          = this.gameState.getLocalPlayer()?.getId() ?? '';
  }

  create(): void {
    const panelH = 40;
    const panelY = this.scale.height - panelH;
    const W      = this.scale.width;

    this.add.rectangle(0, panelY, W, panelH, 0x1a1a2e, 0.9).setOrigin(0, 0);

    // Tick counter
    this.tickText = this.add.text(8, panelY + 8, 'Tick: 0', {
      fontSize: '13px', color: '#a8dadc', fontFamily: 'monospace',
    });

    // Difficulty badge
    const diffColor: Record<GameSetup['difficulty'], string> = {
      easy: '#88cc88', medium: '#cccc66', hard: '#cc6666',
    };
    this.add.text(108, panelY + 8, this.setup.difficulty.toUpperCase(), {
      fontSize: '11px', color: diffColor[this.setup.difficulty], fontFamily: 'monospace',
    });

    // Live resource display (updated on game:tick)
    this.resourceText = this.add.text(172, panelY + 7, '', {
      fontSize: '13px', color: '#e0e0e0', fontFamily: 'monospace',
    });

    // Selected unit info (position updated every frame since units move)
    this.unitInfoText = this.add.text(430, panelY + 8, 'Click a unit or city', {
      fontSize: '12px', color: '#aaaaaa', fontFamily: 'monospace',
    });

    // ── Right-side buttons (right-to-left): MENU → RESEARCH → BUILD OUTPOST ──

    // MENU button
    const menuBtnX = W - 50;
    const menuBg = this.add.rectangle(menuBtnX, panelY + 20, 84, 30, 0x2d2d4e)
      .setStrokeStyle(1, 0x5544cc)
      .setInteractive({ useHandCursor: true });
    this.add.text(menuBtnX, panelY + 20, 'MENU [ESC]', {
      fontSize: '11px', color: '#aaaacc', fontFamily: 'monospace',
    }).setOrigin(0.5);
    menuBg.on('pointerover', () => menuBg.setFillStyle(0x3d3d6e));
    menuBg.on('pointerout',  () => menuBg.setFillStyle(0x2d2d4e));
    menuBg.on('pointerup', () => {
      this.scene.get('GameScene')?.input.keyboard?.emit('keydown-ESC');
    });

    // RESEARCH button
    const researchBtnX = W - 152;
    const researchBg = this.add.rectangle(researchBtnX, panelY + 20, 86, 30, 0x1e1e40)
      .setStrokeStyle(1, 0x5544cc)
      .setInteractive({ useHandCursor: true });
    this.add.text(researchBtnX, panelY + 20, '🔬 RESEARCH', {
      fontSize: '11px', color: '#a0a0ff', fontFamily: 'monospace',
    }).setOrigin(0.5);
    researchBg.on('pointerover', () => researchBg.setFillStyle(0x2e2e60));
    researchBg.on('pointerout',  () => researchBg.setFillStyle(0x1e1e40));
    researchBg.on('pointerup',   () => this.openResearch());

    // BUILD OUTPOST button (hidden until a unit on unclaimed land is selected)
    const outpostBtnX = W - 260;
    this.outpostBtnBg = this.add.rectangle(outpostBtnX, panelY + 20, 96, 30, 0x1a2a1a)
      .setStrokeStyle(1, 0x44cc44)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.outpostBtnText = this.add.text(outpostBtnX, panelY + 20, '⚑ OUTPOST', {
      fontSize: '11px', color: '#88ff88', fontFamily: 'monospace',
    }).setOrigin(0.5).setVisible(false);
    this.outpostBtnBg.on('pointerover', () => this.outpostBtnBg.setFillStyle(0x2a4a2a));
    this.outpostBtnBg.on('pointerout',  () => this.outpostBtnBg.setFillStyle(0x1a2a1a));
    this.outpostBtnBg.on('pointerup',   () => this.buildOutpost());

    const orders: Array<{ order: BattleOrder; label: string }> = [
      { order: 'RETREAT', label: 'RET' },
      { order: 'FALL_BACK', label: 'BACK' },
      { order: 'HOLD', label: 'HOLD' },
      { order: 'ADVANCE', label: 'ADV' },
      { order: 'CHARGE', label: 'CHG' },
    ];
    const orderStartX = 430;
    const orderY = panelY + 22;
    orders.forEach(({ order, label }, index) => {
      const x = orderStartX + index * 48;
      const bg = this.add.rectangle(x, orderY, 42, 20, 0x1f2036)
        .setStrokeStyle(1, 0x444466)
        .setInteractive({ useHandCursor: true })
        .setVisible(false);
      const text = this.add.text(x, orderY, label, {
        fontSize: '10px',
        color: '#8890aa',
        fontFamily: 'monospace',
      }).setOrigin(0.5).setVisible(false);
      bg.on('pointerup', () => this.setBattleOrder(order));
      this.battleOrderButtons.push({ order, bg, text });
    });

    // ── Event subscriptions ──────────────────────────────────────────────────
    // Tick counter and resources only need updating when a tick fires (not every frame)
    this.eventBus.on('game:tick', ({ tick }) => {
      this.tickText.setText(`Tick: ${tick}`);
      this.refreshResources();
    });

    // Unit selection driven by GameScene via event bus
    this.eventBus.on('unit:selected', ({ unit }) => {
      this.selectedUnit = unit;
      if (!unit) {
        this.unitInfoText.setText('Click a unit or city').setColor('#aaaaaa');
        this.setOutpostVisible(false);
        this.setBattleOrderButtonsVisible(false);
        return;
      }
      this.refreshOutpostButton(unit);
      this.refreshBattleOrderButtons();
    });

    // Refresh outpost button when territory ownership changes
    this.eventBus.on('territory:claimed', () => {
      if (this.selectedUnit) this.refreshOutpostButton(this.selectedUnit);
    });
    this.eventBus.on('unit:battle-order-changed', ({ unitId }) => {
      if (this.selectedUnit?.id === unitId) this.refreshBattleOrderButtons();
    });
    this.eventBus.on('unit:destroyed', ({ unitId }) => {
      if (this.selectedUnit?.id === unitId) {
        this.selectedUnit = null;
        this.unitInfoText.setText('Click a unit or city').setColor('#aaaaaa');
        this.setBattleOrderButtonsVisible(false);
        this.setOutpostVisible(false);
      }
    });
  }

  override update(): void {
    // Only the unit position/HP display needs per-frame updates (units move smoothly).
    if (this.selectedUnit) {
      const stats = this.selectedUnit.getStats();
      const hp    = `${this.selectedUnit.getHealth()}/${stats.maxHealth}`;
      const pos   = this.selectedUnit.position;
      this.unitInfoText.setText(
        `[${this.selectedUnit.getUnitType()}] HP:${hp} (${pos.row},${pos.col}) ${this.selectedUnit.isEngagedInBattle() ? '[BATTLE]' : ''} ${this.selectedUnit.getBattleOrder()}`
      ).setColor('#e0e0e0');
    }
  }

  private refreshOutpostButton(unit: Unit): void {
    const territory = this.gameState.getGrid().getTerritory(unit.position);
    if (!territory) { this.setOutpostVisible(false); return; }

    const terrain    = territory.getTerrainType();
    const impassable = terrain === TerrainType.WATER || terrain === TerrainType.MOUNTAIN;
    const unclaimed  = territory.getControllingNation() === null;

    this.setOutpostVisible(!impassable && unclaimed);
  }

  private setOutpostVisible(v: boolean): void {
    this.outpostBtnBg.setVisible(v);
    this.outpostBtnText.setVisible(v);
  }

  private setBattleOrderButtonsVisible(v: boolean): void {
    this.battleOrderButtons.forEach(({ bg, text }) => {
      bg.setVisible(v);
      text.setVisible(v);
    });
  }

  private refreshBattleOrderButtons(): void {
    const unit = this.selectedUnit;
    const visible = unit !== null;
    this.setBattleOrderButtonsVisible(visible);
    if (!unit) return;

    this.battleOrderButtons.forEach(({ order, bg, text }) => {
      const active = unit.getBattleOrder() === order;
      bg.setFillStyle(active ? 0x445599 : 0x1f2036);
      bg.setStrokeStyle(1, active ? 0xaad4ff : 0x444466);
      text.setColor(active ? '#ffffff' : '#8890aa');
    });
  }

  private buildOutpost(): void {
    if (!this.selectedUnit) return;
    this.commandProcessor.dispatch({
      type:         'BUILD_TERRITORY',
      playerId:     this.playerId,
      position:     this.selectedUnit.position,
      building:     TerritoryBuildingType.OUTPOST,
      issuedAtTick: 0,
    });
    this.refreshOutpostButton(this.selectedUnit);
  }

  private setBattleOrder(order: BattleOrder): void {
    if (!this.selectedUnit) return;
    this.commandProcessor.dispatch({
      type:         'SET_UNIT_BATTLE_ORDER',
      playerId:     this.playerId,
      unitId:       this.selectedUnit.id,
      battleOrder:  order,
      issuedAtTick: 0,
    });
    this.refreshBattleOrderButtons();
  }

  private openResearch(): void {
    if (this.scene.isActive('ResearchScene')) {
      this.scene.stop('ResearchScene');
    } else {
      this.scene.launch('ResearchScene', {
        gameState:        this.gameState,
        commandProcessor: this.commandProcessor,
        eventBus:         this.eventBus,
      });
    }
  }

  private refreshResources(): void {
    const localPlayer = this.gameState.getLocalPlayer();
    if (!localPlayer) return;
    const treasury = this.gameState.getNation(localPlayer.getControlledNationId())?.getTreasury();
    if (!treasury) return;

    const f = treasury.getAmount(ResourceType.FOOD);
    const m = treasury.getAmount(ResourceType.RAW_MATERIAL);
    const g = treasury.getAmount(ResourceType.GOLD);
    const r = treasury.getAmount(ResourceType.RESEARCH);

    this.resourceText.setText(
      `${RESOURCE_EMOJI[ResourceType.FOOD]}${f}  ${RESOURCE_EMOJI[ResourceType.RAW_MATERIAL]}${m}  ${RESOURCE_EMOJI[ResourceType.GOLD]}${g}  ${RESOURCE_EMOJI[ResourceType.RESEARCH]}${r}`
    );
  }
}
