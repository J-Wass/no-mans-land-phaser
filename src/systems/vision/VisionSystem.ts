/**
 * VisionSystem — computes fog-of-war visibility for a nation each frame.
 *
 * Visible tiles:   own territory tiles + 2-tile border + unit vision radii
 * Near-visible:    1 tile beyond each unit's vision radius (unidentified contacts)
 * Discovered:      union of all previously visible tiles (stored in GameState)
 *
 * Air mana:    +1 vision radius to all of the nation's units
 * Shadow mana: enemy shadow-mana nations are treated as 1 tile farther away
 *              when determining near-visible detection
 */

import type { GameState } from '@/managers/GameState';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import type { Unit } from '@/entities/units/Unit';

export interface VisionResult {
  /** Tiles where everything is visible. */
  visible:     Set<string>;
  /** 1 tile beyond each unit's vision radius — shows unidentified contacts. */
  nearVisible: Set<string>;
  /** All tiles ever seen (discovered but maybe not currently visible). */
  discovered:  Set<string>;
}

export class VisionSystem {
  /**
   * Compute current visibility for `nationId`.
   * Updates `gameState.getDiscoveredTiles(nationId)` as a side-effect.
   */
  public compute(gameState: GameState, nationId: string): VisionResult {
    const deposits    = gameState.getNationActiveDeposits(nationId);
    const airMana     = deposits.has(TerritoryResourceType.AIR_MANA) ? 1 : 0;
    const grid        = gameState.getGrid();
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
      const radius = unit.getStats().vision + airMana;
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
  public unitVisibility(
    unit: Unit,
    viewerVisible:     Set<string>,
    viewerNearVisible: Set<string>,
    gameState:         GameState,
    viewerNationId:    string,
  ): 'visible' | 'near' | 'hidden' {
    const key = `${unit.position.row},${unit.position.col}`;

    if (viewerVisible.has(key)) return 'visible';

    // Shadow mana: enemy units with shadow mana active require the viewer to be
    // within the visible range (not just near-visible) to detect them.
    const enemyDeposits = gameState.getNationActiveDeposits(unit.getOwnerId());
    const shadowPenalty = enemyDeposits.has(TerritoryResourceType.SHADOW_MANA) ? 1 : 0;

    if (shadowPenalty > 0) {
      // Shadow units are invisible even in the near-visible ring unless within visible range
      return 'hidden';
    }

    if (viewerNearVisible.has(key)) return 'near';

    void viewerNationId; // reserved for future ally-vision pass
    return 'hidden';
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
    const nearRadius = radius + 1;

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
