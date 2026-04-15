import { Unit, UnitType } from './Unit';
import type { EntityId, GridCoordinates } from '@/types/common';
import type { ResourceCost } from '@/systems/resources/ResourceType';
import { ResourceType } from '@/systems/resources/ResourceType';

export class Trebuchet extends Unit {
  constructor(id: EntityId, ownerId: EntityId, position: GridCoordinates) {
    super(id, UnitType.TREBUCHET, ownerId, position, {
      maxHealth: 250,
      meleeDamage: 25,
      rangedDamage: 50,
      armorType: 'heavy',
      speed: 1,
      attackRange: 3,
      vision: 1,
      upkeep: { [ResourceType.FOOD]: 2, [ResourceType.RAW_MATERIAL]: 3 },
    });
  }

  public getCost(): ResourceCost {
    return {
      [ResourceType.FOOD]: 30,
      [ResourceType.RAW_MATERIAL]: 50,
      [ResourceType.GOLD]: 25,
    };
  }
}
