/**
 * VisionSystem — computes fog-of-war visibility for a nation each frame.
 *
 * Visible tiles:   own territory tiles + 2-tile border + unit vision radii
 * Near-visible:    2 tiles beyond each unit's vision radius (unidentified contacts)
 * Discovered:      union of all previously visible tiles (stored in GameState)
 *
 * Air mana:    +1 vision radius to all of the nation's units
 * Shadow mana: the first active mine hides enemy units by 1 tile
 *              when determining direct or near visibility
 */

import type { GameState } from '@/managers/GameState';
import { airManaVisionBonus, shadowManaVisionReduction } from '@/systems/resources/ResourceBonuses';
import type { Unit } from '@/entities/units/Unit';

export interface VisionResult {
  /** Tiles where everything is visible. */
  visible:     Set<string>;
  /** 2 tiles beyond each unit's vision radius — shows unidentified contacts. */
  nearVisible: Set<string>;
  /** All tiles ever seen (discovered but maybe not currently visible). */
  discovered:  Set<string>;
}

const FOG_EDGE_DISTANCE = 2;

export class VisionSystem {
  /**
   * Compute current visibility for `nationId`.
   * Updates `gameState.getDiscoveredTiles(nationId)` as a side-effect.
   */
  public compute(gameState: GameState, nationId: string): VisionResult {
    const deposits = gameState.getNationActiveDeposits(nationId);
    const counts   = gameState.getNationActiveDepositCounts(nationId);
    const airBonus = airManaVisionBonus(deposits, counts);
    const grid     = gameState.getGrid();
    const visible     = new Set<string>();
    const nearVisible = new Set<string>();

    // ── Own territory + 2-tile Manhattan border ────────────────────────────
    for (const territory of grid.getTerritoriesByNation(nationId)) {
      const { row, col } = territory.getCoordinates();
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if (Math.abs(dr) + Math.abs(dc) > 2) continue;
          const r = row + dr;
          const c = col + dc;
          if (grid.isValidCoordinate({ row: r, col: c })) {
            visible.add(`${r},${c}`);
          }
        }
      }
    }

    // ── Unit vision ────────────────────────────────────────────────────────
    for (const unit of gameState.getUnitsByNation(nationId)) {
      if (!unit.isAlive()) continue;
      const radius = unit.getStats().vision + airBonus;
      this.addVisionCircle(unit, radius, grid, visible, nearVisible);
    }

    // Near-visible tiles must not overlap visible
    for (const key of visible) nearVisible.delete(key);

    // ── Update discovered tiles ────────────────────────────────────────────
    gameState.markDiscovered(nationId, visible);
    gameState.markDiscovered(nationId, nearVisible);
    const discovered = gameState.getDiscoveredTiles(nationId);

    return { visible, nearVisible, discovered };
  }

  /**
   * Determine if an enemy `unit` is visible to the viewer nation, accounting
   * for the shadow-mana penalty: if the unit's nation has shadow mana active,
   * the viewer's effective vision is reduced by 1 for that check.
   *
   * Returns:
   *  'visible'     — unit is within the viewer's vision radius
   *  'near'        — unit is in the near-visible ring (unidentified contact)
   *  'hidden'      — unit is beyond detection range
   */
  /**
   * Determine if an enemy `unit` is visible to the viewer nation.
   *
   * Shadow mana on the enemy unit's nation subtracts 1 vision from each observer unit
   * when detecting that unit. Additional shadow mana no longer stacks visibility reduction.
   *
   * Air mana on the viewer nation still adds +1 vision per mine (up to +3), which can
   * fully counteract that concealment.
   */
  public unitVisibility(
    unit: Unit,
    viewerVisible:     Set<string>,
    viewerNearVisible: Set<string>,
    gameState:         GameState,
    viewerNationId:    string,
  ): 'visible' | 'near' | 'hidden' {
    const enemyDeposits  = gameState.getNationActiveDeposits(unit.getOwnerId());
    const enemyCounts    = gameState.getNationActiveDepositCounts(unit.getOwnerId());
    const shadowReduction = shadowManaVisionReduction(enemyDeposits, enemyCounts);

    const key = `${unit.position.row},${unit.position.col}`;

    if (shadowReduction === 0) {
      // Fast path: no shadow mana, use precomputed sets
      if (viewerVisible.has(key))     return 'visible';
      if (viewerNearVisible.has(key)) return 'near';
      return 'hidden';
    }

    // Shadow mana path: recheck by iterating each observer unit with reduced vision
    const viewerDeposits = gameState.getNationActiveDeposits(viewerNationId);
    const viewerCounts   = gameState.getNationActiveDepositCounts(viewerNationId);
    const airBonus       = airManaVisionBonus(viewerDeposits, viewerCounts);

    const { row: sr, col: sc } = unit.position;
    let result: 'visible' | 'near' | 'hidden' = 'hidden';

    for (const observer of gameState.getUnitsByNation(viewerNationId)) {
      if (!observer.isAlive()) continue;
      const effectiveVision = Math.max(0, observer.getStats().vision + airBonus - shadowReduction);
      const dist = Math.abs(observer.position.row - sr) + Math.abs(observer.position.col - sc);
      if (dist <= effectiveVision)     return 'visible'; // best result, short-circuit
      if (dist <= effectiveVision + FOG_EDGE_DISTANCE) result = 'near';
    }

    return result;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private addVisionCircle(
    unit:        Unit,
    radius:      number,
    grid:        import('@/systems/grid/Grid').Grid,
    visible:     Set<string>,
    nearVisible: Set<string>,
  ): void {
    const { row: ur, col: uc } = unit.position;
    const nearRadius = radius + FOG_EDGE_DISTANCE;

    for (let dr = -nearRadius; dr <= nearRadius; dr++) {
      for (let dc = -nearRadius; dc <= nearRadius; dc++) {
        const dist = Math.abs(dr) + Math.abs(dc);
        if (dist > nearRadius) continue;
        const r = ur + dr;
        const c = uc + dc;
        if (!grid.isValidCoordinate({ row: r, col: c })) continue;
        const key = `${r},${c}`;
        if (dist <= radius) {
          visible.add(key);
        } else {
          nearVisible.add(key);
        }
      }
    }
  }
}
