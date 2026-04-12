import { describe, it, expect, beforeEach } from '@jest/globals';
import { Nation } from './Nation';
import { DiplomaticStatus } from '@/types/diplomacy';
import { ResourceType } from '@/systems/resources/ResourceType';

describe('Nation', () => {
  let nation1: Nation;
  let nation2: Nation;

  beforeEach(() => {
    nation1 = new Nation('nation-1', 'Empire of Rome', '#FF0000', false);
    nation2 = new Nation('nation-2', 'Kingdom of Persia', '#0000FF', false);
  });

  it('should initialize with correct data', () => {
    expect(nation1.getName()).toBe('Empire of Rome');
    expect(nation1.getColor()).toBe('#FF0000');
    expect(nation1.isAI()).toBe(false);
  });

  it('should start with empty treasury', () => {
    const treasury = nation1.getTreasury();
    expect(treasury.getAmount(ResourceType.GOLD)).toBe(0);
  });

  it('should default to neutral relations', () => {
    expect(nation1.getRelation(nation2.getId())).toBe(DiplomaticStatus.NEUTRAL);
  });

  it('should set relations correctly', () => {
    nation1.declareWar(nation2.getId());
    expect(nation1.isAtWar(nation2.getId())).toBe(true);
  });

  it('should form alliances', () => {
    nation1.formAlliance(nation2.getId());
    expect(nation1.isAlly(nation2.getId())).toBe(true);
  });

  it('should establish trade agreements', () => {
    nation1.establishTrade(nation2.getId());
    expect(nation1.hasTradeAgreement(nation2.getId())).toBe(true);
  });

  it('should make peace', () => {
    nation1.declareWar(nation2.getId());
    expect(nation1.isAtWar(nation2.getId())).toBe(true);

    nation1.makePeace(nation2.getId());
    expect(nation1.getRelation(nation2.getId())).toBe(DiplomaticStatus.NEUTRAL);
  });

  it('should manage treasury', () => {
    const treasury = nation1.getTreasury();
    treasury.addResource(ResourceType.GOLD, 1000);

    expect(treasury.getAmount(ResourceType.GOLD)).toBe(1000);
  });
});
