/**
 * Archer unit - ranged unit
 */

import { Unit, UnitType } from './Unit';
import type { EntityId, GridCoordinates } from '@/types/common';
import type { ResourceCost } from '@/systems/resources/ResourceType';
import { ResourceType } from '@/systems/resources/ResourceType';

export class Archer extends Unit {
  constructor(id: EntityId, ownerId: EntityId, position: GridCoordinates) {
    super(id, UnitType.ARCHER, ownerId, position, {
      maxHealth: 70,
      attack: 20,
      defense: 5,
      movement: 2,
      range: 3
    });
  }

  public getCost(): ResourceCost {
    return {
      [ResourceType.FOOD]: 15,
      [ResourceType.WOOD]: 20,
      [ResourceType.GOLD]: 5
    };
  }
}
