import { describe, it, expect, beforeEach } from '@jest/globals';
import { ResourceStorage, ResourceType } from './ResourceType';

describe('ResourceStorage', () => {
  let storage: ResourceStorage;

  beforeEach(() => {
    storage = new ResourceStorage();
  });

  it('should initialize all resources to 0', () => {
    expect(storage.getAmount(ResourceType.GOLD)).toBe(0);
    expect(storage.getAmount(ResourceType.FOOD)).toBe(0);
    expect(storage.getAmount(ResourceType.RAW_MATERIAL)).toBe(0);
    expect(storage.getAmount(ResourceType.HAPPINESS)).toBe(0);
    expect(storage.getAmount(ResourceType.RESEARCH)).toBe(0);
  });

  it('should add resources correctly', () => {
    storage.addResource(ResourceType.GOLD, 100);
    expect(storage.getAmount(ResourceType.GOLD)).toBe(100);

    storage.addResource(ResourceType.GOLD, 50);
    expect(storage.getAmount(ResourceType.GOLD)).toBe(150);
  });

  it('should remove resources correctly', () => {
    storage.addResource(ResourceType.RAW_MATERIAL, 100);
    const removed = storage.removeResource(ResourceType.RAW_MATERIAL, 30);

    expect(removed).toBe(true);
    expect(storage.getAmount(ResourceType.RAW_MATERIAL)).toBe(70);
  });

  it('should not remove resources if insufficient', () => {
    storage.addResource(ResourceType.FOOD, 10);
    const removed = storage.removeResource(ResourceType.FOOD, 20);

    expect(removed).toBe(false);
    expect(storage.getAmount(ResourceType.FOOD)).toBe(10);
  });

  it('should check resource availability correctly', () => {
    storage.addResource(ResourceType.GOLD, 100);
    storage.addResource(ResourceType.RAW_MATERIAL, 50);

    const hasResources = storage.hasResources({
      [ResourceType.GOLD]: 80,
      [ResourceType.RAW_MATERIAL]: 30,
    });

    expect(hasResources).toBe(true);
  });

  it('should consume resources when available', () => {
    storage.addResource(ResourceType.GOLD, 100);
    storage.addResource(ResourceType.RAW_MATERIAL, 50);

    const consumed = storage.consumeResources({
      [ResourceType.GOLD]: 60,
      [ResourceType.RAW_MATERIAL]: 20,
    });

    expect(consumed).toBe(true);
    expect(storage.getAmount(ResourceType.GOLD)).toBe(40);
    expect(storage.getAmount(ResourceType.RAW_MATERIAL)).toBe(30);
  });

  it('should not consume resources when insufficient', () => {
    storage.addResource(ResourceType.GOLD, 50);

    const consumed = storage.consumeResources({
      [ResourceType.GOLD]: 100,
    });

    expect(consumed).toBe(false);
    expect(storage.getAmount(ResourceType.GOLD)).toBe(50);
  });

  it('should serialize to JSON', () => {
    storage.addResource(ResourceType.FOOD, 75);
    const json = storage.toJSON();
    expect(json[ResourceType.FOOD]).toBe(75);
    expect(json[ResourceType.GOLD]).toBe(0);
  });
});
