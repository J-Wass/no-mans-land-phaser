import { Unit, UnitType } from './Unit';
import type { EntityId, GridCoordinates } from '@/types/common';
import { ResourceType } from '@/systems/resources/ResourceType';

export class HeavyInfantry extends Unit {
  constructor(id: EntityId, ownerId: EntityId, position: GridCoordinates) {
    super(id, UnitType.HEAVY_INFANTRY, ownerId, position, {
      maxHealth: 250,
      meleeDamage: 20,
      rangedDamage: 0,
      armorType: 'heavy',
      speed: 1,
      attackRange: 1,
      vision: 1,
      upkeep: { [ResourceType.FOOD]: 2, [ResourceType.RAW_MATERIAL]: 1 },
    });
  }
}
