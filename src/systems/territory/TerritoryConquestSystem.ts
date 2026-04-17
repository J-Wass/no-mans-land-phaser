/**
 * TerritoryConquestSystem — handles units capturing enemy non-city territory tiles.
 *
 * Trigger: a unit is on an enemy-owned territory tile (not a city, not impassable),
 *   the two nations are at war, and no defenders are present.
 *
 * Mechanics:
 *   - Conquest progress accumulates each tick the attacker is present without defenders.
 *   - Progress pauses (but is NOT reset) when the attacker leaves.
 *   - Progress resets when an enemy defender steps on the tile.
 *   - Base cost: 30 ticks (3 s). WALLS +20, FORT +30.
 *   - On completion: tile transfers to attacker; buildings reset to OUTPOST.
 *   - Adjacent impassable tiles (mountains / water) that are unclaimed also transfer.
 */

import type { GameState } from '@/managers/GameState';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import { TerrainType } from '@/systems/grid/Territory';
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import type { GridCoordinates } from '@/types/common';

const BASE_CONQUEST_TICKS = 30; // 3 s at TICK_RATE=10

export interface ConquestState {
  position:          GridCoordinates;
  conquerorNationId: string;
  ticksProgress:     number;
  ticksNeeded:       number;
}

export class TerritoryConquestSystem {
  private conquests = new Map<string, ConquestState>(); // `row,col` key

  public tick(gameState: GameState, eventBus: GameEventBus, currentTick: number): void {
    this.advanceExisting(gameState, eventBus, currentTick);
    this.detectNew(gameState, eventBus, currentTick);
  }

  public getConquests(): ReadonlyMap<string, Readonly<ConquestState>> {
    return this.conquests;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private advanceExisting(
    gameState: GameState, eventBus: GameEventBus, currentTick: number,
  ): void {
    const grid = gameState.getGrid();

    for (const [posKey, conquest] of this.conquests) {
      const { position, conquerorNationId } = conquest;
      const territory = grid.getTerritory(position);

      // Tile vanished or already ours
      if (!territory || territory.getControllingNation() === conquerorNationId) {
        this.conquests.delete(posKey);
        continue;
      }

      const defenderNationId = territory.getControllingNation();
      // Cancel if a defender unit is on the tile
      const hasDefender = defenderNationId !== null && gameState.getAllUnits().some(u =>
        u.isAlive() &&
        u.getOwnerId() === defenderNationId &&
        u.position.row === position.row &&
        u.position.col === position.col,
      );

      if (hasDefender) {
        this.conquests.delete(posKey);
        eventBus.emit('territory:conquest-cancelled', { position: { ...position }, tick: currentTick });
        continue;
      }

      // Pause if no attacker on tile (progress preserved)
      const hasAttacker = gameState.getAllUnits().some(u =>
        u.isAlive() &&
        u.getOwnerId() === conquerorNationId &&
        !u.isEngagedInBattle() &&
        u.position.row === position.row &&
        u.position.col === position.col,
      );

      if (!hasAttacker) continue;

      conquest.ticksProgress++;

      eventBus.emit('territory:conquest-progress', {
        position: { ...position },
        progress: conquest.ticksProgress,
        needed:   conquest.ticksNeeded,
        tick:     currentTick,
      });

      if (conquest.ticksProgress >= conquest.ticksNeeded) {
        const fromNationId = territory.getControllingNation();
        territory.setControllingNation(conquerorNationId);
        territory.setBuildings([TerritoryBuildingType.OUTPOST]);
        this.conquests.delete(posKey);
        this.claimAdjacentImpassable(gameState, position, conquerorNationId);

        eventBus.emit('territory:claimed', {
          position:  { ...position },
          nationId:  conquerorNationId,
          tick:      currentTick,
          ...(fromNationId ? { fromNationId } : {}),
        });
      }
    }
  }

  private detectNew(
    gameState: GameState, eventBus: GameEventBus, currentTick: number,
  ): void {
    const grid = gameState.getGrid();

    for (const unit of gameState.getAllUnits()) {
      if (!unit.isAlive() || unit.isEngagedInBattle()) continue;

      const pos    = unit.position;
      const posKey = `${pos.row},${pos.col}`;
      if (this.conquests.has(posKey)) continue;

      const territory = grid.getTerritory(pos);
      if (!territory) continue;

      const ownerId = territory.getControllingNation();
      if (!ownerId) continue;                        // unclaimed — use OUTPOST instead
      if (ownerId === unit.getOwnerId()) continue;   // friendly
      if (territory.getCityId()) continue;           // city tile — CitySiegeSystem handles it

      // Only advance on tiles we're at war over
      const nation = gameState.getNation(unit.getOwnerId());
      if (!nation?.isAtWar(ownerId)) continue;

      const ticksNeeded = this.computeTicksNeeded(territory);
      this.conquests.set(posKey, {
        position:          { ...pos },
        conquerorNationId: unit.getOwnerId(),
        ticksProgress:     0,
        ticksNeeded,
      });

      eventBus.emit('territory:conquest-started', {
        position: { ...pos },
        nationId: unit.getOwnerId(),
        needed:   ticksNeeded,
        tick:     currentTick,
      });
    }
  }

  private computeTicksNeeded(
    territory: import('@/systems/grid/Territory').Territory,
  ): number {
    let ticks = BASE_CONQUEST_TICKS;
    if (territory.hasBuilding(TerritoryBuildingType.WALLS)) ticks += 20;
    if (territory.hasBuilding(TerritoryBuildingType.FORT))  ticks += 30;
    return ticks;
  }

  /** Auto-claim unclaimed adjacent mountains/water when a passable tile is taken. */
  private claimAdjacentImpassable(
    gameState: GameState,
    position:  GridCoordinates,
    nationId:  string,
  ): void {
    const grid    = gameState.getGrid();
    const offsets = [
      { row: -1, col: 0 }, { row: 1, col: 0 },
      { row: 0, col: -1 }, { row: 0, col: 1 },
    ];
    for (const off of offsets) {
      const nbr = grid.getTerritory({ row: position.row + off.row, col: position.col + off.col });
      if (!nbr) continue;
      const t = nbr.getTerrainType();
      if (t !== TerrainType.WATER && t !== TerrainType.MOUNTAIN) continue;
      if (nbr.getControllingNation()) continue;
      nbr.setControllingNation(nationId);
    }
  }
}
