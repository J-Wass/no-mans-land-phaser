import { describe, it, expect } from '@jest/globals';
import { CONTENT_STRINGS } from './content';
import { STRINGS } from './strings';
import { UnitType } from '@/entities/units/Unit';
import { CityBuildingType } from '@/systems/territory/CityBuilding';
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import { TECH_CATALOG } from '@/systems/research/TechTree';

// Guards against a missing entry in CONTENT_STRINGS — important because the
// building maps are typed with `as` casts (to dodge import cycles), so an
// omission would not be caught by the compiler.
describe('i18n CONTENT_STRINGS completeness', () => {
  it('has label + detail for every unit type', () => {
    for (const t of Object.values(UnitType)) {
      expect(CONTENT_STRINGS.units[t]?.label).toBeTruthy();
      expect(CONTENT_STRINGS.units[t]?.detail).toBeTruthy();
    }
  });

  it('has name + description for every tech', () => {
    for (const node of TECH_CATALOG) {
      expect(CONTENT_STRINGS.tech[node.id]?.name).toBeTruthy();
      expect(CONTENT_STRINGS.tech[node.id]?.description).toBeTruthy();
    }
  });

  it('has label + perks for every city building', () => {
    for (const t of Object.values(CityBuildingType)) {
      expect(CONTENT_STRINGS.cityBuildings[t]?.label).toBeTruthy();
      expect(CONTENT_STRINGS.cityBuildings[t]?.perks).toBeTruthy();
    }
  });

  it('has label + perks for every territory building', () => {
    for (const t of Object.values(TerritoryBuildingType)) {
      expect(CONTENT_STRINGS.territoryBuildings[t]?.label).toBeTruthy();
      expect(CONTENT_STRINGS.territoryBuildings[t]?.perks).toBeTruthy();
    }
  });

  it('preserves known string values verbatim', () => {
    expect(CONTENT_STRINGS.units[UnitType.INFANTRY]?.label).toBe('Infantry');
    expect(CONTENT_STRINGS.tech['masonry']?.name).toBe('Masonry');
  });

  it('barrel exposes every string domain', () => {
    expect(STRINGS.content).toBe(CONTENT_STRINGS);
    expect(STRINGS.hud).toBeDefined();
    expect(STRINGS.modals).toBeDefined();
    expect(STRINGS.menu).toBeDefined();
  });
});
