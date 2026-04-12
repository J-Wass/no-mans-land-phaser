/**
 * Grid system - manages the game board
 */

import { Territory, TerrainType } from './Territory';
import type { GridCoordinates, EntityId } from '@/types/common';

export interface GridConfig {
  rows: number;
  cols: number;
}

export class Grid {
  private territories: Map<string, Territory>;
  private readonly rows: number;
  private readonly cols: number;

  constructor(config: GridConfig) {
    this.rows = config.rows;
    this.cols = config.cols;
    this.territories = new Map();
    this.initializeGrid();
  }

  private initializeGrid(): void {
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const coords: GridCoordinates = { row, col };
        const territory = new Territory(coords, TerrainType.PLAINS);
        this.territories.set(this.coordsToKey(coords), territory);
      }
    }
  }

  private coordsToKey(coords: GridCoordinates): string {
    return `${coords.row},${coords.col}`;
  }

  public getTerritory(coords: GridCoordinates): Territory | null {
    const territory = this.territories.get(this.coordsToKey(coords));
    return territory ?? null;
  }

  public isValidCoordinate(coords: GridCoordinates): boolean {
    return coords.row >= 0 && coords.row < this.rows &&
           coords.col >= 0 && coords.col < this.cols;
  }

  public getNeighbors(coords: GridCoordinates): Territory[] {
    const neighbors: Territory[] = [];
    const offsets = [
      { row: -1, col: 0 },  // North
      { row: 1, col: 0 },   // South
      { row: 0, col: -1 },  // West
      { row: 0, col: 1 }    // East
    ];

    offsets.forEach(offset => {
      const neighborCoords: GridCoordinates = {
        row: coords.row + offset.row,
        col: coords.col + offset.col
      };

      if (this.isValidCoordinate(neighborCoords)) {
        const territory = this.getTerritory(neighborCoords);
        if (territory) {
          neighbors.push(territory);
        }
      }
    });

    return neighbors;
  }

  public getTerritoriesByNation(nationId: EntityId): Territory[] {
    const territories: Territory[] = [];
    this.territories.forEach(territory => {
      if (territory.getControllingNation() === nationId) {
        territories.push(territory);
      }
    });
    return territories;
  }

  public getSize(): GridConfig {
    return { rows: this.rows, cols: this.cols };
  }

  public getAllTerritories(): Territory[] {
    return Array.from(this.territories.values());
  }
}
