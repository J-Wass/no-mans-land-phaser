import { describe, it, expect } from '@jest/globals';
import { City } from './City';
import { CityBuildingType } from '@/systems/territory/CityBuilding';

describe('City', () => {
  it('heals up to the walls-adjusted max health, not the base 200', () => {
    const city = new City('city-1', 'Walltown', 'nation-1', { row: 0, col: 0 });
    city.addBuilding(CityBuildingType.WALLS); // heals to full on build
    const maxWithWalls = city.getMaxHealth();
    expect(maxWithWalls).toBeGreaterThan(200);

    city.setHealth(maxWithWalls);
    expect(city.getHealth()).toBe(maxWithWalls);

    city.takeDamage(1);
    city.heal(1);
    // Previously heal() clamped against the base 200, so a walled city above
    // 200 HP would be silently knocked down to 200 on any heal pulse.
    expect(city.getHealth()).toBe(maxWithWalls);
  });

  it('setHealth clamps to the walls-adjusted max, not the base 200', () => {
    const city = new City('city-2', 'Bastion', 'nation-1', { row: 0, col: 0 });
    city.addBuilding(CityBuildingType.WALLS);
    const maxWithWalls = city.getMaxHealth();

    city.setHealth(maxWithWalls + 500);
    expect(city.getHealth()).toBe(maxWithWalls);
  });

  describe('production queue', () => {
    it('cancelOrder promotes the next queued order instead of leaving the city idle', () => {
      const city = new City('city-3', 'Forge', 'nation-1', { row: 0, col: 0 });
      const orderA = { kind: 'resource' as const, resourceType: 'GOLD' as never, resourceAmount: 1, label: 'A', ticksTotal: 10, ticksRemaining: 10 };
      const orderB = { kind: 'resource' as const, resourceType: 'GOLD' as never, resourceAmount: 1, label: 'B', ticksTotal: 10, ticksRemaining: 10 };
      city.startOrder(orderA);
      city.enqueueOrder(orderB);

      city.cancelOrder();

      expect(city.getCurrentOrder()?.label).toBe('B');
      expect(city.getQueue()).toHaveLength(0);
    });

    it('tickProduction holds a ready order until completeCurrentOrder is called', () => {
      const city = new City('city-4', 'Mint', 'nation-1', { row: 0, col: 0 });
      city.startOrder({ kind: 'resource', resourceType: 'GOLD' as never, resourceAmount: 1, label: 'A', ticksTotal: 1, ticksRemaining: 1 });

      expect(city.tickProduction()).toBe(true);
      // Calling tickProduction again before completing should keep reporting
      // "ready" rather than silently advancing or losing the order.
      expect(city.tickProduction()).toBe(true);
      expect(city.getCurrentOrder()).not.toBeNull();

      city.completeCurrentOrder();
      expect(city.getCurrentOrder()).toBeNull();
    });
  });
});
