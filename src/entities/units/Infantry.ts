/**
 * Infantry unit - basic melee unit
 */

import { Unit, UnitType } from './Unit';
import type { EntityId, GridCoordinates } from '@/types/common';
import type { ResourceCost } from '@/systems/resources/ResourceType';
import { ResourceType } from '@/systems/resources/ResourceType';

export class Infantry extends Unit {
  constructor(id: EntityId, ownerId: EntityId, position: GridCoordinates) {
    super(id, UnitType.INFANTRY, ownerId, position, {
      maxHealth: 100,
      attack: 15,
      defense: 10,
      movement: 2,
      range: 1
    });
  }

  public getCost(): ResourceCost {
    return {
      [ResourceType.FOOD]: 20,
      [ResourceType.IRON]: 10
    };
  }
}
