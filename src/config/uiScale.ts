/**
 * Canonical responsive UI-scale formula.
 *
 * The DOM overlay (UIManager) and the rexUI/Phaser modal helpers (rexUiHelpers)
 * previously each re-derived the same `clamp(shortSide / 900, 0.82, 1.42)`
 * expression. This is the single source of truth for that formula so the HTML
 * and canvas modal layers stay in lockstep.
 *
 * Note: the always-on canvas HUD (UIScene) deliberately uses a different, wider
 * range tuned for a full-screen layout and is intentionally NOT routed here.
 */

export const UI_SCALE_REFERENCE = 900;
export const UI_SCALE_MIN = 0.82;
export const UI_SCALE_MAX = 1.42;

/** Responsive scale factor derived from the viewport's short side. */
export function computeUiScale(shortSide: number): number {
  return Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, shortSide / UI_SCALE_REFERENCE));
}
