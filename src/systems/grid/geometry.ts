/**
 * Shared grid geometry helpers.
 *
 * These were previously re-implemented (manhattan/chebyshev distance, the
 * four-direction offset array) in half a dozen systems. Centralizing them keeps
 * the definitions identical everywhere and avoids subtle drift.
 */

import type { GridCoordinates } from '@/types/common';

/** Orthogonal (N/S/E/W) neighbor offsets. */
export const CARDINAL_OFFSETS: ReadonlyArray<{ row: number; col: number }> = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

/** Diagonal neighbor offsets. */
export const DIAGONAL_OFFSETS: ReadonlyArray<{ row: number; col: number }> = [
  { row: -1, col: -1 },
  { row: -1, col: 1 },
  { row: 1, col: -1 },
  { row: 1, col: 1 },
];

/** All eight surrounding neighbor offsets. */
export const ALL_NEIGHBOR_OFFSETS: ReadonlyArray<{ row: number; col: number }> = [
  ...CARDINAL_OFFSETS,
  ...DIAGONAL_OFFSETS,
];

/** Manhattan (taxicab) distance — orthogonal steps only. */
export function manhattan(a: GridCoordinates, b: GridCoordinates): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

/** Chebyshev distance — diagonal moves count as one step. */
export function chebyshev(a: GridCoordinates, b: GridCoordinates): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}
