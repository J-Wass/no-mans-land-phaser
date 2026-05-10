import Phaser from 'phaser';
import { UIManager } from '@/ui/UIManager';

export class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); }

  create(): void {
    UIManager.showMenu(({ setup, saveData }) => {
      UIManager.hideMenu();
      if (saveData) {
        this.game.scene.start('GameScene', { saveData, setup });
      } else {
        this.game.scene.start('BootScene', { setup });
      }
    });
  }

  shutdown(): void {
    UIManager.hideMenu();
  }
}
