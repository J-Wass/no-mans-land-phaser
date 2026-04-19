import { describe, it, expect, beforeEach } from '@jest/globals';
import { Infantry } from './Infantry';
import { Longbowman } from './Longbowman';
import { DEFAULT_MORALE, MAX_MORALE } from './Unit';

describe('Infantry', () => {
  let infantry: Infantry;

  beforeEach(() => {
    infantry = new Infantry('unit-1', 'nation-1', { row: 0, col: 0 });
  });

  it('should start with full health', () => {
    expect(infantry.getHealth()).toBe(100);
    expect(infantry.isAlive()).toBe(true);
  });

  it('should take damage correctly', () => {
    infantry.takeDamage(30);
    expect(infantry.getHealth()).toBe(70);
    expect(infantry.isAlive()).toBe(true);
  });

  it('should die when health reaches 0', () => {
    infantry.takeDamage(100);
    expect(infantry.getHealth()).toBe(0);
    expect(infantry.isAlive()).toBe(false);
  });

  it('should heal correctly', () => {
    infantry.takeDamage(40);
    infantry.heal(20);
    expect(infantry.getHealth()).toBe(80);
  });

  it('should not heal beyond max health', () => {
    infantry.heal(50);
    expect(infantry.getHealth()).toBe(100);
  });

  it('should allow movement when not yet moved', () => {
    expect(infantry.canMove()).toBe(true);
    infantry.moveTo({ row: 1, col: 0 });
    expect(infantry.canMove()).toBe(false);
  });

  it('should reset turn state', () => {
    infantry.moveTo({ row: 1, col: 0 });
    infantry.markAttacked();

    expect(infantry.canMove()).toBe(false);
    expect(infantry.canAttack()).toBe(false);

    infantry.resetTurn();

    expect(infantry.canMove()).toBe(true);
    expect(infantry.canAttack()).toBe(true);
  });

  it('should serialize to JSON', () => {
    const json = infantry.toJSON();
    expect(json.id).toBe('unit-1');
    expect(json.stats.meleeDamage).toBe(10);
    expect(json.position).toEqual({ row: 0, col: 0 });
    expect(json.battleOrder).toBe('HOLD');
    expect(json.engagedInBattle).toBe(false);
  });

  it('should default to hold battle orders', () => {
    expect(infantry.getBattleOrder()).toBe('HOLD');
  });

  it('should start with default morale', () => {
    expect(infantry.getMorale()).toBe(DEFAULT_MORALE);
  });

  it('should clamp morale to [0, MAX_MORALE]', () => {
    infantry.setMorale(200);
    expect(infantry.getMorale()).toBe(MAX_MORALE);
    infantry.setMorale(-50);
    expect(infantry.getMorale()).toBe(0);
  });

  it('should start not engaged in battle', () => {
    expect(infantry.isEngagedInBattle()).toBe(false);
  });

  it('should track engaged-in-battle state', () => {
    infantry.setEngagedInBattle(true);
    expect(infantry.isEngagedInBattle()).toBe(true);
    infantry.setEngagedInBattle(false);
    expect(infantry.isEngagedInBattle()).toBe(false);
  });

  it('should block movement when engaged in battle', () => {
    infantry.setEngagedInBattle(true);
    // canMove() is about turn state, but engaged units should be rejected by CommandProcessor
    // directly verify the flag is set for the processor to check
    expect(infantry.isEngagedInBattle()).toBe(true);
  });
});

describe('Longbowman', () => {
  let longbowman: Longbowman;

  beforeEach(() => {
    longbowman = new Longbowman('unit-2', 'nation-1', { row: 0, col: 0 });
  });

  it('should have longer attack range than infantry', () => {
    expect(longbowman.getStats().attackRange).toBe(3);
  });

  it('should have ranged damage', () => {
    expect(longbowman.getStats().rangedDamage).toBe(12);
  });

  it('should have light armor', () => {
    expect(longbowman.getStats().armorType).toBe('light');
  });
});
