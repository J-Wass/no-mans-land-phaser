/**
 * Research tech tree.
 * Three branches: Science, Society, Arcane.
 * Source: "no mans land" spreadsheet, Progress Tree sheet.
 */

import { CONTENT_STRINGS } from '@/i18n/content';

export type TechId =
  // Society
  | 'writing' | 'hunting' | 'masonry' | 'trade' | 'education' | 'the_wheel'
  // Science
  | 'scientific_method' | 'mathematics' | 'physics' | 'chemistry' | 'biology'
  | 'animal_domestication' | 'iron_working' | 'steel_working' | 'mechanization'
  // Arcane
  | 'ancient_rituals' | 'mana_studies';

export type TechBranch = 'science' | 'society' | 'arcane';

export interface TechNode {
  id: TechId;
  name: string;
  branch: TechBranch;
  /** All must be researched before this can start. */
  requires: TechId[];
  /** Research time in game ticks (TICK_RATE=10, so 300 ticks = 30 s). */
  ticks: number;
  /** RESEARCH resource points consumed from treasury when research begins. */
  researchCost: number;
  description: string;
}

/** Global research-time multiplier applied to every tech's base duration. */
export const RESEARCH_SPEED_MULTIPLIER = 4;

// T(id, branch, requires, ticks, cost)
// ticks: BASE research duration (TICK_RATE=10 → 300 ticks = 30 s); scaled by
//        RESEARCH_SPEED_MULTIPLIER so all research takes proportionally longer.
// cost:  research-point cost paid upfront from treasury
// name/description are sourced from CONTENT_STRINGS.tech[id].
const T = (
  id: TechId, branch: TechBranch,
  requires: TechId[], ticks: number, cost: number,
): TechNode => ({
  id,
  name: CONTENT_STRINGS.tech[id].name,
  branch,
  requires,
  ticks: ticks * RESEARCH_SPEED_MULTIPLIER,
  researchCost: cost,
  description: CONTENT_STRINGS.tech[id].description,
});

/** Full tech catalog — display order within each branch is top to bottom. */
export const TECH_CATALOG: TechNode[] = [
  // ── Society ──────────────────────────────────────────────────────────────────
  T('writing',              'society', [],                                     300,  25),
  T('hunting',              'society', [],                                     300,  25),
  T('masonry',              'society', [],                                     300,  25),
  T('trade',                'society', ['writing'],                            450, 50),
  T('education',            'society', ['writing'],                            450, 50),
  T('the_wheel',            'society', ['masonry'],                            450, 50),

  // ── Science ──────────────────────────────────────────────────────────────────
  T('scientific_method',    'science', [],                                     300,  25),
  T('mathematics',          'science', [],                                     300,  25),
  T('chemistry',            'science', ['scientific_method'],                  450, 50),
  T('biology',              'science', ['scientific_method'],                  450, 50),
  T('physics',              'science', ['scientific_method', 'mathematics'],   600, 75),
  T('animal_domestication', 'science', ['biology'],                           600, 75),
  T('iron_working',         'science', ['chemistry', 'physics'],               750, 100),
  T('mechanization',        'science', ['iron_working'],                       750, 100),
  T('steel_working',        'science', ['iron_working'],                       900, 125),

  // ── Arcane ───────────────────────────────────────────────────────────────────
  T('ancient_rituals',      'arcane',  ['hunting', 'masonry'],                600, 75),
  T('mana_studies',         'arcane',  ['ancient_rituals', 'physics'],         750, 100),
];

export const TECH_MAP = new Map<TechId, TechNode>(TECH_CATALOG.map(t => [t.id, t]));
