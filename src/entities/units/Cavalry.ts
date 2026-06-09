import { Unit, UnitType } from './Unit';
import type { EntityId, GridCoordinates } from '@/types/common';
import { ResourceType } from '@/systems/resources/ResourceType';

export class Cavalry extends Unit {
  constructor(id: EntityId, ownerId: EntityId, position: GridCoordinates) {
    super(id, UnitType.CAVALRY, ownerId, position, {
      maxHealth: 160,
      meleeDamage: 40,
      rangedDamage: 0,
      armorType: 'heavy',
      speed: 3,
      attackRange: 1,
      vision: 1,
      upkeep: { [ResourceType.FOOD]: 2, [ResourceType.RAW_MATERIAL]: 1 },
    });
  }
}
