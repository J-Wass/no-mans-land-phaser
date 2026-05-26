/**
 * Research tech tree.
 * Three branches: Science, Society, Arcane.
 * Source: "no mans land" spreadsheet, Progress Tree sheet.
 */

export type TechId =
  // Society
  | 'writing' | 'hunting' | 'masonry' | 'trade' | 'education' | 'the_wheel'
  // Science
  | 'scientific_method' | 'mathematics' | 'physics' | 'chemistry' | 'biology'
  | 'animal_domestication' | 'iron_working' | 'steel_working' | 'mechanization' | 'kinematics'
  // Arcane
  | 'ancient_rituals' | 'mana_studies' | 'the_elements';

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

// T(id, name, branch, requires, ticks, cost, description)
// ticks: BASE research duration (TICK_RATE=10 → 300 ticks = 30 s); scaled by
//        RESEARCH_SPEED_MULTIPLIER so all research takes proportionally longer.
// cost:  research-point cost paid upfront from treasury
const T = (
  id: TechId, name: string, branch: TechBranch,
  requires: TechId[], ticks: number, cost: number, description: string,
): TechNode => ({ id, name, branch, requires, ticks: ticks * RESEARCH_SPEED_MULTIPLIER, researchCost: cost, description });

/** Full tech catalog — display order within each branch is top to bottom. */
export const TECH_CATALOG: TechNode[] = [
  // ── Society ──────────────────────────────────────────────────────────────────
  T('writing',              'Writing',              'society', [],                                     300,  5, 'Leads to Trade and Education.'),
  T('hunting',              'Hunting',              'society', [],                                     300,  5, 'Leads to Ancient Rituals.'),
  T('masonry',              'Masonry',              'society', [],                                     300,  5, 'Leads to The Wheel and Ancient Rituals.'),
  T('trade',                'Trade',                'society', ['writing'],                            450, 10, 'Improves your commerce income.'),
  T('education',            'Education',            'society', ['writing'],                            450, 10, 'Boosts your research output.'),
  T('the_wheel',            'The Wheel',            'society', ['masonry'],                            450, 10, 'Leads to siege weapons.'),

  // ── Science ──────────────────────────────────────────────────────────────────
  T('scientific_method',    'Scientific Method',    'science', [],                                     300,  5, 'Leads to Chemistry, Biology, and Physics.'),
  T('mathematics',          'Mathematics',          'science', [],                                     300,  5, 'Leads to Physics.'),
  T('chemistry',            'Chemistry',            'science', ['scientific_method'],                  450, 10, 'Leads to Iron Working and The Elements.'),
  T('biology',              'Biology',              'science', ['scientific_method'],                  450, 10, 'Leads to Animal Domestication.'),
  T('physics',              'Physics',              'science', ['scientific_method', 'mathematics'],   600, 15, 'Leads to Iron Working, Mana Studies, and Kinematics.'),
  T('animal_domestication', 'Animal Domestication', 'science', ['biology'],                           600, 15, 'Leads to mounted units.'),
  T('iron_working',         'Iron Working',         'science', ['chemistry', 'physics'],               750, 20, 'Leads to Mechanization and Steel Working.'),
  T('mechanization',        'Mechanization',        'science', ['iron_working'],                       750, 20, 'Leads to advanced ranged units.'),
  T('steel_working',        'Steel Working',        'science', ['iron_working'],                       900, 25, 'Leads to the finest weapons.'),
  T('kinematics',           'Kinematics',           'science', ['physics'],                            600, 15, '+3 ranged damage for Catapult and Trebuchet.'),

  // ── Arcane ───────────────────────────────────────────────────────────────────
  T('ancient_rituals',      'Ancient Rituals',      'arcane',  ['hunting', 'masonry'],                600, 15, 'Leads to Mana Studies.'),
  T('mana_studies',         'Mana Studies',         'arcane',  ['ancient_rituals', 'physics'],         750, 20, 'Leads to The Elements.'),
  T('the_elements',         'The Elements',         'arcane',  ['mana_studies', 'chemistry'],          900, 25, 'Mastery of elemental magic.'),
];

export const TECH_MAP = new Map<TechId, TechNode>(TECH_CATALOG.map(t => [t.id, t]));
