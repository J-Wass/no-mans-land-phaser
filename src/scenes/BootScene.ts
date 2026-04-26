/**
 * BootScene - builds the initial GameState from a GameSetup and starts GameScene.
 *
 * Spawn placement: each team gets two units on the coast (inner edge of the water
 * border) using farthest-point sampling so teams are maximally spread apart.
 * Terrain is procedurally generated each game for variety.
 * Nation/city names are loaded from src/config/names.json or scenario presets.
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
import { DiplomaticStatus } from '@/types/diplomacy';
import { normalizeGameSetup } from '@/types/gameSetup';
import type { GameSetup } from '@/types/gameSetup';
import type { TechId } from '@/systems/research/TechTree';
import type { Grid } from '@/systems/grid/Grid';
import type { GridCoordinates } from '@/types/common';
import {
  pickCoastalSpawnPairs,
  findCityPositions,
  assignStartingTerritory,
} from '@/systems/spawn/SpawnSystem';
import GAME_NAMES from '@/config/names.json';
import { getScenarioById, getScenarioMap } from '@/config/scenarios';
import type { ScenarioDepositDef } from '@/config/scenarios';

/** Root-level techs (no prerequisites) - eligible for random starting grant. */
const ROOT_TECHS: TechId[] = ['writing', 'hunting', 'masonry', 'scientific_method', 'mathematics'];

const GRID_SIZE = 60;

interface BootSceneData {
  setup?: GameSetup;
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(data: BootSceneData): void {
    const setup: GameSetup = normalizeGameSetup(data?.setup);
    const gameState = new GameState({ rows: GRID_SIZE, cols: GRID_SIZE });
    const grid = gameState.getGrid();

    // Water border
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (r < 10 || r >= GRID_SIZE - 10 || c < 10 || c >= GRID_SIZE - 10) {
          grid.getTerritory({ row: r, col: c })?.setTerrainType(TerrainType.WATER);
        }
      }
    }

    if (setup.gameMode === 'scenario') {
      const scenario = getScenarioById(setup.scenarioId);
      if (scenario) {
        const mapRows = getScenarioMap(scenario.id);
        if (mapRows) applyScenarioMap(grid, mapRows);
        applyScenarioDeposits(grid, scenario.deposits);
        this.populateScenarioGameState(gameState, setup, grid);
      } else {
        placeProceduralTerrain(grid, GRID_SIZE);
        placeResourceDeposits(grid);
        this.populateSkirmishGameState(gameState, setup, grid);
      }
    } else {
      placeProceduralTerrain(grid, GRID_SIZE);
      placeResourceDeposits(grid);
      this.populateSkirmishGameState(gameState, setup, grid);
    }

    this.scene.start('GameScene', { gameState, setup });
  }

  private populateSkirmishGameState(gameState: GameState, setup: GameSetup, grid: Grid): void {
    const totalNations  = 1 + Math.min(setup.opponentCount, 4);
    const spawnPairs    = pickCoastalSpawnPairs(grid, GRID_SIZE, totalNations);
    const takenPositions: GridCoordinates[] = [];
    const shuffledNations = [...GAME_NAMES.nations];

    shuffleInPlace(shuffledNations);

    for (let i = 0; i < totalNations; i++) {
      const cfg  = shuffledNations[i];
      const pair = spawnPairs[i];
      if (!cfg || !pair) break;

      const nationId = `nation-${i + 1}`;
      const playerId = `player-${i + 1}`;
      const isLocal  = i === 0;
      const nation   = new Nation(nationId, cfg.name, cfg.color, !isLocal);
      nation.setControlledBy(playerId);
      grantResources(nation, {
        [ResourceType.GOLD]: 50,
        [ResourceType.FOOD]: 30,
        [ResourceType.RAW_MATERIAL]: 20,
      });
      grantTechs(nation, [ROOT_TECHS[Math.floor(Math.random() * ROOT_TECHS.length)]!]);

      gameState.addNation(nation);
      gameState.addPlayer(new Player(playerId, isLocal ? 'Player' : cfg.name, nationId, isLocal));

      const cityPositions = seedNation(
        gameState,
        grid,
        nationId,
        i + 1,
        pair,
        takenPositions,
        cfg.cities,
      );

      assignStartingTerritory(grid, nationId, cityPositions, GRID_SIZE);
    }
  }

  private populateScenarioGameState(gameState: GameState, setup: GameSetup, grid: Grid): void {
    const scenario = getScenarioById(setup.scenarioId);
    if (!scenario) {
      this.populateSkirmishGameState(gameState, setup, grid);
      return;
    }

    const nationIds: string[] = [];

    scenario.nations.forEach((cfg, index) => {
      const nationId = `nation-${index + 1}`;
      const playerId = `player-${index + 1}`;
      const isLocal  = cfg.isPlayer;
      const nation   = new Nation(nationId, cfg.name, cfg.color, !isLocal);
      nation.setControlledBy(playerId);
      grantResources(nation, cfg.resources as Partial<Record<ResourceType, number>>);
      grantTechs(nation, cfg.startingTechs as TechId[]);
      gameState.addNation(nation);
      gameState.addPlayer(new Player(playerId, isLocal ? 'Player' : cfg.name, nationId, isLocal));
      nationIds.push(nationId);

      const cityPositions: GridCoordinates[] = [];
      const serial = index + 1;

      for (let j = 0; j < cfg.units.length; j++) {
        const u = cfg.units[j]!;
        if (u.type === 'INFANTRY') {
          const unit = new Infantry(`unit-inf-${serial}`, nationId, { row: u.row, col: u.col });
          unit.setUnitSerial(gameState.nextUnitSerial(UnitType.INFANTRY));
          gameState.addUnit(unit);
        } else {
          const unit = new Scout(`unit-scout-${serial}`, nationId, { row: u.row, col: u.col });
          unit.setUnitSerial(gameState.nextUnitSerial(UnitType.SCOUT));
          gameState.addUnit(unit);
        }
      }

      for (let j = 0; j < cfg.cities.length; j++) {
        const cd = cfg.cities[j]!;
        const cityId = `city-${serial}-${j + 1}`;
        const pos: GridCoordinates = { row: cd.row, col: cd.col };
        gameState.addCity(new City(cityId, cd.name, nationId, pos));
        cityPositions.push(pos);
      }

      assignStartingTerritory(grid, nationId, cityPositions, GRID_SIZE, { overwrite: true });
    });

    // Apply diplomacy
    for (const rel of scenario.diplomacy ?? []) {
      const id1 = nationIds[rel.nation1];
      const id2 = nationIds[rel.nation2];
      if (!id1 || !id2) continue;
      const status = DiplomaticStatus[rel.status as keyof typeof DiplomaticStatus];
      if (status === undefined) continue;
      gameState.getNation(id1)?.setRelation(id2, status);
      gameState.getNation(id2)?.setRelation(id1, status);
    }
  }
}

const TERRAIN_CHAR: Record<string, TerrainType> = {
  W: TerrainType.WATER,
  '.': TerrainType.PLAINS,
  H: TerrainType.HILLS,
  F: TerrainType.FOREST,
  M: TerrainType.MOUNTAIN,
  D: TerrainType.DESERT,
};

function applyScenarioMap(grid: Grid, rows: string[]): void {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]!;
      const terrain = TERRAIN_CHAR[ch];
      if (terrain !== undefined) grid.getTerritory({ row: r, col: c })?.setTerrainType(terrain);
    }
  }
}

function applyScenarioDeposits(grid: Grid, deposits: ScenarioDepositDef[]): void {
  for (const d of deposits) {
    const t = grid.getTerritory({ row: d.row, col: d.col });
    const type = TerritoryResourceType[d.type as keyof typeof TerritoryResourceType];
    if (t && type !== undefined) t.setResourceDeposit(type);
  }
}

function placeResourceDeposits(grid: Grid): void {
  const oreSlots: Array<{ deposit: TerritoryResourceType; count: number; terrain: TerrainType[] }> = [
    { deposit: TerritoryResourceType.COPPER, count: 5, terrain: [TerrainType.HILLS, TerrainType.MOUNTAIN, TerrainType.FOREST] },
    { deposit: TerritoryResourceType.IRON, count: 3, terrain: [TerrainType.HILLS, TerrainType.MOUNTAIN] },
    { deposit: TerritoryResourceType.FIRE_GLASS, count: 1, terrain: [TerrainType.DESERT, TerrainType.HILLS] },
    { deposit: TerritoryResourceType.SILVER, count: 2, terrain: [TerrainType.HILLS, TerrainType.MOUNTAIN] },
    { deposit: TerritoryResourceType.GOLD_DEPOSIT, count: 1, terrain: [TerrainType.DESERT, TerrainType.HILLS] },
  ];
  const manaSlots: Array<{ deposit: TerritoryResourceType; terrain: TerrainType[] }> = [
    { deposit: TerritoryResourceType.WATER_MANA, terrain: [TerrainType.FOREST, TerrainType.PLAINS] },
    { deposit: TerritoryResourceType.FIRE_MANA, terrain: [TerrainType.DESERT, TerrainType.HILLS] },
    { deposit: TerritoryResourceType.LIGHTNING_MANA, terrain: [TerrainType.HILLS, TerrainType.PLAINS] },
    { deposit: TerritoryResourceType.EARTH_MANA, terrain: [TerrainType.MOUNTAIN, TerrainType.HILLS] },
    { deposit: TerritoryResourceType.AIR_MANA, terrain: [TerrainType.HILLS, TerrainType.PLAINS] },
    { deposit: TerritoryResourceType.SHADOW_MANA, terrain: [TerrainType.FOREST, TerrainType.HILLS] },
  ];

  for (const slot of oreSlots) {
    placeDeposits(grid, slot.deposit, slot.count, slot.terrain);
  }
  for (const slot of manaSlots) {
    placeDeposits(grid, slot.deposit, 1, slot.terrain);
  }
}

function seedNation(
  gameState: GameState,
  grid: Grid,
  nationId: string,
  serial: number,
  pair: { infantry: GridCoordinates; scout: GridCoordinates },
  takenPositions: GridCoordinates[],
  cityNames: string[],
): GridCoordinates[] {
  const infantry = new Infantry(`unit-inf-${serial}`, nationId, pair.infantry);
  const scout    = new Scout(`unit-scout-${serial}`, nationId, pair.scout);
  infantry.setUnitSerial(gameState.nextUnitSerial(UnitType.INFANTRY));
  scout.setUnitSerial(gameState.nextUnitSerial(UnitType.SCOUT));

  takenPositions.push(pair.infantry, pair.scout);

  const cityPositions = findCityPositions(grid, pair.infantry, takenPositions, GRID_SIZE);
  for (let j = 0; j < 2; j++) {
    const pos = cityPositions[j];
    if (!pos) continue;
    const cityName = cityNames[j] ?? `City ${serial}-${j + 1}`;
    const cityId   = `city-${serial}-${j + 1}`;
    gameState.addCity(new City(cityId, cityName, nationId, pos));
    takenPositions.push(pos);
    if (j === 0) {
      infantry.setHomeCityId(cityId);
      scout.setHomeCityId(cityId);
    }
  }

  gameState.addUnit(infantry);
  gameState.addUnit(scout);

  return cityPositions;
}

function randomInRange(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffleInPlace<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

function grantResources(
  nation: Nation,
  resources: Partial<Record<ResourceType, number>>,
): void {
  for (const [resource, amount] of Object.entries(resources)) {
    if ((amount ?? 0) <= 0) continue;
    nation.getTreasury().addResource(resource as ResourceType, amount);
  }
}

function grantTechs(nation: Nation, techs: TechId[]): void {
  for (const techId of techs) {
    nation.startResearch(techId, 1);
    nation.tickResearch();
  }
}

function placeProceduralTerrain(grid: Grid, gridSize: number): void {
  const center = (gridSize - 1) / 2;
  const baseRadius = gridSize * 0.46;
  const coastPhaseA = Math.random() * Math.PI * 2;
  const coastPhaseB = Math.random() * Math.PI * 2;

  for (let r = 1; r < gridSize - 1; r++) {
    for (let c = 1; c < gridSize - 1; c++) {
      const territory = grid.getTerritory({ row: r, col: c });
      if (!territory) continue;

      const dx = c - center;
      const dy = r - center;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const coastNoise =
        Math.sin(angle * 3 + coastPhaseA) * 1.2 +
        Math.cos(angle * 5 + coastPhaseB) * 0.7 +
        Math.sin((r + c) * 0.55) * 0.45;
      const coastline = baseRadius + coastNoise;

      if (distance > coastline) {
        territory.setTerrainType(TerrainType.WATER);
        continue;
      }

      const latitude = Math.abs((r - center) / center);
      const moisture = (Math.sin(r * 0.7 + c * 0.35 + coastPhaseA) + Math.cos(c * 0.6 - r * 0.25 + coastPhaseB)) * 0.5;
      const roughness = Math.sin(r * 0.32) + Math.cos(c * 0.28) + Math.sin((r + c) * 0.18);

      let terrain = TerrainType.PLAINS;
      if (latitude > 0.74) {
        terrain = roughness > 0.8 ? TerrainType.MOUNTAIN : TerrainType.HILLS;
      } else if (latitude < 0.18 && moisture < 0.35) {
        terrain = TerrainType.DESERT;
      } else if (latitude < 0.34 && moisture < -0.2) {
        terrain = TerrainType.DESERT;
      } else if (moisture > 0.55) {
        terrain = TerrainType.FOREST;
      } else if (roughness > 1.35) {
        terrain = TerrainType.HILLS;
      }

      territory.setTerrainType(terrain);
    }
  }

  const rangeCount = randomInRange(2, 3);
  for (let i = 0; i < rangeCount; i++) {
    carveMountainRange(grid, gridSize);
  }

  for (let i = 0; i < 6; i++) {
    const row = randomInRange(3, gridSize - 4);
    const col = randomInRange(3, gridSize - 4);
    const territory = grid.getTerritory({ row, col });
    if (!territory || territory.getTerrainType() === TerrainType.WATER || territory.getTerrainType() === TerrainType.MOUNTAIN) continue;
    enrichBiomeCluster(grid, territory.getTerrainType() === TerrainType.DESERT ? TerrainType.DESERT : TerrainType.FOREST, row, col, randomInRange(2, 4), gridSize);
  }

  smoothCoastline(grid, gridSize);
}

function placeDeposits(
  grid: Grid,
  deposit: TerritoryResourceType,
  count: number,
  terrainTypes: TerrainType[],
): void {
  const candidates: GridCoordinates[] = [];
  for (let r = 1; r < GRID_SIZE - 1; r++) {
    for (let c = 1; c < GRID_SIZE - 1; c++) {
      const territory = grid.getTerritory({ row: r, col: c });
      if (!territory) continue;
      if (territory.getResourceDeposit()) continue;
      if (!terrainTypes.includes(territory.getTerrainType())) continue;
      if (touchesWater(grid, { row: r, col: c })) continue;
      candidates.push({ row: r, col: c });
    }
  }

  shuffleInPlace(candidates);
  let placed = 0;
  for (const candidate of candidates) {
    if (placed >= count) break;
    const territory = grid.getTerritory(candidate);
    if (!territory || territory.getResourceDeposit()) continue;
    territory.setResourceDeposit(deposit);
    placed++;
  }
}

function touchesWater(grid: Grid, position: GridCoordinates): boolean {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const territory = grid.getTerritory({ row: position.row + dr, col: position.col + dc });
      if (territory?.getTerrainType() === TerrainType.WATER) return true;
    }
  }
  return false;
}

function carveMountainRange(grid: Grid, gridSize: number): void {
  let row = randomInRange(3, gridSize - 4);
  let col = Math.random() < 0.5 ? 2 : gridSize - 3;
  let directionRow = Math.random() < 0.5 ? -1 : 1;
  let directionCol = col < centerColumn(gridSize) ? 1 : -1;
  const length = randomInRange(Math.floor(gridSize * 0.55), Math.floor(gridSize * 0.9));

  for (let i = 0; i < length; i++) {
    paintMountainCell(grid, row, col);
    if (Math.random() < 0.45) paintMountainCell(grid, row + directionRow, col);
    if (Math.random() < 0.35) paintMountainCell(grid, row, col + directionCol);

    row += directionRow;
    col += directionCol;
    if (Math.random() < 0.4) directionRow += Math.random() < 0.5 ? -1 : 1;
    directionRow = Math.max(-1, Math.min(1, directionRow));
    if (Math.random() < 0.25) directionCol *= -1;

    row = Math.max(2, Math.min(gridSize - 3, row));
    col = Math.max(2, Math.min(gridSize - 3, col));
  }
}

function centerColumn(gridSize: number): number {
  return Math.floor(gridSize / 2);
}

function paintMountainCell(grid: Grid, row: number, col: number): void {
  const territory = grid.getTerritory({ row, col });
  if (!territory || territory.getTerrainType() === TerrainType.WATER) return;
  territory.setTerrainType(TerrainType.MOUNTAIN);

  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const neighbor = grid.getTerritory({ row: row + dr, col: col + dc });
    if (!neighbor || neighbor.getTerrainType() === TerrainType.WATER || neighbor.getTerrainType() === TerrainType.MOUNTAIN) continue;
    if (Math.random() < 0.55) neighbor.setTerrainType(TerrainType.HILLS);
  }
}

function enrichBiomeCluster(
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
      const territory = grid.getTerritory({ row: r, col: c });
      if (!territory || territory.getTerrainType() === TerrainType.WATER || territory.getTerrainType() === TerrainType.MOUNTAIN) continue;
      const dist = Math.abs(r - centerRow) + Math.abs(c - centerCol);
      if (dist > radius) continue;
      if (Math.random() < 0.72 - dist * 0.12) {
        territory.setTerrainType(terrain);
      }
    }
  }
}

function smoothCoastline(grid: Grid, gridSize: number): void {
  for (let r = 1; r < gridSize - 1; r++) {
    for (let c = 1; c < gridSize - 1; c++) {
      const territory = grid.getTerritory({ row: r, col: c });
      if (!territory) continue;
      const neighbors = [
        grid.getTerritory({ row: r - 1, col: c }),
        grid.getTerritory({ row: r + 1, col: c }),
        grid.getTerritory({ row: r, col: c - 1 }),
        grid.getTerritory({ row: r, col: c + 1 }),
      ];
      const waterNeighbors = neighbors.filter(neighbor => neighbor?.getTerrainType() === TerrainType.WATER).length;

      if (territory.getTerrainType() !== TerrainType.WATER && waterNeighbors >= 3) {
        territory.setTerrainType(TerrainType.WATER);
      } else if (territory.getTerrainType() === TerrainType.WATER && waterNeighbors <= 1) {
        territory.setTerrainType(TerrainType.PLAINS);
      }
    }
  }
}
