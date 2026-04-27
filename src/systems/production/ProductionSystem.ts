/**
 * ProductionSystem — advances city production and research each tick.
 * Also applies passive resource yields from city and territory buildings.
 */

import type { GameState } from '@/managers/GameState';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import type { GridCoordinates } from '@/types/common';
import { spawnUnit } from '@/systems/production/unitSpawnFactory';
import { TerrainType } from '@/systems/grid/Territory';
import { coordsToKey } from '@/systems/grid/Grid';
import { ResourceType } from '@/systems/resources/ResourceType';
import { CityBuildingType } from '@/systems/territory/CityBuilding';
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import { mineralGoldBonus } from '@/systems/resources/ResourceBonuses';

// ── Passive yield intervals (in ticks) ────────────────────────────────────────
// TICK_RATE = 10 → 5 ticks = 0.5s, 10 ticks = 1s
/** Research doesn't start accumulating until 30 seconds into the game. */
const RESEARCH_START_TICK  = 300;
const FOOD_INTERVAL        = 5;   // base +2/s per city
const MATERIAL_INTERVAL    = 10;  // base +1/s per city
const GOLD_INTERVAL        = 10;
const RESEARCH_INTERVAL    = 10;
// Territory terrain yields — slower than city yields, represents land exploitation
const TERRAIN_FOOD_INTERVAL    = 50;  // plains: +1 food per 5s
const TERRAIN_MATERIAL_INTERVAL = 50; // forest/hills: +1 material per 5s
const TERRAIN_GOLD_INTERVAL    = 80;  // desert: +1 gold per 8s

/** How often upkeep is drained — once every 3 seconds at TICK_RATE=10. */
const UPKEEP_INTERVAL      = 30;

let unitSerial = 1000;

export class ProductionSystem {
  public tick(gameState: GameState, eventBus: GameEventBus, currentTick: number): void {

    // ── Passive resource yield — base per city ────────────────────────────────
    for (const city of gameState.getAllCities()) {
      const nation = gameState.getNation(city.getOwnerId());
      if (!nation) continue;
      const t = nation.getTreasury();

      if (currentTick % FOOD_INTERVAL     === 0) t.addResource(ResourceType.FOOD,         1);
      if (currentTick % MATERIAL_INTERVAL === 0) t.addResource(ResourceType.RAW_MATERIAL, 1);
      if (currentTick % GOLD_INTERVAL     === 0) t.addResource(ResourceType.GOLD,         1);
      if (currentTick >= RESEARCH_START_TICK && currentTick % RESEARCH_INTERVAL === 0) t.addResource(ResourceType.RESEARCH, 1);

      // City building bonuses
      if (city.hasBuilding(CityBuildingType.FARMS)
          && currentTick % FOOD_INTERVAL === 0)          t.addResource(ResourceType.FOOD,         1);
      if (city.hasBuilding(CityBuildingType.WORKSHOP)
          && currentTick % MATERIAL_INTERVAL === 0)      t.addResource(ResourceType.RAW_MATERIAL, 1);
      if (city.hasBuilding(CityBuildingType.SCHOOL)
          && currentTick >= RESEARCH_START_TICK && currentTick % RESEARCH_INTERVAL === 0) t.addResource(ResourceType.RESEARCH, 1);
      if (city.hasBuilding(CityBuildingType.MARKET)
          && currentTick % GOLD_INTERVAL === 0)          t.addResource(ResourceType.GOLD,         1);
    }

    // ── Territory building bonuses + terrain yields ───────────────────────────
    for (const nation of gameState.getAllNations()) {
      const t = nation.getTreasury();

      for (const territory of gameState.getGrid().getTerritoriesByNation(nation.getId())) {
        // Building bonuses (non-city territories)
        if (territory.hasBuilding(TerritoryBuildingType.FARMS)
            && currentTick % FOOD_INTERVAL === 0)        t.addResource(ResourceType.FOOD,         1);
        if (territory.hasBuilding(TerritoryBuildingType.WORKSHOP)
            && currentTick % MATERIAL_INTERVAL === 0)    t.addResource(ResourceType.RAW_MATERIAL, 1);

        // Terrain passive yields
        const terrain = territory.getTerrainType();
        if (terrain === TerrainType.PLAINS && currentTick % TERRAIN_FOOD_INTERVAL === 0) {
          t.addResource(ResourceType.FOOD, 1);
        } else if ((terrain === TerrainType.FOREST || terrain === TerrainType.HILLS)
            && currentTick % TERRAIN_MATERIAL_INTERVAL === 0) {
          t.addResource(ResourceType.RAW_MATERIAL, 1);
        } else if (terrain === TerrainType.DESERT && currentTick % TERRAIN_GOLD_INTERVAL === 0) {
          t.addResource(ResourceType.GOLD, 1);
        }
      }

      // Silver/gold deposit mines provide bonus gold income
      if (currentTick % GOLD_INTERVAL === 0) {
        const deposits = gameState.getNationActiveDeposits(nation.getId());
        const counts   = gameState.getNationActiveDepositCounts(nation.getId());
        const goldBonus = mineralGoldBonus(deposits, counts);
        if (goldBonus > 0) t.addResource(ResourceType.GOLD, goldBonus);
      }
    }

    // ── City production orders ────────────────────────────────────────────────
    for (const city of gameState.getAllCities()) {
      const orderSnapshot = city.getCurrentOrder();
      if (!orderSnapshot) continue;

      const completed = city.tickProduction();
      if (!completed) continue;

      if (orderSnapshot.kind === 'unit') {
        const spawnPos = findSpawnNear(gameState, city.position);
        if (spawnPos) {
          const unitId = `unit-city-${++unitSerial}`;
          const unit   = spawnUnit(orderSnapshot.unitType, unitId, city.getOwnerId(), spawnPos);
          unit.setHomeCityId(city.id);
          unit.setUnitSerial(gameState.nextUnitSerial(orderSnapshot.unitType));
          gameState.addUnit(unit);
          eventBus.emit('city:unit-spawned', {
            cityId: city.id, unitId, unitType: orderSnapshot.unitType,
            position: spawnPos, tick: currentTick,
          });
        }

      } else if (orderSnapshot.kind === 'building') {
        city.addBuilding(orderSnapshot.buildingType);
        eventBus.emit('city:building-built', {
          cityId: city.id, building: orderSnapshot.buildingType, tick: currentTick,
        });

      } else {
        // resource order
        const nation = gameState.getNation(city.getOwnerId());
        nation?.getTreasury().addResource(orderSnapshot.resourceType, orderSnapshot.resourceAmount);
        eventBus.emit('city:production-complete', {
          cityId: city.id, order: orderSnapshot, tick: currentTick,
        });
      }
    }

    // ── Unit upkeep ───────────────────────────────────────────────────────────
    if (currentTick % UPKEEP_INTERVAL === 0) {
      for (const unit of gameState.getAllUnits()) {
        if (!unit.isAlive()) continue;
        const nation = gameState.getNation(unit.getOwnerId());
        if (!nation) continue;
        nation.getTreasury().consumeResources(unit.getUpkeep());
      }
    }

    // ── Research ──────────────────────────────────────────────────────────────
    for (const nation of gameState.getAllNations()) {
      const completed = nation.tickResearch();
      if (completed) {
        eventBus.emit('nation:research-complete', {
          nationId: nation.getId(), techId: completed,
        });
      }
    }
  }
}

/** Find a passable, unoccupied tile near the city (city tile first, then ring out). */
function findSpawnNear(gameState: GameState, origin: GridCoordinates): GridCoordinates | null {
  const grid     = gameState.getGrid();
  const occupied = new Set(gameState.getAllUnits().map(u => coordsToKey(u.position)));

  const candidates: GridCoordinates[] = [
    origin,
    { row: origin.row,     col: origin.col + 1 },
    { row: origin.row + 1, col: origin.col     },
    { row: origin.row,     col: origin.col - 1 },
    { row: origin.row - 1, col: origin.col     },
    { row: origin.row + 1, col: origin.col + 1 },
    { row: origin.row - 1, col: origin.col - 1 },
    { row: origin.row + 1, col: origin.col - 1 },
    { row: origin.row - 1, col: origin.col + 1 },
  ];

  for (const c of candidates) {
    const territory = grid.getTerritory(c);
    if (!territory) continue;
    const terrain = territory.getTerrainType();
    if (terrain === TerrainType.WATER || terrain === TerrainType.MOUNTAIN) continue;
    if (occupied.has(coordsToKey(c))) continue;
    return c;
  }
  return null;
}

