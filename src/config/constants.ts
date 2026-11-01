export const TILE_SIZE = 40;
export const TICK_RATE = 10;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE; // 100ms
/** Max ticks GameScene will run back-to-back in one frame to drain a backlog. */
export const MAX_TICK_CATCHUP = 5;
/**
 * Ticks a moving unit waits behind a friendly unit that isn't about to clear the
 * tile (parked, or itself stuck) before it re-paths around it, or stops and
 * reports the blocked order if there's no way round (0.5 s at TICK_RATE=10).
 */
export const FRIENDLY_BLOCK_GRACE_TICKS = 5;
