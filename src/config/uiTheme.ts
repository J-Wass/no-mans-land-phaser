/**
 * Shared UI color palette for all overlay / modal scenes.
 * Import and destructure to keep scene code clean:
 *   import { UI } from '@/config/uiTheme';
 *   const { BG, PANEL, ACCENT, ... } = UI;
 */

export const UI = {
  // ── Backgrounds ─────────────────────────────────────────────────────────────
  BG:      0x06071a,   // semi-transparent backdrop (deep navy, not black)
  PANEL:   0x181b30,   // main panel fill — lighter slate navy
  HEADER:  0x1e2248,   // header bar fill

  // ── Interactive ──────────────────────────────────────────────────────────────
  ACCENT:  0x5577ff,   // border / highlight colour — cleaner blue
  BTN:     0x222644,   // normal button fill
  BTN_HOV: 0x2e3464,   // button hover fill
  RED_BTN: 0x501e1e,   // close / cancel button
  RED_H:   0x922828,   // close / cancel hover

  // ── Text ─────────────────────────────────────────────────────────────────────
  DIM:    '#8a8aaa',   // secondary / muted text — noticeably lighter than before
  LT:     '#eeeeff',   // primary light text
  WHITE:  '#ffffff',
  GOLD_C: '#ffd700',
} as const;
