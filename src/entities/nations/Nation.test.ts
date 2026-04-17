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
    expect(nation1.isAIControlled()).toBe(false);
    expect(nation1.getControlledBy()).toBe(null);
  });

  it('should start with empty treasury', () => {
    const treasury = nation1.getTreasury();
    expect(treasury.getAmount(ResourceType.GOLD)).toBe(0);
    expect(treasury.getAmount(ResourceType.FOOD)).toBe(0);
    expect(treasury.getAmount(ResourceType.RAW_MATERIAL)).toBe(0);
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

  it('should support player assignment', () => {
    nation1.setControlledBy('player-1');
    expect(nation1.getControlledBy()).toBe('player-1');
  });

  it('should serialize to JSON', () => {
    nation1.getTreasury().addResource(ResourceType.FOOD, 50);
    nation1.declareWar(nation2.getId());
    const json = nation1.toJSON();
    expect(json.name).toBe('Empire of Rome');
    expect(json.treasury[ResourceType.FOOD]).toBe(50);
    expect(json.relations[nation2.getId()]).toBe(DiplomaticStatus.WAR);
  });

  describe('research', () => {
    it('starts idle with no current research', () => {
      expect(nation1.getCurrentResearch()).toBeNull();
    });

    it('starts research and tracks state', () => {
      nation1.startResearch('masonry', 10);
      const cr = nation1.getCurrentResearch();
      expect(cr).not.toBeNull();
      expect(cr!.techId).toBe('masonry');
      expect(cr!.ticksTotal).toBe(10);
      expect(cr!.ticksRemaining).toBe(10);
    });

    it('completes research after ticking down', () => {
      nation1.startResearch('masonry', 3);
      nation1.tickResearch();
      nation1.tickResearch();
      const completed = nation1.tickResearch();
      expect(completed).toBe('masonry');
      expect(nation1.hasResearched('masonry')).toBe(true);
      expect(nation1.getCurrentResearch()).toBeNull();
    });

    it('returns null from tickResearch when idle', () => {
      expect(nation1.tickResearch()).toBeNull();
    });

    it('cancels in-progress research', () => {
      nation1.startResearch('masonry', 10);
      nation1.cancelResearch();
      expect(nation1.getCurrentResearch()).toBeNull();
      expect(nation1.hasResearched('masonry')).toBe(false);
    });

    it('canResearch returns true for root techs with no prerequisites', () => {
      expect(nation1.canResearch('masonry')).toBe(true);
    });

    it('canResearch returns false when prerequisite is not met', () => {
      // 'trade' requires 'writing'
      expect(nation1.canResearch('trade')).toBe(false);
    });

    it('canResearch returns true once prerequisite is researched', () => {
      nation1.startResearch('writing', 1);
      nation1.tickResearch();
      expect(nation1.canResearch('trade')).toBe(true);
    });

    it('canResearch returns false for already-researched tech', () => {
      nation1.startResearch('masonry', 1);
      nation1.tickResearch();
      expect(nation1.canResearch('masonry')).toBe(false);
    });
  });
});
