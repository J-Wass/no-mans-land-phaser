/**
 * CommandProcessor — validates and dispatches game commands.
 *
 * All state mutations go through here instead of calling systems directly.
 * Future multiplayer: add authorization checks, then broadcast via NetworkAdapter.
 */

import type { GameState } from '@/managers/GameState';
import type { MovementSystem } from '@/systems/movement/MovementSystem';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import type { DiplomacySystem } from '@/systems/diplomacy/DiplomacySystem';
import type {
  GameCommand, CommandResult,
  MoveUnitCommand, BuildTerritoryCommand, BuildCityBuildingCommand,
  UpgradeTerritoryBuildingCommand,
  StartResearchCommand, CancelResearchCommand, StartCityProductionCommand,
  SetUnitBattleOrderCommand,
  DeclareWarCommand, ProposePeaceCommand, OfferTradeCommand,
} from './GameCommand';
import { PRODUCTION_CATALOG } from '@/systems/production/ProductionCatalog';
import { TERRITORY_BUILDING_MAP, TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import { MAX_WALLS_LEVEL } from '@/systems/grid/Territory';
import { CITY_BUILDING_MAP } from '@/systems/territory/CityBuilding';
import { TECH_MAP } from '@/systems/research/TechTree';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import { ResourceType } from '@/systems/resources/ResourceType';
import { TerrainType } from '@/systems/grid/Territory';
import type { GridCoordinates } from '@/types/common';

const MANA_DEPOSITS = new Set<TerritoryResourceType>([
  TerritoryResourceType.WATER_MANA,
  TerritoryResourceType.FIRE_MANA,
  TerritoryResourceType.LIGHTNING_MANA,
  TerritoryResourceType.EARTH_MANA,
  TerritoryResourceType.AIR_MANA,
  TerritoryResourceType.SHADOW_MANA,
]);

export class CommandProcessor {
  constructor(
    private gameState: GameState,
    private movementSystem: MovementSystem,
    private eventBus: GameEventBus,
    private diplomacySystem?: DiplomacySystem,
  ) {}

  public dispatch(command: GameCommand): CommandResult {
    switch (command.type) {
      case 'MOVE_UNIT':              return this.handleMoveUnit(command);
      case 'BUILD_TERRITORY':        return this.handleBuildTerritory(command);
      case 'BUILD_CITY_BUILDING':    return this.handleBuildCityBuilding(command);
      case 'UPGRADE_TERRITORY':      return this.handleUpgradeTerritory(command);
      case 'START_RESEARCH':         return this.handleStartResearch(command);
      case 'CANCEL_RESEARCH':        return this.handleCancelResearch(command);
      case 'START_CITY_PRODUCTION':  return this.handleStartCityProduction(command);
      case 'SET_UNIT_BATTLE_ORDER':  return this.handleSetUnitBattleOrder(command);
      case 'DECLARE_WAR':            return this.handleDeclareWar(command);
      case 'PROPOSE_PEACE':          return this.handleProposePeace(command);
      case 'OFFER_TRADE':            return this.handleOfferTrade(command);
    }
  }

  // ── MOVE_UNIT ─────────────────────────────────────────────────────────────

  private handleMoveUnit(command: MoveUnitCommand): CommandResult {
    if (command.path.length === 0)
      return { success: false, reason: 'Path is empty' };

    const player = this.gameState.getPlayer(command.playerId);
    if (!player) return { success: false, reason: 'Player not found' };

    const unit = this.gameState.getUnit(command.unitId);
    if (!unit)        return { success: false, reason: 'Unit not found' };
    if (!unit.isAlive()) return { success: false, reason: 'Unit is dead' };
    if (unit.isEngagedInBattle())
      return { success: false, reason: 'Unit is engaged in battle' };

    const nation = this.gameState.getNation(player.getControlledNationId());
    if (!nation || unit.getOwnerId() !== nation.getId())
      return { success: false, reason: 'Unit does not belong to this player' };

    this.movementSystem.issueOrder(unit, command.path);
    this.eventBus.emit('unit:move-ordered', {
      unitId: command.unitId, path: command.path, playerId: command.playerId,
    });
    return { success: true };
  }

  // ── BUILD_TERRITORY ───────────────────────────────────────────────────────

  private handleBuildTerritory(command: BuildTerritoryCommand): CommandResult {
    const player = this.gameState.getPlayer(command.playerId);
    if (!player) return { success: false, reason: 'Player not found' };

    const nation = this.gameState.getNation(player.getControlledNationId());
    if (!nation) return { success: false, reason: 'Nation not found' };

    const territory = this.gameState.getGrid().getTerritory(command.position);
    if (!territory) return { success: false, reason: 'Territory not found' };

    const def = TERRITORY_BUILDING_MAP.get(command.building);
    if (!def) return { success: false, reason: 'Unknown building type' };

    // ── Tech requirement ────────────────────────────────────────────────────
    if (def.requiresTech && !nation.hasResearched(def.requiresTech))
      return { success: false, reason: `Requires research: ${def.requiresTech}` };

    // ── OUTPOST (special: claims unclaimed territory) ───────────────────────
    if (command.building === TerritoryBuildingType.OUTPOST) {
      if (territory.getControllingNation())
        return { success: false, reason: 'Territory already claimed' };

      const unitOnTile = this.gameState.getAllUnits().find(u =>
        u.getOwnerId() === nation.getId() &&
        u.position.row === command.position.row &&
        u.position.col === command.position.col,
      );
      if (!unitOnTile)
        return { success: false, reason: 'No friendly unit on territory' };

      if (!nation.getTreasury().hasResources(def.cost))
        return { success: false, reason: 'Insufficient resources' };

      nation.getTreasury().consumeResources(def.cost);
      territory.setControllingNation(nation.getId());
      territory.addBuilding(TerritoryBuildingType.OUTPOST);
      this.claimAdjacentImpassable(command.position, nation.getId());
      this.eventBus.emit('territory:claimed', {
        position: command.position, nationId: nation.getId(), tick: command.issuedAtTick,
      });
      this.eventBus.emit('territory:building-built', {
        position: command.position, building: command.building, tick: command.issuedAtTick,
      });
      return { success: true };
    }

    // ── All other territory buildings ────────────────────────────────────────
    if (territory.getControllingNation() !== nation.getId())
      return { success: false, reason: 'Territory not owned by your nation' };

    if (territory.hasBuilding(command.building))
      return { success: false, reason: 'Building already exists here' };

    if (def.requires && !territory.hasBuilding(def.requires))
      return { success: false, reason: `Requires ${def.requires} first` };

    // ── Deposit check (mines) ────────────────────────────────────────────────
    if (command.building === TerritoryBuildingType.MANA_MINE) {
      const deposit = territory.getResourceDeposit();
      if (!deposit || !MANA_DEPOSITS.has(deposit))
        return { success: false, reason: 'No mana deposit on this territory' };
    } else if (def.requiresDeposit) {
      if (territory.getResourceDeposit() !== def.requiresDeposit)
        return { success: false, reason: 'Required resource deposit not present' };
    }

    if (!nation.getTreasury().hasResources(def.cost))
      return { success: false, reason: 'Insufficient resources' };

    nation.getTreasury().consumeResources(def.cost);
    territory.addBuilding(command.building);
    this.eventBus.emit('territory:building-built', {
      position: command.position, building: command.building, tick: command.issuedAtTick,
    });
    return { success: true };
  }

  // ── UPGRADE_TERRITORY ────────────────────────────────────────────────────

  private handleUpgradeTerritory(command: UpgradeTerritoryBuildingCommand): CommandResult {
    const player = this.gameState.getPlayer(command.playerId);
    if (!player) return { success: false, reason: 'Player not found' };

    const nation = this.gameState.getNation(player.getControlledNationId());
    if (!nation) return { success: false, reason: 'Nation not found' };

    const territory = this.gameState.getGrid().getTerritory(command.position);
    if (!territory) return { success: false, reason: 'Territory not found' };
    if (territory.getControllingNation() !== nation.getId())
      return { success: false, reason: 'Territory not owned by your nation' };
    if (!territory.hasBuilding(command.building))
      return { success: false, reason: `${command.building} not yet built here` };

    const def = TERRITORY_BUILDING_MAP.get(command.building);
    if (!def) return { success: false, reason: 'Unknown building type' };

    const currentLevel = territory.getBuildingLevel(command.building);
    const maxLevel     = command.building === TerritoryBuildingType.WALLS ? MAX_WALLS_LEVEL : def.maxLevel;
    if (currentLevel >= maxLevel)
      return { success: false, reason: `Already at maximum level (${maxLevel})` };

    if (!nation.getTreasury().hasResources(def.upgradeCost))
      return { success: false, reason: 'Insufficient resources' };

    nation.getTreasury().consumeResources(def.upgradeCost);
    territory.upgradeBuildingLevel(command.building);
    const newLevel = territory.getBuildingLevel(command.building);
    this.eventBus.emit('territory:building-upgraded', {
      position: command.position, building: command.building,
      newLevel, tick: command.issuedAtTick,
    });
    return { success: true };
  }

  // ── BUILD_CITY_BUILDING ───────────────────────────────────────────────────

  private handleBuildCityBuilding(command: BuildCityBuildingCommand): CommandResult {
    const player = this.gameState.getPlayer(command.playerId);
    if (!player) return { success: false, reason: 'Player not found' };

    const nation = this.gameState.getNation(player.getControlledNationId());
    if (!nation) return { success: false, reason: 'Nation not found' };

    const city = this.gameState.getCity(command.cityId);
    if (!city || city.getOwnerId() !== nation.getId())
      return { success: false, reason: 'City not found or not owned' };

    if (city.getCurrentOrder())
      return { success: false, reason: 'City production queue is busy' };

    if (city.hasBuilding(command.building))
      return { success: false, reason: 'Building already constructed' };

    const def = CITY_BUILDING_MAP.get(command.building);
    if (!def) return { success: false, reason: 'Unknown building type' };

    if (def.requiresTech && !nation.hasResearched(def.requiresTech))
      return { success: false, reason: `Requires research: ${def.requiresTech}` };

    if (!nation.getTreasury().hasResources(def.cost))
      return { success: false, reason: 'Insufficient resources' };

    nation.getTreasury().consumeResources(def.cost);
    city.startOrder({
      kind:            'building',
      buildingType:    command.building,
      label:           def.label,
      ticksTotal:      def.ticks,
      ticksRemaining:  def.ticks,
    });
    return { success: true };
  }

  // ── START_RESEARCH ────────────────────────────────────────────────────────

  private handleStartResearch(command: StartResearchCommand): CommandResult {
    const player = this.gameState.getPlayer(command.playerId);
    if (!player) return { success: false, reason: 'Player not found' };

    const nation = this.gameState.getNation(player.getControlledNationId());
    if (!nation) return { success: false, reason: 'Nation not found' };

    if (nation.getCurrentResearch())
      return { success: false, reason: 'Already researching something' };

    if (nation.hasResearched(command.techId))
      return { success: false, reason: 'Already researched' };

    if (!nation.canResearch(command.techId))
      return { success: false, reason: 'Prerequisites not met' };

    const node = TECH_MAP.get(command.techId);
    if (!node) return { success: false, reason: 'Unknown tech' };

    const treasury = nation.getTreasury();
    if (treasury.getAmount(ResourceType.RESEARCH) < node.researchCost)
      return { success: false, reason: `Insufficient research points (need ${node.researchCost})` };

    treasury.consumeResources({ [ResourceType.RESEARCH]: node.researchCost });
    nation.startResearch(command.techId, node.ticks);
    this.eventBus.emit('nation:research-started', {
      nationId: nation.getId(), techId: command.techId,
    });
    return { success: true };
  }

  // ── START_CITY_PRODUCTION ─────────────────────────────────────────────────

  private handleStartCityProduction(command: StartCityProductionCommand): CommandResult {
    const player = this.gameState.getPlayer(command.playerId);
    if (!player) return { success: false, reason: 'Player not found' };

    const nation = this.gameState.getNation(player.getControlledNationId());
    if (!nation) return { success: false, reason: 'Nation not found' };

    const city = this.gameState.getCity(command.cityId);
    if (!city || city.getOwnerId() !== nation.getId())
      return { success: false, reason: 'City not found or not owned' };

    if (city.getCurrentOrder())
      return { success: false, reason: 'City production queue is busy' };

    const entry = PRODUCTION_CATALOG.find(e => e.id === `unit:${command.unitType}`);
    if (!entry) return { success: false, reason: 'Unknown unit type' };

    const techsOk = entry.requiresTechs.every(t => nation.hasResearched(t));
    if (!techsOk) return { success: false, reason: 'Required tech not researched' };

    if (entry.requiresBuilding && !city.hasBuilding(entry.requiresBuilding))
      return { success: false, reason: `Requires ${entry.requiresBuilding}` };

    if (entry.requiresDeposit) {
      const deposits = this.gameState.getNationActiveDeposits(nation.getId());
      if (!deposits.has(entry.requiresDeposit))
        return { success: false, reason: `Requires active ${entry.requiresDeposit} mine` };
    }

    if (!nation.getTreasury().hasResources(entry.cost))
      return { success: false, reason: 'Insufficient resources' };

    nation.getTreasury().consumeResources(entry.cost);
    city.startOrder(entry.makeOrder());
    return { success: true };
  }

  // ── CANCEL_RESEARCH ───────────────────────────────────────────────────────

  private handleCancelResearch(command: CancelResearchCommand): CommandResult {
    const player = this.gameState.getPlayer(command.playerId);
    if (!player) return { success: false, reason: 'Player not found' };

    const nation = this.gameState.getNation(player.getControlledNationId());
    if (!nation) return { success: false, reason: 'Nation not found' };

    nation.cancelResearch();
    return { success: true };
  }

  private handleSetUnitBattleOrder(command: SetUnitBattleOrderCommand): CommandResult {
    const player = this.gameState.getPlayer(command.playerId);
    if (!player) return { success: false, reason: 'Player not found' };

    const nation = this.gameState.getNation(player.getControlledNationId());
    if (!nation) return { success: false, reason: 'Nation not found' };

    const unit = this.gameState.getUnit(command.unitId);
    if (!unit || unit.getOwnerId() !== nation.getId())
      return { success: false, reason: 'Unit not found or not owned' };

    unit.setBattleOrder(command.battleOrder);
    this.eventBus.emit('unit:battle-order-changed', {
      unitId: unit.id,
      battleOrder: command.battleOrder,
      tick: command.issuedAtTick,
    });
    return { success: true };
  }

  // ── DECLARE_WAR ───────────────────────────────────────────────────────────

  private handleDeclareWar(command: DeclareWarCommand): CommandResult {
    if (!this.diplomacySystem) return { success: false, reason: 'Diplomacy system unavailable' };

    const player = this.gameState.getPlayer(command.playerId);
    if (!player) return { success: false, reason: 'Player not found' };

    const nation = this.gameState.getNation(player.getControlledNationId());
    if (!nation) return { success: false, reason: 'Nation not found' };

    const ok = this.diplomacySystem.declareWar(nation.getId(), command.targetNationId, command.issuedAtTick);
    return ok ? { success: true } : { success: false, reason: 'Cannot declare war (cooldown or already at war)' };
  }

  // ── PROPOSE_PEACE ─────────────────────────────────────────────────────────

  private handleProposePeace(command: ProposePeaceCommand): CommandResult {
    if (!this.diplomacySystem) return { success: false, reason: 'Diplomacy system unavailable' };

    const player = this.gameState.getPlayer(command.playerId);
    if (!player) return { success: false, reason: 'Player not found' };

    const nation = this.gameState.getNation(player.getControlledNationId());
    if (!nation) return { success: false, reason: 'Nation not found' };

    const ok = this.diplomacySystem.proposePeace(
      nation.getId(), command.targetNationId, command.issuedAtTick, this.movementSystem,
    );
    return ok ? { success: true } : { success: false, reason: 'Not at war with this nation' };
  }

  // ── Shared helpers ────────────────────────────────────────────────────────

  /** Claim unclaimed adjacent mountain/water tiles when an outpost is built. */
  private claimAdjacentImpassable(position: GridCoordinates, nationId: string): void {
    const offsets = [
      { row: -1, col: 0 }, { row: 1, col: 0 },
      { row: 0, col: -1 }, { row: 0, col: 1 },
    ];
    const grid = this.gameState.getGrid();
    for (const off of offsets) {
      const nbr = grid.getTerritory({ row: position.row + off.row, col: position.col + off.col });
      if (!nbr) continue;
      const t = nbr.getTerrainType();
      if (t !== TerrainType.WATER && t !== TerrainType.MOUNTAIN) continue;
      if (nbr.getControllingNation()) continue;
      nbr.setControllingNation(nationId);
    }
  }

  // ── OFFER_TRADE ───────────────────────────────────────────────────────────

  private handleOfferTrade(command: OfferTradeCommand): CommandResult {
    const player = this.gameState.getPlayer(command.playerId);
    if (!player) return { success: false, reason: 'Player not found' };

    const localNation  = this.gameState.getNation(player.getControlledNationId());
    if (!localNation)  return { success: false, reason: 'Nation not found' };

    const targetNation = this.gameState.getNation(command.targetNationId);
    if (!targetNation) return { success: false, reason: 'Target nation not found' };

    // If the target nation is AI-controlled, it evaluates and may reject the offer
    if (targetNation.isAIControlled() && this.diplomacySystem) {
      const evaluation = this.diplomacySystem.evaluateTradeForAI(
        localNation.getId(),
        targetNation.getId(),
        command.offer,
        command.request,
        command.issuedAtTick,
      );
      if (!evaluation.accepted) {
        const secs = Math.ceil(evaluation.backoffTicks / 10);
        const reason = evaluation.backoffTicks > 0
          ? `Trade rejected. Try again in ${secs}s.`
          : 'Trade rejected.';
        return { success: false, reason };
      }
    }

    const localTreasury  = localNation.getTreasury();
    const targetTreasury = targetNation.getTreasury();

    // Verify both sides have sufficient resources
    for (const [type, amount] of Object.entries(command.offer)) {
      if ((amount ?? 0) > 0 && !localTreasury.hasResources({ [type]: amount }))
        return { success: false, reason: `Insufficient ${type} to offer` };
    }
    for (const [type, amount] of Object.entries(command.request)) {
      if ((amount ?? 0) > 0 && !targetTreasury.hasResources({ [type]: amount }))
        return { success: false, reason: `Target nation lacks ${type}` };
    }

    // Execute the transfer
    for (const [type, amount] of Object.entries(command.offer)) {
      if ((amount ?? 0) > 0) {
        localTreasury.consumeResources({ [type]: amount });
        targetTreasury.addResource(type as import('@/systems/resources/ResourceType').ResourceType, amount!);
      }
    }
    for (const [type, amount] of Object.entries(command.request)) {
      if ((amount ?? 0) > 0) {
        targetTreasury.consumeResources({ [type]: amount });
        localTreasury.addResource(type as import('@/systems/resources/ResourceType').ResourceType, amount!);
      }
    }

    return { success: true };
  }
}
