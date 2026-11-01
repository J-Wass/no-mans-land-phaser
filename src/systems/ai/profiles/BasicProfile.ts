/**
 * BasicProfile — medium AI.
 * Produces an Infantry/Longbowman army (plus a couple of Scouts), claims
 * territory, researches tech, builds, and — from MIN_TICK_TO_ATTACK on —
 * swarms its strike force at the nearest enemy.
 */

import type { AIContext, AIGoal, AILevel } from '../AITypes';
import { AIProfile } from './AIProfile';
import { ProduceUnitGoal } from '../goals/ProduceUnitGoal';
import { ClaimTerritoryGoal } from '../goals/ClaimTerritoryGoal';
import { AttackTargetGoal } from '../goals/AttackTargetGoal';
import { ResearchTechGoal } from '../goals/ResearchTechGoal';
import { BuildBuildingGoal } from '../goals/BuildBuildingGoal';
import { UnitType } from '@/entities/units/Unit';
import type { Unit } from '@/entities/units/Unit';
import type { TechId } from '@/systems/research/TechTree';
import { ResourceType } from '@/systems/resources/ResourceType';
import type { ResourceCost } from '@/systems/resources/ResourceType';
import { CITY_BUILDING_CATALOG, CityBuildingType } from '@/systems/territory/CityBuilding';
import { PRODUCTION_CATALOG } from '@/systems/production/ProductionCatalog';

/** Simplified research path for medium difficulty: economy first, then military basics. */
const BASIC_RESEARCH_ORDER: TechId[] = [
  'masonry', 'hunting', 'writing',
  'trade', 'education',
  'animal_domestication', 'iron_working',
  'scientific_method', 'mathematics',
];

/**
 * Earliest tick Medium attacks. Player feedback: attacking at tick 800 felt too
 * early/aggressive — keep this at 1800 or later.
 */
export const BASIC_MIN_TICK_TO_ATTACK = 1800;
export const BASIC_ATTACK_PRIORITY = 40;
/**
 * Scouts cost no Raw Material, so without a cap they crowd out the real army
 * (a playtest saw 6 Scouts + 2 Infantry and no attack in 3,600 ticks of war).
 */
export const BASIC_MAX_SCOUTS = 2;
/** Combat units (non-Scouts) mustered before an attack wave launches together. */
export const BASIC_STRIKE_FORCE = 4;
/** While below this many combat units, training outranks city buildings. */
const ARMY_TARGET = BASIC_STRIKE_FORCE + 2;
/** Production priority while the army is below ARMY_TARGET (city buildings are 35). */
const MUSTER_PRODUCTION_PRIORITY = 45;
const unitRawMaterial = (type: UnitType): number =>
  PRODUCTION_CATALOG.find(e => e.id === `unit:${type}`)?.cost[ResourceType.RAW_MATERIAL] ?? 0;

/**
 * From this tick, while the army is below the strike force, city buildings and
 * Outposts may only spend Raw Material above one combat unit's worth (350, a
 * Longbowman) — otherwise they eat the RM and the army never musters. Earlier,
 * the economy comes first.
 */
const WAR_FOOTING_TICK = 1200;
const UNIT_FUND: ResourceCost = {
  [ResourceType.RAW_MATERIAL]: Math.max(unitRawMaterial(UnitType.INFANTRY), unitRawMaterial(UnitType.LONGBOWMAN)),
};
/** Until the first Barracks stands, Outposts must leave enough to build it (nothing trains without one). */
const BARRACKS_FUND: ResourceCost =
  CITY_BUILDING_CATALOG.find(d => d.type === CityBuildingType.BARRACKS)?.cost ?? {};

const isScout   = (u: Unit): boolean => u.getUnitType() === UnitType.SCOUT;
const isCombat  = (u: Unit): boolean => !isScout(u);

export class BasicProfile extends AIProfile {
  override readonly level: AILevel = 'basic';
  override readonly tickInterval   = 30;
  override readonly maxGoalsPerCycle = 3;

  override generateGoals(ctx: AIContext): AIGoal[] {
    const units = ctx.gameState.getUnitsByNation(ctx.nationId).filter(u => u.isAlive());
    // Count Scouts still in training too, or two idle cities can both start one.
    const scouts     = units.filter(isScout).length + this.scoutsInTraining(ctx);
    const combat     = units.filter(isCombat);
    const infantry   = combat.filter(u => u.getUnitType() === UnitType.INFANTRY).length;
    const longbowmen = combat.filter(u => u.getUnitType() === UnitType.LONGBOWMAN).length;

    const nation      = ctx.gameState.getNation(ctx.nationId);
    const cities      = ctx.gameState.getCitiesByNation(ctx.nationId);
    const hasBarracks = cities.some(c => c.hasBuilding(CityBuildingType.BARRACKS));
    const hasHunting  = nation?.hasResearched('hunting') ?? false;
    const longbowReady = hasHunting
      && cities.some(c => c.getBuildingLevel(CityBuildingType.BARRACKS) >= 2);
    // Longbowmen need Barracks 2: once Hunting is in, get one city there ahead
    // of the general build order (which builds everything else first).
    const wantsBarracks2 = hasHunting && hasBarracks && !longbowReady
      && !cities.some(c => {
        const order = c.getCurrentOrder();
        return order?.kind === 'building' && order.buildingType === CityBuildingType.BARRACKS;
      });

    // Keep the army mixed: once Longbowmen are available, train one per
    // Infantry. While it's the Longbowman's turn, save up for it rather than
    // falling through to the cheaper Infantry.
    const produce = longbowReady && longbowmen < infantry
      ? [UnitType.LONGBOWMAN]
      : [UnitType.INFANTRY];
    if (scouts < BASIC_MAX_SCOUTS) produce.push(UnitType.SCOUT);

    // From the attack window on, the army stays home to muster and only Scouts
    // go claiming (unless there are none left).
    const mustering   = ctx.currentTick >= BASIC_MIN_TICK_TO_ATTACK && scouts > 0;
    const armyShort   = combat.length < ARMY_TARGET;
    const warFooting  = ctx.currentTick >= WAR_FOOTING_TICK && combat.length < BASIC_STRIKE_FORCE;
    const buildReserve = warFooting ? UNIT_FUND : {};
    const claimReserve = !hasBarracks ? BARRACKS_FUND : buildReserve;

    const goals: AIGoal[] = [
      new ProduceUnitGoal(produce, armyShort ? MUSTER_PRODUCTION_PRIORITY : 0),
      new ClaimTerritoryGoal(mustering ? isScout : undefined, claimReserve),
      new AttackTargetGoal(BASIC_ATTACK_PRIORITY, BASIC_MIN_TICK_TO_ATTACK, {
        unitFilter:     isCombat,
        minStrikeForce: BASIC_STRIKE_FORCE,
      }),
      new ResearchTechGoal(BASIC_RESEARCH_ORDER),
      new BuildBuildingGoal(undefined, buildReserve),
    ];
    if (wantsBarracks2) goals.push(new BuildBuildingGoal([CityBuildingType.BARRACKS]));
    return goals;
  }

  private scoutsInTraining(ctx: AIContext): number {
    let n = 0;
    for (const city of ctx.gameState.getCitiesByNation(ctx.nationId)) {
      for (const order of [city.getCurrentOrder(), ...city.getQueue()]) {
        if (order?.kind === 'unit' && order.unitType === UnitType.SCOUT) n++;
      }
    }
    return n;
  }
}
