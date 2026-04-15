import Phaser from 'phaser';
import { MenuScene } from '@/scenes/MenuScene';
import { BootScene } from '@/scenes/BootScene';
import { GameScene } from '@/scenes/GameScene';
import { UIScene } from '@/scenes/UIScene';
import { PauseScene } from '@/scenes/PauseScene';
import { CityMenuScene } from '@/scenes/CityMenuScene';
import { TerritoryMenuScene } from '@/scenes/TerritoryMenuScene';
import { ResearchScene } from '@/scenes/ResearchScene';
import { DiplomacyScene } from '@/scenes/DiplomacyScene';
import { WarConfirmScene } from '@/scenes/WarConfirmScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#08090f',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0, x: 0 },
      debug: false,
    },
  },
  // MenuScene first = entry point; overlay scenes last = render on top
  scene: [MenuScene, BootScene, GameScene, UIScene, PauseScene, CityMenuScene, TerritoryMenuScene, ResearchScene, DiplomacyScene, WarConfirmScene],
};
