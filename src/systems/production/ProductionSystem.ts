/**
 * ProductionSystem — advances city production and research each tick.
 * Also applies passive resource yields from city and territory buildings.
 */

import type { GameState } from '@/managers/GameState';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import type { GridCoordinates } from '@/types/common';
import type { Nation } from '@/entities/nations/Nation';
import { spawnUnit } from '@/systems/production/unitSpawnFactory';
import { TerrainType } from '@/systems/grid/Territory';
import { coordsToKey } from '@/systems/grid/Grid';
import { ResourceType } from '@/systems/resources/ResourceType';
import { CityBuildingType } from '@/systems/territory/CityBuilding';
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import { mineralGoldBonus } from '@/systems/resources/ResourceBonuses';
import { REGION_BONUS_INTERVAL, regionBonusResource, regionBonusAmount } from '@/systems/regions/RegionSystem';
import { TECH_MAP } from '@/systems/research/TechTree';

// ── Passive yield intervals (in ticks) ────────────────────────────────────────
// TICK_RATE = 10 → 5 ticks = 0.5s, 10 ticks = 1s
/** Research doesn't start accumulating until 30 seconds into the game. */
const RESEARCH_START_TICK  = 300;
const FOOD_INTERVAL        = 5;   // base +2/s per city
const MATERIAL_INTERVAL    = 10;  // base +1/s per city
const GOLD_INTERVAL        = 10;
const RESEARCH_INTERVAL    = 10;
/** Each School building level speeds the nation's active research by this fraction. */
const RESEARCH_SPEED_PER_SCHOOL_LEVEL = 0.10;
/** Cap on the total School research speed-up (0.50 = research advances 1.5× as fast). */
const RESEARCH_SPEED_CAP = 0.50;
// Territory terrain yields — slower than city yields, represents land exploitation
const TERRAIN_FOOD_INTERVAL    = 50;  // plains: +1 food per 5s
const TERRAIN_MATERIAL_INTERVAL = 50; // forest/hills: +1 material per 5s
const TERRAIN_GOLD_INTERVAL    = 80;  // desert: +1 gold per 8s

/** How often upkeep is drained — once every 3 seconds at TICK_RATE=10. */
const UPKEEP_INTERVAL      = 30;

export class ProductionSystem {
  /** In sandbox mode, queued research is free and completes near-instantly. */
  constructor(private readonly sandboxMode = false) {}

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

      // City building bonuses — scale with building level (L1..L5).
      const farmsLvl    = city.getBuildingLevel(CityBuildingType.FARMS);
      const workshopLvl = city.getBuildingLevel(CityBuildingType.WORKSHOP);
      const schoolLvl   = city.getBuildingLevel(CityBuildingType.SCHOOL);
      const marketLvl   = city.getBuildingLevel(CityBuildingType.MARKET);
      if (farmsLvl > 0    && currentTick % FOOD_INTERVAL === 0)      t.addResource(ResourceType.FOOD,         farmsLvl);
      if (workshopLvl > 0 && currentTick % MATERIAL_INTERVAL === 0)  t.addResource(ResourceType.RAW_MATERIAL, workshopLvl);
      if (schoolLvl > 0   && currentTick >= RESEARCH_START_TICK && currentTick % RESEARCH_INTERVAL === 0) t.addResource(ResourceType.RESEARCH, schoolLvl);
      if (marketLvl > 0   && currentTick % GOLD_INTERVAL === 0)      t.addResource(ResourceType.GOLD,         marketLvl);
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
        } else if ((terrain === TerrainType.FOREST || terrain === TerrainType.SNOW_FOREST)
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

    // ── Region domination bonuses ─────────────────────────────────────────────
    if (currentTick % REGION_BONUS_INTERVAL === 0) {
      const regionSystem = gameState.getRegionSystem();
      if (regionSystem) {
        for (const region of regionSystem.getAllRegions()) {
          const resource = regionBonusResource(region.terrain);
          if (!resource) continue;
          const controller = regionSystem.getControllingNation(region.id, gameState);
          if (!controller) continue;
          const nation = gameState.getNation(controller);
          if (!nation) continue;
          nation.getTreasury().addResource(resource, regionBonusAmount(region));
          eventBus.emit('region:dominated', { regionId: region.id, nationId: controller, tick: currentTick });
        }
      }
    }

    // ── City raze / level-removal decay ───────────────────────────────────────
    const razeRng = gameState.getRng().fn();
    for (const city of gameState.getAllCities()) {
      if (city.tickDecay(razeRng)) {
        eventBus.emit('city:buildings-changed', { cityId: city.id, tick: currentTick });
      }
    }

    // ── City production orders ────────────────────────────────────────────────
    for (const city of gameState.getAllCities()) {
      const orderSnapshot = city.getCurrentOrder();
      if (!orderSnapshot) continue;
      // Walls can't be raised mid-assault: finishing a level refills the city's HP.
      if (city.isProductionPaused(currentTick)) continue;

      const ready = city.tickProduction();
      if (!ready) continue;

      if (orderSnapshot.kind === 'unit') {
        // Don't complete the order until a tile is actually free to spawn on —
        // otherwise the finished unit (and the resources/time paid for it) is
        // just discarded. Leave it in place and retry on a later tick instead.
        const spawnPos = findSpawnNear(gameState, city.position);
        if (!spawnPos) continue;

        city.completeCurrentOrder();
        const unitId = gameState.nextProductionUnitId();
        const unit   = spawnUnit(orderSnapshot.unitType, unitId, city.getOwnerId(), spawnPos);
        unit.setHomeCityId(city.id);
        unit.setUnitSerial(gameState.nextUnitSerial(orderSnapshot.unitType, city.getOwnerId()));
        gameState.addUnit(unit);
        eventBus.emit('city:unit-spawned', {
          cityId: city.id, unitId, unitType: orderSnapshot.unitType,
          position: spawnPos, tick: currentTick,
        });

      } else if (orderSnapshot.kind === 'building') {
        city.completeCurrentOrder();
        city.addBuilding(orderSnapshot.buildingType);
        eventBus.emit('city:building-built', {
          cityId: city.id, building: orderSnapshot.buildingType, tick: currentTick,
        });

      } else {
        // resource order
        city.completeCurrentOrder();
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
      this.startQueuedResearch(nation, eventBus);
      // Schools speed up the active research (+10% per School level, capped).
      const schoolLevels = gameState.getCitiesByNation(nation.getId())
        .reduce((sum, city) => sum + city.getBuildingLevel(CityBuildingType.SCHOOL), 0);
      const researchSpeed = 1 + Math.min(RESEARCH_SPEED_CAP, schoolLevels * RESEARCH_SPEED_PER_SCHOOL_LEVEL);
      const completed = nation.tickResearch(researchSpeed);
      if (completed) {
        eventBus.emit('nation:research-complete', {
          nationId: nation.getId(), techId: completed,
        });
        this.startQueuedResearch(nation, eventBus);
      }
    }
  }

  private startQueuedResearch(
    nation: Nation,
    eventBus: GameEventBus,
  ): void {
    if (nation.getCurrentResearch()) return;
    const nextTechId = nation.getResearchQueue()[0];
    if (!nextTechId) return;
    if (!nation.canResearch(nextTechId)) return;

    const node = TECH_MAP.get(nextTechId);
    if (!node) {
      nation.removeQueuedResearch(nextTechId);
      eventBus.emit('nation:research-queue-updated', {
        nationId: nation.getId(),
        queue: [...nation.getResearchQueue()],
      });
      return;
    }

    const treasury = nation.getTreasury();
    if (!this.sandboxMode && treasury.getAmount(ResourceType.RESEARCH) < node.researchCost) return;

    if (!this.sandboxMode) treasury.consumeResources({ [ResourceType.RESEARCH]: node.researchCost });
    nation.startResearch(nextTechId, this.sandboxMode ? Math.min(10, node.ticks) : node.ticks);
    eventBus.emit('nation:research-started', {
      nationId: nation.getId(),
      techId: nextTechId,
    });
    eventBus.emit('nation:research-queue-updated', {
      nationId: nation.getId(),
      queue: [...nation.getResearchQueue()],
    });
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
