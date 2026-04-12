/**
 * unitSpawnFactory — creates fresh unit instances for city production.
 *
 * Separate from unitFactory (save-restore) because spawning needs a clean unit
 * with full health and default state, not a restoration from serialized data.
 */

import { UnitType } from '@/entities/units/Unit';
import type { Unit } from '@/entities/units/Unit';
import type { GridCoordinates } from '@/types/common';
import { Infantry }      from '@/entities/units/Infantry';
import { Scout }         from '@/entities/units/Scout';
import { HeavyInfantry } from '@/entities/units/HeavyInfantry';
import { Cavalry }       from '@/entities/units/Cavalry';
import { Longbowman }    from '@/entities/units/Longbowman';
import { Crossbowman }   from '@/entities/units/Crossbowman';
import { Catapult }      from '@/entities/units/Catapult';
import { Trebuchet }     from '@/entities/units/Trebuchet';

type SpawnFn = (id: string, ownerId: string, pos: GridCoordinates) => Unit;

const SPAWN_MAP: Record<UnitType, SpawnFn> = {
  [UnitType.INFANTRY]:       (id, o, p) => new Infantry(id, o, p),
  [UnitType.SCOUT]:          (id, o, p) => new Scout(id, o, p),
  [UnitType.HEAVY_INFANTRY]: (id, o, p) => new HeavyInfantry(id, o, p),
  [UnitType.CAVALRY]:        (id, o, p) => new Cavalry(id, o, p),
  [UnitType.LONGBOWMAN]:     (id, o, p) => new Longbowman(id, o, p),
  [UnitType.CROSSBOWMAN]:    (id, o, p) => new Crossbowman(id, o, p),
  [UnitType.CATAPULT]:       (id, o, p) => new Catapult(id, o, p),
  [UnitType.TREBUCHET]:      (id, o, p) => new Trebuchet(id, o, p),
};

export function spawnUnit(
  type: UnitType,
  id: string,
  ownerId: string,
  position: GridCoordinates,
): Unit {
  return SPAWN_MAP[type](id, ownerId, position);
}
