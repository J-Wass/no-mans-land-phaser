/**
 * BootScene — builds the initial GameState from a GameSetup and starts GameScene.
 *
 * Spawn placement: each team gets two units on the coast (inner edge of the water
 * border) using farthest-point sampling so teams are maximally spread apart.
 * The starting candidate is chosen randomly, so layouts differ every game.
 */

import Phaser from 'phaser';
import { GameState } from '@/managers/GameState';
import { Nation } from '@/entities/nations/Nation';
import { Player } from '@/entities/players/Player';
import { Infantry } from '@/entities/units/Infantry';
import { Scout } from '@/entities/units/Scout';
import { City } from '@/entities/cities/City';
import { TerrainType } from '@/systems/grid/Territory';
import type { GameSetup } from '@/types/gameSetup';
import {
  pickCoastalSpawnPairs,
  findCityPositions,
  assignStartingTerritory,
} from '@/systems/spawn/SpawnSystem';

const GRID_SIZE = 25;

interface BootSceneData {
  setup?: GameSetup;
}

// Fixed nation identities — positions are determined at runtime by the spawn algorithm
const NATION_CONFIGS = [
  { id: 'nation-1', name: 'Rome',     color: '#e63946', cities: ['Roma',       'Capua'      ] },
  { id: 'nation-2', name: 'Persia',   color: '#457b9d', cities: ['Persepolis', 'Susa'       ] },
  { id: 'nation-3', name: 'Greece',   color: '#2a9d8f', cities: ['Athens',     'Corinth'    ] },
  { id: 'nation-4', name: 'Egypt',    color: '#e9c46a', cities: ['Alexandria', 'Memphis'    ] },
  { id: 'nation-5', name: 'Carthage', color: '#f4a261', cities: ['Carthago',   'Utica'      ] },
] as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(data: BootSceneData): void {
    const setup: GameSetup = data?.setup ?? { opponentCount: 1, difficulty: 'medium' };
    const gameState = new GameState({ rows: GRID_SIZE, cols: GRID_SIZE });
    const grid = gameState.getGrid();

    // ── Terrain (must be set before spawn algorithm queries it) ──────────────

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (r === 0 || r === GRID_SIZE - 1 || c === 0 || c === GRID_SIZE - 1) {
          grid.getTerritory({ row: r, col: c })?.setTerrainType(TerrainType.WATER);
        }
      }
    }

    const forestTiles: [number, number][] = [
      [3, 4], [3, 5], [4, 4], [4, 5], [4, 6], [5, 5], [5, 6],
      [14, 16], [14, 17], [15, 16], [15, 17], [15, 18], [16, 17],
    ];
    const hillTiles: [number, number][] = [
      [8, 17], [8, 18], [9, 17], [9, 18], [9, 19], [10, 18],
      [18, 5], [18, 6], [19, 5], [19, 6],
    ];
    const desertTiles: [number, number][] = [
      [19, 14], [19, 15], [20, 14], [20, 15], [20, 16], [21, 15],
      [5, 18], [6, 18], [6, 19], [7, 18],
    ];
    const mountainTiles: [number, number][] = [
      [2, 17], [3, 17], [3, 18], [4, 17],
      [20, 7], [21, 7], [21, 8], [22, 7],
    ];
    const interiorWaterTiles: [number, number][] = [
      [11, 10], [11, 11], [12, 10], [12, 11], [12, 12], [13, 11],
    ];

    for (const [r, c] of forestTiles)        grid.getTerritory({ row: r, col: c })?.setTerrainType(TerrainType.FOREST);
    for (const [r, c] of hillTiles)          grid.getTerritory({ row: r, col: c })?.setTerrainType(TerrainType.HILLS);
    for (const [r, c] of desertTiles)        grid.getTerritory({ row: r, col: c })?.setTerrainType(TerrainType.DESERT);
    for (const [r, c] of mountainTiles)      grid.getTerritory({ row: r, col: c })?.setTerrainType(TerrainType.MOUNTAIN);
    for (const [r, c] of interiorWaterTiles) grid.getTerritory({ row: r, col: c })?.setTerrainType(TerrainType.WATER);

    // ── Spawn placement ───────────────────────────────────────────────────────

    const totalNations  = 1 + Math.min(setup.opponentCount, 4);
    const spawnPairs    = pickCoastalSpawnPairs(grid, GRID_SIZE, totalNations);
    const takenPositions: import('@/types/common').GridCoordinates[] = [];

    for (let i = 0; i < totalNations; i++) {
      const cfg  = NATION_CONFIGS[i];
      const pair = spawnPairs[i];
      if (!cfg || !pair) break;

      const isLocal  = i === 0;
      const playerId = `player-${i + 1}`;

      const nation = new Nation(cfg.id, cfg.name, cfg.color, !isLocal);
      nation.setControlledBy(playerId);
      gameState.addNation(nation);

      gameState.addPlayer(new Player(playerId, isLocal ? 'Player' : cfg.name, cfg.id, isLocal));

      gameState.addUnit(new Infantry(`unit-inf-${i + 1}`,   cfg.id, pair.infantry));
      gameState.addUnit(new Scout(   `unit-scout-${i + 1}`, cfg.id, pair.scout));

      takenPositions.push(pair.infantry, pair.scout);

      // Place 2 cities near the spawn, spaced apart
      const cityPositions = findCityPositions(grid, pair.infantry, takenPositions, GRID_SIZE);
      for (let j = 0; j < 2; j++) {
        const pos = cityPositions[j];
        if (!pos) continue;
        const cityName = cfg.cities[j] ?? `${cfg.name} ${j + 1}`;
        const cityId   = `city-${i + 1}-${j + 1}`;
        gameState.addCity(new City(cityId, cityName, cfg.id, pos));
        takenPositions.push(pos);
      }

      // Assign starting territory — an ellipse connecting the two cities
      assignStartingTerritory(grid, cfg.id, cityPositions, GRID_SIZE);
    }

    this.scene.start('GameScene', { gameState, setup });
  }
}
