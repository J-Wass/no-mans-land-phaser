/// <reference types="vite/client" />
import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { UIManager } from './ui/UIManager';

UIManager.init();

class Game {
  private game: Phaser.Game | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    this.game = new Phaser.Game(gameConfig);
  }

  public getPhaserGame(): Phaser.Game | null {
    return this.game;
  }

  public destroy(): void {
    if (this.game) {
      this.game.destroy(true);
      this.game = null;
    }
  }
}

function startGame(): Game {
  const game = new Game();
  // Expose game instance for debugging
  if (import.meta.env.DEV) {
    (window as any).game = game;
  }
  return game;
}

// `?test=1` (dev server only) installs window.__TEST__ for automated playtesting.
// See .claude/skills/playtest/SKILL.md.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('test') === '1') {
  void import('./testing/TestHarness').then(({ beginTestSession }) => {
    beginTestSession(() => startGame().getPhaserGame()!);
  });
} else {
  startGame();
}
