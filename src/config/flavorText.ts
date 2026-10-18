/**
 * Flavor-text quotes shown as a hover tooltip on units and techs in the build /
 * research menus. Purely cosmetic — no gameplay effect.
 *
 * (Kept as a small central map so it's easy to localize later.)
 */

import { UnitType } from '@/entities/units/Unit';
import type { TechId } from '@/systems/research/TechTree';

/** Quote shown when hovering a unit in the production menu. */
export const UNIT_FLAVOR: Partial<Record<UnitType, string>> = {
  [UnitType.SCOUT]:          `"One must talk little and listen much." — West African Proverb`,
  [UnitType.INFANTRY]:       `"You are about to embark upon the Great Crusade! I have full confidence in your courage, and Good Luck!" — Dwight D. Eisenhower (American Military General)`,
  [UnitType.LONGBOWMAN]:     `"Even the straightest arrow cannot reach the target if the bow is weak." — Joseph M. Marshall III (Lakota Storyteller)`,
  [UnitType.HEAVY_INFANTRY]: `"What stands in the way becomes the way." — Marcus Aurelius (Roman Emperor)`,
  [UnitType.CAVALRY]:        `"Speed is the essence of war." — Sun Tzu (Chinese Military General)`,
  [UnitType.CATAPULT]:       `"It is from their foes, not their friends, that cities learn the lesson of building high walls." — Aristophanes (Greek Playwright)`,
  [UnitType.TREBUCHET]:      `"Give me a place to stand, and I shall move the earth." — Archimedes (Greek Mathematician)`,
};

/** Quote shown when hovering a tech in the research menu. */
export const TECH_FLAVOR: Record<TechId, string> = {
  scientific_method:    `"The authority of a thousand is not worth the humble reasoning of a single individual." — Galileo Galilei (Italian Physicist)`,
  mathematics:          `"God made the integers; all else is the work of man." — Leopold Kronecker (German Mathematician)`,
  physics:              `"If I have seen further, it is by standing on the shoulders of giants." — Isaac Newton (English Physicist)`,
  chemistry:            `"Nothing is lost, nothing is created, everything is transformed." — Antoine Lavoisier (French Chemist)`,
  biology:              `"If you don't take care of this land today, tomorrow you will have rocks, not soil." — Wangari Maathai (Kenyan Environmentalist)`,
  animal_domestication: `"Trust in God, but tie your camel." — Prophet Muhammad (Hadith, Sunan al-Tirmidhī)`,
  iron_working:         `"As iron sharpens iron, so one man sharpens another." — Hebrew Bible, Proverbs 27:17`,
  steel_working:        `"Thus he formed the steel from iron." — Kalevala`,
  mechanization:        `"The machine does not isolate man from the great problems of nature, but plunges him more deeply into them." — Antoine de Saint-Exupéry (French Author)`,
  writing:              `"The written word remains." — Latin Proverb`,
  hunting:              `"Chase two rabbits — lose them both." — Unknown`,
  masonry:              `"We shape our buildings; thereafter they shape us." — Winston Churchill (British Prime Minister)`,
  trade:                `"The real price of everything is the toil and trouble of acquiring it." — Adam Smith (Scottish Economist)`,
  education:            `"Study the old, and discover the new." — Confucius (Chinese Scholar)`,
  the_wheel:            `"Give me enough chewing tobacco and TNT, and I'll build a railroad to hell!" — Michael James Heney (American Railroad Builder)`,
  ancient_rituals:      `"When the roots are deep, there is no reason to fear the wind." — Swahili Proverb`,
  mana_studies:         `"Ask the right questions, and nature will open the doors to her secrets." — C. V. Raman (Indian Physicist)`,
};

/** Look up a unit's flavor quote from a production-catalog id (e.g. "unit:SCOUT"). */
export function unitFlavorById(catalogId: string): string | undefined {
  const type = catalogId.replace(/^unit:/, '') as UnitType;
  return UNIT_FLAVOR[type];
}
