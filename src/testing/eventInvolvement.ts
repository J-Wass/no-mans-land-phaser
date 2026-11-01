/**
 * eventInvolvement — decides whether a game-event payload involves a nation
 * (its nation id, one of its units, one of its cities, or a tile it holds).
 *
 * Pure: entity ownership comes from a lookup, so the TestHarness can back it
 * with live game state plus a cache of unit owners (units are removed from the
 * game before some of their events fire, e.g. `battle:ended` after a death).
 */

import type { GridCoordinates } from '@/types/common';

export interface OwnershipLookup {
  /** Owner nation of a unit, or undefined when unknown. */
  unitOwner(unitId: string): string | undefined;
  /** Owner nation of a city, or undefined when unknown. */
  cityOwner(cityId: string): string | undefined;
  /** Controlling nation of a tile (null = unowned), or undefined when off-map. */
  tileOwner(position: GridCoordinates): string | null | undefined;
}

/** nationId, nationId1, ownerNationId, byNationId, fromNationId, toNationId … */
const NATION_KEY = /nationid\d*$/i;
/** unitId, unitAId, unitBId, winnerUnitId, loserUnitId, byUnitId, spyUnitId … */
const UNIT_KEY = /unit[a-z]?id$/i;
/** cityId */
const CITY_KEY = /cityid$/i;

function isPosition(v: unknown): v is GridCoordinates {
  return !!v && typeof v === 'object'
    && typeof (v as GridCoordinates).row === 'number'
    && typeof (v as GridCoordinates).col === 'number';
}

/** Every unit id referenced by a payload (used to warm the owner cache). */
export function payloadUnitIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  const ids: string[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'string' && UNIT_KEY.test(k)) ids.push(v);
  }
  if (p['targetType'] === 'unit' && typeof p['targetId'] === 'string') ids.push(p['targetId']);
  return ids;
}

export function eventInvolvesNation(payload: unknown, nationId: string, lookup: OwnershipLookup): boolean {
  if (!nationId || !payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;

  for (const [k, v] of Object.entries(p)) {
    if (typeof v !== 'string') continue;
    if (NATION_KEY.test(k)) { if (v === nationId) return true; continue; }
    if (UNIT_KEY.test(k))   { if (lookup.unitOwner(v) === nationId) return true; continue; }
    if (CITY_KEY.test(k))   { if (lookup.cityOwner(v) === nationId) return true; continue; }
  }

  // Ranged fire names its target generically.
  if (typeof p['targetId'] === 'string') {
    const owner = p['targetType'] === 'unit' ? lookup.unitOwner(p['targetId'])
      : p['targetType'] === 'city' ? lookup.cityOwner(p['targetId'])
      : undefined;
    if (owner === nationId) return true;
  }

  // Position-only events (e.g. a territory building finishing) count when on the nation's land.
  if (isPosition(p['position']) && lookup.tileOwner(p['position']) === nationId) return true;

  return false;
}
