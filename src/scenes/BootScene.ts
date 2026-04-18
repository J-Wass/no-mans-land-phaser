/**
 * BootScene — builds the initial GameState from a GameSetup and starts GameScene.
 *
 * Spawn placement: each team gets two units on the coast (inner edge of the water
 * border) using farthest-point sampling so teams are maximally spread apart.
 * Terrain is procedurally generated each game for variety.
 * Nation/city names are loaded from src/config/names.json.
 */

import Phaser from 'phaser';
import { GameState } from '@/managers/GameState';
import { Nation } from '@/entities/nations/Nation';
import { Player } from '@/entities/players/Player';
import { Infantry } from '@/entities/units/Infantry';
import { Scout } from '@/entities/units/Scout';
import { UnitType } from '@/entities/units/Unit';
import { City } from '@/entities/cities/City';
import { TerrainType } from '@/systems/grid/Territory';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import { ResourceType } from '@/systems/resources/ResourceType';
import type { GameSetup } from '@/types/gameSetup';
import type { TechId } from '@/systems/research/TechTree';
import type { Grid } from '@/systems/grid/Grid';
import {
  pickCoastalSpawnPairs,
  findCityPositions,
  assignStartingTerritory,
} from '@/systems/spawn/SpawnSystem';
import GAME_NAMES from '@/config/names.json';

/** Root-level techs (no prerequisites) — eligible for random starting grant. */
const ROOT_TECHS: TechId[] = ['writing', 'hunting', 'masonry', 'scientific_method', 'mathematics'];

const GRID_SIZE = 25;

interface BootSceneData {
  setup?: GameSetup;
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(data: BootSceneData): void {
    const setup: GameSetup = data?.setup ?? { opponentCount: 1, difficulty: 'medium' };
    const gameState = new GameState({ rows: GRID_SIZE, cols: GRID_SIZE });
    const grid = gameState.getGrid();

    // ── Terrain (must be set before spawn algorithm queries it) ──────────────

    // Water border
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (r === 0 || r === GRID_SIZE - 1 || c === 0 || c === GRID_SIZE - 1) {
          grid.getTerritory({ row: r, col: c })?.setTerrainType(TerrainType.WATER);
        }
      }
    }

    // Procedural terrain
    placeProceduralTerrain(grid, GRID_SIZE);

    // ── Resource deposits ─────────────────────────────────────────────────────
    const DEPOSIT_POOL: TerritoryResourceType[] = [
      TerritoryResourceType.COPPER,
      TerritoryResourceType.COPPER,
      TerritoryResourceType.IRON,
      TerritoryResourceType.IRON,
      TerritoryResourceType.FIRE_GLASS,
      TerritoryResourceType.SILVER,
      TerritoryResourceType.GOLD_DEPOSIT,
      TerritoryResourceType.WATER_MANA,
      TerritoryResourceType.FIRE_MANA,
      TerritoryResourceType.LIGHTNING_MANA,
      TerritoryResourceType.EARTH_MANA,
      TerritoryResourceType.AIR_MANA,
      TerritoryResourceType.SHADOW_MANA,
    ];

    const ELIGIBLE_TERRAIN = new Set<TerrainType>([
      TerrainType.PLAINS,
      TerrainType.DESERT,
      TerrainType.FOREST,
    ]);

    for (let r = 1; r < GRID_SIZE - 1; r++) {
      for (let c = 1; c < GRID_SIZE - 1; c++) {
        const territory = grid.getTerritory({ row: r, col: c });
        if (!territory) continue;
        if (!ELIGIBLE_TERRAIN.has(territory.getTerrainType())) continue;
        if (Math.random() > 0.15) continue;
        const deposit = DEPOSIT_POOL[Math.floor(Math.random() * DEPOSIT_POOL.length)];
        territory.setResourceDeposit(deposit!);
      }
    }

    // ── Spawn placement ───────────────────────────────────────────────────────

    const totalNations  = 1 + Math.min(setup.opponentCount, 4);
    const spawnPairs    = pickCoastalSpawnPairs(grid, GRID_SIZE, totalNations);
    const takenPositions: import('@/types/common').GridCoordinates[] = [];

    // Shuffle nation configs so each game uses different names/colors
    const shuffledNations = [...GAME_NAMES.nations];
    for (let i = shuffledNations.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledNations[i], shuffledNations[j]] = [shuffledNations[j]!, shuffledNations[i]!];
    }

    for (let i = 0; i < totalNations; i++) {
      const cfg  = shuffledNations[i];
      const pair = spawnPairs[i];
      if (!cfg || !pair) break;

      const nationId = `nation-${i + 1}`;
      const isLocal  = i === 0;
      const playerId = `player-${i + 1}`;

      const nation = new Nation(nationId, cfg.name, cfg.color, !isLocal);
      nation.setControlledBy(playerId);
      nation.getTreasury().addResource(ResourceType.GOLD,         50);
      nation.getTreasury().addResource(ResourceType.FOOD,         30);
      nation.getTreasury().addResource(ResourceType.RAW_MATERIAL, 20);

      const startingTech = ROOT_TECHS[Math.floor(Math.random() * ROOT_TECHS.length)]!;
      nation.startResearch(startingTech, 1);
      nation.tickResearch();

      gameState.addNation(nation);
      gameState.addPlayer(new Player(playerId, isLocal ? 'Player' : cfg.name, nationId, isLocal));

      const infantry = new Infantry(`unit-inf-${i + 1}`,   nationId, pair.infantry);
      const scout    = new Scout(   `unit-scout-${i + 1}`, nationId, pair.scout);
      infantry.setUnitSerial(gameState.nextUnitSerial(UnitType.INFANTRY));
      scout.setUnitSerial(gameState.nextUnitSerial(UnitType.SCOUT));

      takenPositions.push(pair.infantry, pair.scout);

      const cityPositions = findCityPositions(grid, pair.infantry, takenPositions, GRID_SIZE);
      for (let j = 0; j < 2; j++) {
        const pos = cityPositions[j];
        if (!pos) continue;
        const cityName = cfg.cities[j] ?? `${cfg.name} ${j + 1}`;
        const cityId   = `city-${i + 1}-${j + 1}`;
        gameState.addCity(new City(cityId, cityName, nationId, pos));
        takenPositions.push(pos);
        if (j === 0) {
          infantry.setHomeCityId(cityId);
          scout.setHomeCityId(cityId);
        }
      }

      gameState.addUnit(infantry);
      gameState.addUnit(scout);

      assignStartingTerritory(grid, nationId, cityPositions, GRID_SIZE);
    }

    this.scene.start('GameScene', { gameState, setup });
  }
}

// ── Procedural terrain generation ─────────────────────────────────────────────

function placeCluster(
  grid: Grid,
  terrain: TerrainType,
  centerRow: number,
  centerCol: number,
  radius: number,
  gridSize: number,
): void {
  for (let r = centerRow - radius; r <= centerRow + radius; r++) {
    for (let c = centerCol - radius; c <= centerCol + radius; c++) {
      if (r < 1 || r >= gridSize - 1 || c < 1 || c >= gridSize - 1) continue;
      if (Math.abs(r - centerRow) + Math.abs(c - centerCol) > radius) continue;
      grid.getTerritory({ row: r, col: c })?.setTerrainType(terrain);
    }
  }
}

function randomInRange(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function placeProceduralTerrain(grid: Grid, gridSize: number): void {
  const P = gridSize - 2; // playable range: 1..gridSize-2

  // Forests: 4-6 clusters, radius 1-3
  for (let i = 0; i < randomInRange(4, 6); i++) {
    placeCluster(grid, TerrainType.FOREST,
      randomInRange(1, P), randomInRange(1, P),
      randomInRange(1, 3), gridSize);
  }

  // Hills: 3-5 clusters, radius 1-2
  for (let i = 0; i < randomInRange(3, 5); i++) {
    placeCluster(grid, TerrainType.HILLS,
      randomInRange(1, P), randomInRange(1, P),
      randomInRange(1, 2), gridSize);
  }

  // Desert: 2-4 clusters, radius 1-2
  for (let i = 0; i < randomInRange(2, 4); i++) {
    placeCluster(grid, TerrainType.DESERT,
      randomInRange(1, P), randomInRange(1, P),
      randomInRange(1, 2), gridSize);
  }

  // Mountains: 2-3 small clusters, radius 1
  for (let i = 0; i < randomInRange(2, 3); i++) {
    placeCluster(grid, TerrainType.MOUNTAIN,
      randomInRange(1, P), randomInRange(1, P),
      1, gridSize);
  }

  // Interior lakes: 1-2, radius 1, kept away from edges
  const lakeMin = Math.floor(gridSize * 0.25);
  const lakeMax = Math.floor(gridSize * 0.75);
  for (let i = 0; i < randomInRange(1, 2); i++) {
    placeCluster(grid, TerrainType.WATER,
      randomInRange(lakeMin, lakeMax), randomInRange(lakeMin, lakeMax),
      1, gridSize);
  }
}
