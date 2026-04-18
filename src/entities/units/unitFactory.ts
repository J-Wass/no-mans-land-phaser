/**
 * unitFactory — reconstructs the right Unit subclass from serialized UnitData.
 * Used by GameState.fromJSON() when loading a saved game.
 */

import type { UnitData } from './Unit';
import { UnitType } from './Unit';
import type { Unit } from './Unit';
import { Infantry } from './Infantry';
import { Scout } from './Scout';
import { HeavyInfantry } from './HeavyInfantry';
import { Cavalry } from './Cavalry';
import { Longbowman } from './Longbowman';
import { Crossbowman } from './Crossbowman';
import { Catapult } from './Catapult';
import { Trebuchet } from './Trebuchet';

export function createUnitFromData(data: UnitData): Unit {
  let unit: Unit;

  switch (data.type) {
    case UnitType.INFANTRY:
      unit = new Infantry(data.id, data.ownerId, data.position);
      break;
    case UnitType.SCOUT:
      unit = new Scout(data.id, data.ownerId, data.position);
      break;
    case UnitType.HEAVY_INFANTRY:
      unit = new HeavyInfantry(data.id, data.ownerId, data.position);
      break;
    case UnitType.CAVALRY:
      unit = new Cavalry(data.id, data.ownerId, data.position);
      break;
    case UnitType.LONGBOWMAN:
      unit = new Longbowman(data.id, data.ownerId, data.position);
      break;
    case UnitType.CROSSBOWMAN:
      unit = new Crossbowman(data.id, data.ownerId, data.position);
      break;
    case UnitType.CATAPULT:
      unit = new Catapult(data.id, data.ownerId, data.position);
      break;
    case UnitType.TREBUCHET:
      unit = new Trebuchet(data.id, data.ownerId, data.position);
      break;
    default: {
      const _exhaustive: never = data.type;
      void _exhaustive;
      unit = new Infantry(data.id, data.ownerId, data.position);
    }
  }

  // Restore mutable state that may differ from the constructor defaults
  unit.setHealth(data.currentHealth);
  unit.setBattleOrder(data.battleOrder ?? 'ADVANCE');
  unit.setEngagedInBattle(data.engagedInBattle ?? false);
  if (data.morale              !== undefined) unit.setMorale(data.morale);
  if (data.battlesEngaged      !== undefined) unit.setBattlesEngaged(data.battlesEngaged);
  if (data.homeCityId          !== undefined) unit.setHomeCityId(data.homeCityId);
  if (data.preferredTargetId   !== undefined) unit.setPreferredTargetId(data.preferredTargetId);
  if (data.xp                  !== undefined) unit.setXP(data.xp);
  if (data.veteranLevel        !== undefined) unit.setVeteranLevel(data.veteranLevel);
  if (data.unitSerial          !== undefined) unit.setUnitSerial(data.unitSerial);
  if (data.retreatCooldownUntilTick !== undefined) unit.setRetreatCooldownUntilTick(data.retreatCooldownUntilTick);
  if (data.hasMovedThisTurn) unit.moveTo(data.position); // marks hasMovedThisTurn
  return unit;
}
