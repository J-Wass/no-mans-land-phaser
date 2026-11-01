import { describe, it, expect, beforeEach } from '@jest/globals';
import { checkInvariants } from './invariants';
import type { InvariantContext } from './invariants';
import { GameState } from '@/managers/GameState';
import { Nation } from '@/entities/nations/Nation';
import { City } from '@/entities/cities/City';
import { Infantry } from '@/entities/units/Infantry';
import { TerrainType } from '@/systems/grid/Territory';
import { ResourceType } from '@/systems/resources/ResourceType';
import type { SavedBattleState } from '@/types/gameSetup';

describe('checkInvariants', () => {
  let gameState: GameState;

  const ctx = (overrides: Partial<InvariantContext> = {}): InvariantContext => ({
    gameState, battles: [], sieges: [], territoryBattles: [], movingUnitIds: [], ...overrides,
  });
  const rules = (c: InvariantContext): string[] => checkInvariants(c).map(v => v.rule);

  const battle = (unitAId: string, unitBId: string): SavedBattleState => ({
    id: 'b1', unitAId, unitBId, position: { row: 1, col: 1 }, attackerId: unitAId,
    attackerOrigin: { row: 1, col: 0 }, defenderOrigin: { row: 1, col: 1 },
    ticksUntilRound: 5, roundsElapsed: 0, startedAtTick: 0,
  });

  beforeEach(() => {
    gameState = new GameState({ rows: 6, cols: 6 }, 1);
    gameState.addNation(new Nation('n1', 'Red', '#f00'));
    gameState.addNation(new Nation('n2', 'Blue', '#00f'));
    gameState.addCity(new City('c1', 'Redville', 'n1', { row: 0, col: 0 }));
    gameState.addUnit(new Infantry('u1', 'n1', { row: 1, col: 0 }));
    gameState.addUnit(new Infantry('u2', 'n2', { row: 1, col: 1 }));
  });

  it('reports nothing for a consistent game', () => {
    expect(checkInvariants(ctx())).toEqual([]);
  });

  it('flags a unit stuck in engagedInBattle with no combat record', () => {
    gameState.getUnit('u1')!.setEngagedInBattle(true);
    expect(rules(ctx())).toContain('engaged-without-battle');
  });

  it('accepts an engaged unit that is in a battle', () => {
    gameState.getNation('n1')!.declareWar('n2');
    gameState.getNation('n2')!.declareWar('n1');
    gameState.getUnit('u1')!.setEngagedInBattle(true);
    gameState.getUnit('u2')!.setEngagedInBattle(true);
    expect(checkInvariants(ctx({ battles: [battle('u1', 'u2')] }))).toEqual([]);
  });

  it('flags a battle between nations that are not at war', () => {
    gameState.getUnit('u1')!.setEngagedInBattle(true);
    gameState.getUnit('u2')!.setEngagedInBattle(true);
    expect(rules(ctx({ battles: [battle('u1', 'u2')] }))).toContain('battle-without-war');
  });

  it('flags a battle that references a unit no longer on the map', () => {
    expect(rules(ctx({ battles: [battle('u1', 'ghost')] }))).toContain('battle-missing-unit');
  });

  it('flags units belonging to a nation that no longer exists', () => {
    gameState.addUnit(new Infantry('u3', 'n9', { row: 3, col: 3 }));
    expect(rules(ctx())).toContain('orphan-unit');
  });

  it('warns about a unit on water without water mana', () => {
    gameState.getGrid().getTerritory({ row: 1, col: 0 })!.setTerrainType(TerrainType.WATER);
    const found = checkInvariants(ctx()).find(v => v.rule === 'unit-on-impassable');
    expect(found?.severity).toBe('warn');
  });

  it('flags negative resources', () => {
    gameState.getNation('n1')!.getTreasury().addResource(ResourceType.FOOD, -5);
    expect(rules(ctx())).toContain('negative-resource');
  });

  it('flags a city whose tile is controlled by another nation', () => {
    gameState.getGrid().getTerritory({ row: 0, col: 0 })!.setControllingNation('n2');
    expect(rules(ctx())).toContain('city-tile-owner');
  });

  it('flags one-sided diplomatic relations', () => {
    gameState.getNation('n1')!.declareWar('n2');
    expect(rules(ctx())).toContain('asymmetric-relation');
  });

  it('flags non-finite numbers anywhere in the state', () => {
    gameState.getUnit('u1')!.setMorale(Number.NaN);
    expect(rules(ctx())).toContain('non-finite-number');
  });

  it('flags movement orders for units that no longer exist', () => {
    expect(rules(ctx({ movingUnitIds: ['ghost'] }))).toContain('movement-for-missing-unit');
  });
});
