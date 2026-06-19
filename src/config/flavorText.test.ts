import { describe, it, expect } from '@jest/globals';
import { TECH_FLAVOR, UNIT_FLAVOR, unitFlavorById } from './flavorText';
import { TECH_CATALOG } from '@/systems/research/TechTree';
import { UnitType } from '@/entities/units/Unit';

describe('flavorText', () => {
  it('has a quote for every tech in the catalog', () => {
    for (const node of TECH_CATALOG) {
      expect(TECH_FLAVOR[node.id]).toBeTruthy();
    }
  });

  it('covers the combat/recon units (Crossbowman intentionally has none yet)', () => {
    const expected = [
      UnitType.SCOUT, UnitType.INFANTRY, UnitType.LONGBOWMAN, UnitType.HEAVY_INFANTRY,
      UnitType.CAVALRY, UnitType.CATAPULT, UnitType.TREBUCHET,
    ];
    for (const t of expected) expect(UNIT_FLAVOR[t]).toBeTruthy();
    expect(UNIT_FLAVOR[UnitType.CROSSBOWMAN]).toBeUndefined();
  });

  it('looks up unit flavor by production-catalog id', () => {
    expect(unitFlavorById('unit:CAVALRY')).toBe(UNIT_FLAVOR[UnitType.CAVALRY]);
    expect(unitFlavorById('unit:CROSSBOWMAN')).toBeUndefined();
  });
});
