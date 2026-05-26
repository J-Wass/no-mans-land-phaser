import Phaser from 'phaser';
import { UIManager } from '@/ui/UIManager';

/** Calm tracks that play on the title screen (one chosen at random). */
const TITLE_TRACKS = [
  'music_hope1',
  'music_melancholy1',
  'music_melancholy2',
  'music_melancholy3',
];

/** Last title track played, so re-entering the menu doesn't replay the same one. */
let lastTitleTrack: string | null = null;

export class MenuScene extends Phaser.Scene {
  private titleMusic: Phaser.Sound.BaseSound | null = null;

  constructor() { super({ key: 'MenuScene' }); }

  preload(): void {
    // Loaded here (not just in GameScene) so the title screen can play music.
    // Keys already in the cache are skipped, so GameScene re-loading them is a no-op.
    this.load.audio('music_hope1',       'audio/music/hope1.mp3');
    this.load.audio('music_melancholy1', 'audio/music/melancholy1.mp3');
    this.load.audio('music_melancholy2', 'audio/music/melancholy2.mp3');
    this.load.audio('music_melancholy3', 'audio/music/melancholy3.mp3');
  }

  create(): void {
    this.startTitleMusic();
    // Backstop in case the scene is shut down without going through the callback.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stopTitleMusic());

    UIManager.showMenu(({ setup, saveData }) => {
      UIManager.hideMenu();
      // Stop the title track explicitly so it never bleeds into the game, where
      // GameScene's MusicManager takes over.
      this.stopTitleMusic();
      if (saveData) {
        this.game.scene.start('GameScene', { saveData, setup });
      } else {
        this.game.scene.start('BootScene', { setup });
      }
    });
  }

  private startTitleMusic(): void {
    const choices = TITLE_TRACKS.filter(k => k !== lastTitleTrack);
    const pool = choices.length > 0 ? choices : TITLE_TRACKS;
    const key = pool[Math.floor(Math.random() * pool.length)]!;
    lastTitleTrack = key;
    this.titleMusic = this.sound.add(key, { volume: 0.8, loop: true });
    // Browsers block audio until a user gesture; if locked, start once unlocked.
    if (this.sound.locked) {
      this.sound.once(Phaser.Sound.Events.UNLOCKED, () => this.titleMusic?.play());
    } else {
      this.titleMusic.play();
    }
  }

  private stopTitleMusic(): void {
    if (!this.titleMusic) return;
    this.titleMusic.stop();
    this.titleMusic.destroy();
    this.titleMusic = null;
  }

  shutdown(): void {
    UIManager.hideMenu();
    this.stopTitleMusic();
  }
}
