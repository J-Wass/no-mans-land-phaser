import Phaser from 'phaser';
import type { GameState } from '@/managers/GameState';
import type { GameEventBus, GameEventMap } from '@/systems/events/GameEventBus';

type MusicCategory = 'melancholy' | 'hope' | 'focus' | 'glory';

const TRACKS: Record<MusicCategory, string[]> = {
  melancholy: ['music_melancholy1', 'music_melancholy2', 'music_melancholy3'],
  hope:       ['music_hope1'],
  focus:      ['music_focus1'],
  glory:      ['music_glory1', 'music_glory2'],
};

/** ~10 minutes at TICK_RATE=10 (10 ticks/sec × 60 sec × 10 min) */
const EARLY_GAME_END_TICKS = 6_000;
/** Fade duration when switching due to war declared/undeclared (ms). */
const WAR_FADE_MS = 1_500;
/** Silence gap between tracks when a song ends naturally (ms). */
const BETWEEN_TRACKS_MS = 5_000;

export class MusicManager {
  private currentSound: Phaser.Sound.BaseSound | null = null;
  private currentCategory: MusicCategory | null = null;
  private fadeTween: Phaser.Tweens.Tween | null = null;
  private pendingTimer: Phaser.Time.TimerEvent | null = null;
  private currentTick = 0;
  private gameOver = false;
  private lastPlayed: Map<MusicCategory, string> = new Map();

  private readonly handleWarDeclared = (_p: GameEventMap['diplomacy:war-declared']) => this.checkDiplomacy();
  private readonly handlePeaceSigned = (_p: GameEventMap['diplomacy:peace-signed']) => this.checkDiplomacy();
  private readonly handleTick = ({ tick }: GameEventMap['game:tick']) => { this.currentTick = tick; };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly gameState: GameState,
    private readonly eventBus: GameEventBus,
  ) {
    eventBus.on('diplomacy:war-declared', this.handleWarDeclared);
    eventBus.on('diplomacy:peace-signed', this.handlePeaceSigned);
    eventBus.on('game:tick', this.handleTick);
    this.playCategory(this.resolveCategory());
  }

  /** Call when the local player wins — switches to glory music immediately. */
  public notifyVictory(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.switchTo('glory', WAR_FADE_MS);
  }

  private resolveCategory(): MusicCategory {
    if (this.gameOver) return 'glory';
    if (this.isAtWar()) return 'focus';
    return this.currentTick < EARLY_GAME_END_TICKS ? 'melancholy' : 'hope';
  }

  private isAtWar(): boolean {
    const lp = this.gameState.getLocalPlayer();
    if (!lp) return false;
    const nationId = lp.getControlledNationId();
    const nation = this.gameState.getNation(nationId);
    if (!nation) return false;
    return this.gameState.getAllNations().some(n =>
      n.getId() !== nationId && nation.isAtWar(n.getId()),
    );
  }

  private checkDiplomacy(): void {
    const next = this.resolveCategory();
    if (next !== this.currentCategory) this.switchTo(next, WAR_FADE_MS);
  }

  /** Fade out current track and start a new one from the given category. */
  private switchTo(category: MusicCategory, fadeDurationMs: number): void {
    this.cancelPending();
    if (!this.currentSound) {
      this.playCategory(category);
      return;
    }
    const sound = this.currentSound;
    sound.removeAllListeners('complete');
    this.currentSound = null;
    this.fadeTween = this.scene.tweens.add({
      targets: sound as unknown as Record<string, number>,
      volume: 0,
      duration: fadeDurationMs,
      onComplete: () => {
        sound.stop();
        sound.destroy();
        this.fadeTween = null;
        this.playCategory(category);
      },
    });
  }

  private onTrackEnd(): void {
    this.currentSound = null;
    const category = this.resolveCategory();
    // 5-second gap then start the next track (feels like a gentle fade-out pause)
    this.pendingTimer = this.scene.time.delayedCall(BETWEEN_TRACKS_MS, () => {
      this.pendingTimer = null;
      this.playCategory(category);
    });
  }

  private playCategory(category: MusicCategory): void {
    this.currentCategory = category;
    const pool = TRACKS[category];
    const last = this.lastPlayed.get(category);
    const choices = pool.length > 1 ? pool.filter(k => k !== last) : pool;
    const key = choices[Math.floor(Math.random() * choices.length)]!;
    this.lastPlayed.set(category, key);
    const sound = this.scene.sound.add(key, { volume: 1.0 });
    sound.once('complete', () => this.onTrackEnd());
    sound.play();
    this.currentSound = sound;
  }

  private cancelPending(): void {
    if (this.fadeTween) { this.fadeTween.stop(); this.fadeTween = null; }
    if (this.pendingTimer) { this.pendingTimer.remove(); this.pendingTimer = null; }
  }

  public destroy(): void {
    this.cancelPending();
    if (this.currentSound) {
      this.currentSound.removeAllListeners();
      this.currentSound.stop();
      this.currentSound.destroy();
      this.currentSound = null;
    }
    this.eventBus.off('diplomacy:war-declared', this.handleWarDeclared);
    this.eventBus.off('diplomacy:peace-signed', this.handlePeaceSigned);
    this.eventBus.off('game:tick', this.handleTick);
  }
}
