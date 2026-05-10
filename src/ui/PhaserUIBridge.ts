import type Phaser from 'phaser';
import type { GameState } from '@/managers/GameState';
import type { NetworkAdapter } from '@/network/NetworkAdapter';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import type { DiplomacySystem } from '@/systems/diplomacy/DiplomacySystem';
import type { TickEngine } from '@/systems/tick/TickEngine';
import type { MovementSystem } from '@/systems/movement/MovementSystem';
import type { GameSetup } from '@/types/gameSetup';
import type { City } from '@/entities/cities/City';
import type { GridCoordinates } from '@/types/common';
import { UIManager } from '@/ui/UIManager';
import { SaveSystem } from '@/systems/save/SaveSystem';
import { WarConfirmModal } from '@/ui/modals/WarConfirmModal';
import { CityMenuModal } from '@/ui/modals/CityMenuModal';
import { TerritoryMenuModal } from '@/ui/modals/TerritoryMenuModal';
import { ResearchModal } from '@/ui/modals/ResearchModal';
import { DiplomacyModal } from '@/ui/modals/DiplomacyModal';
import { PauseModal } from '@/ui/modals/PauseModal';

export interface BridgeData {
  phaserScene:     Phaser.Scene;
  gameState:       GameState;
  networkAdapter:  NetworkAdapter;
  eventBus:        GameEventBus;
  diplomacySystem: DiplomacySystem;
  tickEngine:      TickEngine;
  movementSystem:  MovementSystem;
  setup:           GameSetup;
}

export class PhaserUIBridge {
  readonly phaserScene:     Phaser.Scene;
  readonly gameState:       GameState;
  readonly networkAdapter:  NetworkAdapter;
  readonly eventBus:        GameEventBus;
  readonly diplomacySystem: DiplomacySystem;
  readonly tickEngine:      TickEngine;
  readonly movementSystem:  MovementSystem;
  readonly setup:           GameSetup;

  private activeModals = new Map<string, { destroy: () => void }>();

  constructor(data: BridgeData) {
    this.phaserScene     = data.phaserScene;
    this.gameState       = data.gameState;
    this.networkAdapter  = data.networkAdapter;
    this.eventBus        = data.eventBus;
    this.diplomacySystem = data.diplomacySystem;
    this.tickEngine      = data.tickEngine;
    this.movementSystem  = data.movementSystem;
    this.setup           = data.setup;
  }

  // ── War confirm ───────────────────────────────────────────────────────────

  openWarConfirm(nationNames: string[], onConfirm: () => void): void {
    const modal = new WarConfirmModal(nationNames, onConfirm, () => this.closeWarConfirm());
    const el = modal.render();
    this.activeModals.set('warConfirm', modal);
    UIManager.open('warConfirm', el);
  }

  closeWarConfirm(): void {
    this.activeModals.get('warConfirm')?.destroy();
    this.activeModals.delete('warConfirm');
    UIManager.close('warConfirm');
  }

  // ── City menu ─────────────────────────────────────────────────────────────

  openCityMenu(city: City): void {
    this.closeMenu();
    const modal = new CityMenuModal(this, city);
    const el = modal.render();
    this.activeModals.set('cityMenu', modal);
    UIManager.open('cityMenu', el);
  }

  closeCityMenu(): void {
    this.activeModals.get('cityMenu')?.destroy();
    this.activeModals.delete('cityMenu');
    UIManager.close('cityMenu');
  }

  // ── Territory menu ────────────────────────────────────────────────────────

  openTerritoryMenu(position: GridCoordinates): void {
    this.closeMenu();
    const modal = new TerritoryMenuModal(this, position);
    const el = modal.render();
    this.activeModals.set('territoryMenu', modal);
    UIManager.open('territoryMenu', el);
  }

  closeTerritoryMenu(): void {
    this.activeModals.get('territoryMenu')?.destroy();
    this.activeModals.delete('territoryMenu');
    UIManager.close('territoryMenu');
  }

  // ── Research ──────────────────────────────────────────────────────────────

  openResearch(): void {
    const modal = new ResearchModal(this);
    const el = modal.render();
    this.activeModals.set('research', modal);
    UIManager.open('research', el);
  }

  closeResearch(): void {
    this.activeModals.get('research')?.destroy();
    this.activeModals.delete('research');
    UIManager.close('research');
  }

  isResearchOpen(): boolean { return UIManager.isOpen('research'); }

  // ── Diplomacy ─────────────────────────────────────────────────────────────

  openDiplomacy(targetNationId?: string): void {
    this.closeDiplomacy();
    const modal = new DiplomacyModal(this, targetNationId);
    const el = modal.render();
    this.activeModals.set('diplomacy', modal);
    UIManager.open('diplomacy', el);
  }

  closeDiplomacy(): void {
    this.activeModals.get('diplomacy')?.destroy();
    this.activeModals.delete('diplomacy');
    UIManager.close('diplomacy');
  }

  // ── Pause ─────────────────────────────────────────────────────────────────

  openPause(): void {
    if (UIManager.isOpen('pause')) return;
    this.phaserScene.scene.pause('GameScene');
    this.phaserScene.scene.pause('UIScene');
    const modal = new PauseModal(this);
    const el = modal.render();
    this.activeModals.set('pause', modal);
    UIManager.open('pause', el);
  }

  closePause(): void {
    this.activeModals.get('pause')?.destroy();
    this.activeModals.delete('pause');
    UIManager.close('pause');
    this.phaserScene.scene.resume('GameScene');
    this.phaserScene.scene.resume('UIScene');
  }

  // ── Scene helpers ─────────────────────────────────────────────────────────

  /** Close whichever single-selection menu (city or territory) is open. */
  closeMenu(): void {
    this.closeCityMenu();
    this.closeTerritoryMenu();
  }

  goToMenu(): void {
    this.closeAllModals();
    this.phaserScene.scene.resume('GameScene');
    this.phaserScene.scene.resume('UIScene');
    this.phaserScene.scene.stop('UIScene');
    this.phaserScene.scene.stop('GameScene');
    this.phaserScene.scene.start('MenuScene');
  }

  loadGame(slot: number): void {
    const saveData = SaveSystem.load(slot);
    if (!saveData) return;
    this.closeAllModals();
    this.phaserScene.scene.resume('GameScene');
    this.phaserScene.scene.resume('UIScene');
    this.phaserScene.scene.stop('UIScene');
    this.phaserScene.scene.start('GameScene', { saveData, setup: saveData.setup });
  }

  private closeAllModals(): void {
    for (const [id, modal] of this.activeModals) {
      modal.destroy();
      UIManager.close(id);
    }
    this.activeModals.clear();
  }
}
