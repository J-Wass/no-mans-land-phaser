/**
 * Central index of all user-facing strings, kept here so the game can be
 * localized later without hunting through scenes, modals, and catalogs.
 *
 * Each domain lives in its own module under `src/i18n/`; this barrel aggregates
 * them under a single `STRINGS` object and re-exports the per-domain consts and
 * the flavor-text maps for direct import.
 */

import { CONTENT_STRINGS } from './content';
import { HUD_STRINGS } from './hud';
import { MODAL_STRINGS } from './modals';
import { MENU_STRINGS } from './menu';

export { CONTENT_STRINGS } from './content';
export { HUD_STRINGS } from './hud';
export { MODAL_STRINGS } from './modals';
export { MENU_STRINGS } from './menu';
export { UNIT_FLAVOR, TECH_FLAVOR, unitFlavorById } from '@/config/flavorText';

/** All user-facing strings, grouped by domain. */
export const STRINGS = {
  content: CONTENT_STRINGS,
  hud:     HUD_STRINGS,
  modals:  MODAL_STRINGS,
  menu:    MENU_STRINGS,
} as const;
