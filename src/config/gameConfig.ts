import Phaser from 'phaser';
import { MenuScene } from '@/scenes/MenuScene';
import { BootScene } from '@/scenes/BootScene';
import { GameScene } from '@/scenes/GameScene';
import { UIScene } from '@/scenes/UIScene';
import { PauseScene } from '@/scenes/PauseScene';
import { CityMenuScene } from '@/scenes/CityMenuScene';
import { TerritoryMenuScene } from '@/scenes/TerritoryMenuScene';
import { ResearchScene } from '@/scenes/ResearchScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1000,   // 25 tiles × 40px
    height: 1040,  // 1000px grid + 40px UI panel
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0, x: 0 },
      debug: false,
    },
  },
  // MenuScene first = entry point; overlay scenes last = render on top
  scene: [MenuScene, BootScene, GameScene, UIScene, PauseScene, CityMenuScene, TerritoryMenuScene, ResearchScene],
};
