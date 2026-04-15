/**
 * Research tech tree.
 * Three branches: Science, Society, Arcane.
 * Source: "no mans land" spreadsheet, Progress Tree sheet.
 */

export type TechId =
  // Society
  | 'writing' | 'hunting' | 'masonry' | 'trade' | 'education' | 'law' | 'the_wheel'
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
  description: string;
}

const T = (
  id: TechId, name: string, branch: TechBranch,
  requires: TechId[], ticks: number, description: string,
): TechNode => ({ id, name, branch, requires, ticks, description });

/** Full tech catalog — display order within each branch is top to bottom. */
export const TECH_CATALOG: TechNode[] = [
  // ── Society ──────────────────────────────────────────────────────────────────
  T('writing',              'Writing',              'society', [],                                    10, 'Unlocks Trade, Education, Law'),
  T('hunting',              'Hunting',              'society', [],                                    10, 'Unlocks Longbowman; req. for Ancient Rituals'),
  T('masonry',              'Masonry',              'society', [],                                    10, 'Unlocks Barracks, Walls, Farms, Workshop, Fort, Copper Mine'),
  T('trade',                'Trade',                'society', ['writing'],                           15, 'Unlocks Market (city)'),
  T('education',            'Education',            'society', ['writing'],                           15, 'Unlocks School (city)'),
  T('law',                  'Law',                  'society', ['writing'],                           15, 'Unlocks Courthouse; contributes to The Elements'),
  T('the_wheel',            'The Wheel',            'society', ['masonry'],                           20, 'Contributes to Catapult & Trebuchet'),

  // ── Science ──────────────────────────────────────────────────────────────────
  T('scientific_method',    'Scientific Method',    'science', [],                                    10, 'Foundation of the science branch'),
  T('mathematics',          'Mathematics',          'science', [],                                    10, 'Contributes to Physics'),
  T('chemistry',            'Chemistry',            'science', ['scientific_method'],                 15, 'Contributes to Iron Working & The Elements'),
  T('biology',              'Biology',              'science', ['scientific_method'],                 15, 'Unlocks Animal Domestication'),
  T('physics',              'Physics',              'science', ['scientific_method', 'mathematics'],  20, 'Unlocks Castle; contributes to Iron Working'),
  T('animal_domestication', 'Animal Domestication', 'science', ['biology'],                          20, 'Unlocks Cavalry'),
  T('iron_working',         'Iron Working',         'science', ['chemistry', 'physics'],              25, 'Unlocks Heavy Infantry, Iron Mine'),
  T('mechanization',        'Mechanization',        'science', ['iron_working'],                      25, 'Unlocks Crossbowman & Trebuchet'),
  T('steel_working',        'Steel Working',        'science', ['iron_working'],                      30, 'Unlocks Fire Glass Mine & Trebuchet'),
  T('kinematics',           'Kinematics',           'science', ['physics'],                           20, 'Improves siege weapon accuracy'),

  // ── Arcane ───────────────────────────────────────────────────────────────────
  T('ancient_rituals',      'Ancient Rituals',      'arcane',  ['hunting', 'masonry'],               20, 'Foundation of the arcane branch'),
  T('mana_studies',         'Mana Studies',         'arcane',  ['ancient_rituals', 'physics'],        25, 'Unlocks Mana Mine (territory)'),
  T('the_elements',         'The Elements',         'arcane',  ['mana_studies', 'chemistry', 'law'], 30, 'Unlocks Seer Tower; advanced elemental mastery'),
];

export const TECH_MAP = new Map<TechId, TechNode>(TECH_CATALOG.map(t => [t.id, t]));
