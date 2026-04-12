/**
 * Common types used across the game
 */

export interface Position {
  x: number;
  y: number;
}

export interface GridCoordinates {
  row: number;
  col: number;
}

export type EntityId = string;

export enum EntityType {
  UNIT = 'UNIT',
  CITY = 'CITY',
  TERRITORY = 'TERRITORY'
}

export interface GameEntity {
  id: EntityId;
  type: EntityType;
  position: GridCoordinates;
}
