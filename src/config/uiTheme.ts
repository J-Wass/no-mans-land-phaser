/**
 * Shared UI color palette for all overlay / modal scenes.
 * Import and destructure to keep scene code clean:
 *   import { UI } from '@/config/uiTheme';
 *   const { BG, PANEL, ACCENT, ... } = UI;
 */

export const UI = {
  // ── Backgrounds ─────────────────────────────────────────────────────────────
  BG:      0x000000,   // semi-transparent backdrop
  PANEL:   0x12122a,   // main panel fill
  HEADER:  0x1e1e42,   // header bar fill

  // ── Interactive ──────────────────────────────────────────────────────────────
  ACCENT:  0x5544cc,   // border / highlight colour
  BTN:     0x1e1e40,   // normal button fill
  BTN_HOV: 0x2e2e60,   // button hover fill
  RED_BTN: 0x441818,   // close / cancel button
  RED_H:   0x882222,   // close / cancel hover

  // ── Text ─────────────────────────────────────────────────────────────────────
  DIM:    '#666688',
  LT:     '#e0e0ff',
  WHITE:  '#ffffff',
  GOLD_C: '#ffd700',
} as const;
