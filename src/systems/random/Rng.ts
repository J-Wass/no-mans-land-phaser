/**
 * Rng — a small, fast, fully deterministic pseudo-random generator (mulberry32).
 *
 * Determinism is the foundation of lockstep multiplayer: given identical state
 * and an identical command stream, every client must produce an identical
 * simulation. `Math.random()` cannot guarantee that, so every randomness source
 * inside the per-tick simulation draws from a single shared Rng owned by
 * GameState. The generator's `state` is part of the authoritative game state and
 * is serialized with the save, so reloading (or joining late from a snapshot)
 * resumes the exact same sequence.
 *
 * Presentation-only randomness (e.g. music track selection) must NOT use this —
 * it would advance the shared stream and desync clients.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Force into an unsigned 32-bit integer; avoid the degenerate 0 state.
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  /** Next float in [0, 1). */
  public next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, maxExclusive). */
  public nextInt(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** Integer in [min, max] inclusive. */
  public nextRange(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /**
   * A bound `() => number` closure over this generator. Systems that only need a
   * float source accept `() => number`; passing `rng.fn()` shares the one stream.
   */
  public fn(): () => number {
    return () => this.next();
  }

  /** In-place Fisher-Yates shuffle using this generator. */
  public shuffle<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
  }

  /** Current generator state — serialize this to resume the exact sequence. */
  public getState(): number {
    return this.state;
  }

  /** Restore generator state from a serialized snapshot. */
  public setState(state: number): void {
    this.state = state >>> 0;
  }

  /** Pick a fresh, hard-to-predict seed. Called once by whoever authors a new game. */
  public static randomSeed(): number {
    return (Math.random() * 0x100000000) >>> 0;
  }
}
