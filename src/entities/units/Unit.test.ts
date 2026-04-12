import { describe, it, expect, beforeEach } from '@jest/globals';
import { Infantry } from './Infantry';
import { Archer } from './Archer';

describe('Infantry', () => {
  let infantry: Infantry;

  beforeEach(() => {
    infantry = new Infantry('unit-1', 'nation-1', { row: 0, col: 0 });
  });

  it('should initialize with correct stats', () => {
    const stats = infantry.getStats();
    expect(stats.maxHealth).toBe(100);
    expect(stats.attack).toBe(15);
    expect(stats.defense).toBe(10);
    expect(stats.movement).toBe(2);
    expect(stats.range).toBe(1);
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
});

describe('Archer', () => {
  let archer: Archer;

  beforeEach(() => {
    archer = new Archer('unit-2', 'nation-1', { row: 0, col: 0 });
  });

  it('should have longer range than infantry', () => {
    const stats = archer.getStats();
    expect(stats.range).toBe(3);
  });

  it('should have less health than infantry', () => {
    expect(archer.getMaxHealth()).toBe(70);
  });
});
