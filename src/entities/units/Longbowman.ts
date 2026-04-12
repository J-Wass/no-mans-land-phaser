import { Unit, UnitType } from './Unit';
import type { EntityId, GridCoordinates } from '@/types/common';
import type { ResourceCost } from '@/systems/resources/ResourceType';
import { ResourceType } from '@/systems/resources/ResourceType';

export class Longbowman extends Unit {
  constructor(id: EntityId, ownerId: EntityId, position: GridCoordinates) {
    super(id, UnitType.LONGBOWMAN, ownerId, position, {
      maxHealth: 100,
      meleeDamage: 10,
      rangedDamage: 12,
      armorType: 'light',
      speed: 2,
      attackRange: 3,
      vision: 1,
    });
  }

  public getCost(): ResourceCost {
    return {
      [ResourceType.FOOD]: 15,
      [ResourceType.RAW_MATERIAL]: 20,
    };
  }
}
