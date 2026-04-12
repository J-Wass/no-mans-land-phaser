import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';

class Game {
  private game: Phaser.Game | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    this.game = new Phaser.Game(gameConfig);
  }

  public destroy(): void {
    if (this.game) {
      this.game.destroy(true);
      this.game = null;
    }
  }
}

// Initialize the game
const game = new Game();

// Expose game instance for debugging
if (import.meta.env.DEV) {
  (window as any).game = game;
}

export default game;
