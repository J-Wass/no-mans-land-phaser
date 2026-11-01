import { describe, it, expect } from '@jest/globals';
import { eventInvolvesNation, payloadUnitIds } from './eventInvolvement';
import type { OwnershipLookup } from './eventInvolvement';

const units: Record<string, string> = { 'my-scout': 'me', 'their-scout': 'them' };
const cities: Record<string, string> = { 'my-city': 'me', 'their-city': 'them' };
const lookup: OwnershipLookup = {
  unitOwner: (id) => units[id],
  cityOwner: (id) => cities[id],
  tileOwner: (p) => (p.row === 0 ? 'me' : p.row === 1 ? null : 'them'),
};
const mine = (payload: unknown): boolean => eventInvolvesNation(payload, 'me', lookup);
const far = { row: 5, col: 5 };

describe('eventInvolvesNation', () => {
  it('counts battle:started when my unit is unitBId (regression: unitAId/unitBId were not matched)', () => {
    expect(mine({ battleId: 'b1', unitAId: 'their-scout', unitBId: 'my-scout', position: far, tick: 2189 })).toBe(true);
    expect(mine({ battleId: 'b1', unitAId: 'my-scout', unitBId: 'their-scout', position: far, tick: 2943 })).toBe(true);
    expect(mine({ battleId: 'b1', unitAId: 'their-scout', unitBId: 'x', position: far, tick: 1 })).toBe(false);
  });

  it('counts unit:destroyed for a unit already removed when ownerNationId is mine', () => {
    expect(mine({ unitId: 'gone', byUnitId: 'their-scout', ownerNationId: 'me', position: far, tick: 1 })).toBe(true);
    expect(mine({ unitId: 'gone', byUnitId: 'their-scout', ownerNationId: 'them', position: far, tick: 1 })).toBe(false);
  });

  it('matches every nation-id and unit-id key shape', () => {
    expect(mine({ nationId1: 'them', nationId2: 'me', tick: 1 })).toBe(true);
    expect(mine({ fromNationId: 'them', toNationId: 'me', tick: 1 })).toBe(true);
    expect(mine({ battleId: 'b', winnerUnitId: 'their-scout', loserUnitId: 'my-scout', reason: 'ROUT', tick: 1 })).toBe(true);
    expect(mine({ spyUnitId: 'my-scout', ownerNationId: 'x', byNationId: 'them', byUnitId: 'their-scout', position: far, tick: 1 })).toBe(true);
    expect(mine({ siegeId: 's', unitId: 'their-scout', cityId: 'my-city', position: far, tick: 1 })).toBe(true);
  });

  it('resolves ranged-fire targets by targetType', () => {
    expect(mine({ unitId: 'their-scout', targetId: 'my-scout', targetType: 'unit', damage: 1, from: far, to: far, tick: 1 })).toBe(true);
    expect(mine({ unitId: 'their-scout', targetId: 'my-city', targetType: 'city', damage: 1, from: far, to: far, tick: 1 })).toBe(true);
    expect(mine({ unitId: 'their-scout', targetId: 'their-city', targetType: 'city', damage: 1, from: far, to: far, tick: 1 })).toBe(false);
  });

  it('counts position-only events on my land only', () => {
    expect(mine({ position: { row: 0, col: 0 }, building: 'FARM', tick: 1 })).toBe(true);
    expect(mine({ position: { row: 1, col: 0 }, building: 'FARM', tick: 1 })).toBe(false);
    expect(mine(null)).toBe(false);
    expect(eventInvolvesNation({ nationId: '' }, '', lookup)).toBe(false);
  });

  it('lists referenced unit ids for cache warming', () => {
    expect(payloadUnitIds({ unitAId: 'a', unitBId: 'b', battleId: 'x' })).toEqual(['a', 'b']);
    expect(payloadUnitIds({ unitId: 'a', targetId: 't', targetType: 'unit' })).toEqual(['a', 't']);
    expect(payloadUnitIds({ unitId: 'a', targetId: 't', targetType: 'city' })).toEqual(['a']);
  });
});
