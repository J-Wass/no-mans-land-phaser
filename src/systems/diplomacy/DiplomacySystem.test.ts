import { describe, it, expect, beforeEach } from '@jest/globals';
import { DiplomacySystem, PEACE_COOLDOWN_TICKS } from './DiplomacySystem';
import { GameState } from '@/managers/GameState';
import { Nation } from '@/entities/nations';
import { Infantry } from '@/entities/units/Infantry';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { MovementSystem } from '@/systems/movement/MovementSystem';
import { DiplomaticStatus } from '@/types/diplomacy';
import { ResourceType } from '@/systems/resources/ResourceType';

function createNation(id: string, isAI = false): Nation {
  return new Nation(id, id.toUpperCase(), `#${id}`, isAI);
}

describe('DiplomacySystem', () => {
  let state: GameState;
  let eventBus: GameEventBus;
  let movement: MovementSystem;
  let diplomacy: DiplomacySystem;
  let nationA: Nation;
  let nationB: Nation;

  beforeEach(() => {
    state = new GameState({ rows: 5, cols: 5 });
    eventBus = new GameEventBus();
    movement = new MovementSystem();
    nationA = createNation('nation-a');
    nationB = createNation('nation-b', true);
    state.addNation(nationA);
    state.addNation(nationB);
    diplomacy = new DiplomacySystem(state, eventBus);
  });

  it('declares war manually and from combat events', () => {
    expect(diplomacy.declareWar(nationA.getId(), nationB.getId(), 7)).toBe(true);
    expect(nationA.getRelation(nationB.getId())).toBe(DiplomaticStatus.WAR);
    expect(nationB.getRelation(nationA.getId())).toBe(DiplomaticStatus.WAR);

    nationA.makePeace(nationB.getId());
    nationB.makePeace(nationA.getId());

    const attacker = new Infantry('unit-a', nationA.getId(), { row: 2, col: 2 });
    const defender = new Infantry('unit-b', nationB.getId(), { row: 2, col: 3 });
    state.addUnit(attacker);
    state.addUnit(defender);

    eventBus.emit('battle:started', {
      battleId: 'battle-1',
      unitAId: attacker.id,
      unitBId: defender.id,
      position: { row: 2, col: 3 },
      tick: 12,
    });

    expect(nationA.getRelation(nationB.getId())).toBe(DiplomaticStatus.WAR);
    expect(nationB.getRelation(nationA.getId())).toBe(DiplomaticStatus.WAR);
  });

  it('makes peace, teleports units home, cancels movement, and enforces cooldowns', () => {
    diplomacy.declareWar(nationA.getId(), nationB.getId(), 5);

    state.getGrid().getTerritory({ row: 0, col: 0 })?.setControllingNation(nationA.getId());
    state.getGrid().getTerritory({ row: 0, col: 1 })?.setControllingNation(nationA.getId());
    state.getGrid().getTerritory({ row: 4, col: 4 })?.setControllingNation(nationB.getId());

    const returningUnit = new Infantry('returning', nationA.getId(), { row: 4, col: 4 });
    const occupyingUnit = new Infantry('occupying', nationA.getId(), { row: 0, col: 0 });
    state.addUnit(returningUnit);
    state.addUnit(occupyingUnit);

    movement.issueOrder(returningUnit, [{ row: 4, col: 3 }]);

    expect(diplomacy.proposePeace(nationA.getId(), nationB.getId(), 20, movement)).toBe(true);
    expect(nationA.getRelation(nationB.getId())).toBe(DiplomaticStatus.NEUTRAL);
    expect(nationB.getRelation(nationA.getId())).toBe(DiplomaticStatus.NEUTRAL);
    expect(returningUnit.position).toEqual({ row: 0, col: 1 });
    expect(movement.isMoving(returningUnit.id)).toBe(false);
    expect(diplomacy.getPeaceCooldownRemaining(nationA.getId(), nationB.getId(), 20)).toBe(PEACE_COOLDOWN_TICKS);
    expect(diplomacy.declareWar(nationA.getId(), nationB.getId(), 20)).toBe(false);
    expect(diplomacy.declareWar(nationA.getId(), nationB.getId(), 20 + PEACE_COOLDOWN_TICKS)).toBe(true);
  });

  it('accepts gifts and applies rejection backoff that resets after inactivity', () => {
    nationB.getTreasury().addResource(ResourceType.GOLD, 100);
    nationB.getTreasury().addResource(ResourceType.FOOD, 100);
    nationB.getTreasury().addResource(ResourceType.RAW_MATERIAL, 100);

    expect(
      diplomacy.evaluateTradeForAI(
        nationA.getId(),
        nationB.getId(),
        { [ResourceType.FOOD]: 5 },
        {},
        10,
      ),
    ).toEqual({ accepted: true, backoffTicks: 0 });

    expect(
      diplomacy.evaluateTradeForAI(
        nationA.getId(),
        nationB.getId(),
        { [ResourceType.FOOD]: 1 },
        { [ResourceType.GOLD]: 10 },
        100,
      ),
    ).toEqual({ accepted: false, backoffTicks: 100 });

    expect(
      diplomacy.evaluateTradeForAI(
        nationA.getId(),
        nationB.getId(),
        { [ResourceType.FOOD]: 1 },
        { [ResourceType.GOLD]: 10 },
        200,
      ),
    ).toEqual({ accepted: false, backoffTicks: 200 });

    expect(
      diplomacy.evaluateTradeForAI(
        nationA.getId(),
        nationB.getId(),
        { [ResourceType.FOOD]: 1 },
        { [ResourceType.GOLD]: 10 },
        1500,
      ),
    ).toEqual({ accepted: false, backoffTicks: 100 });
  });

  it('restores saved peace cooldowns', () => {
    diplomacy.declareWar(nationA.getId(), nationB.getId(), 5);
    diplomacy.proposePeace(nationA.getId(), nationB.getId(), 20, movement);

    const restored = new DiplomacySystem(state, eventBus);
    restored.restoreState(diplomacy.toSavedState());

    expect(restored.canDeclareWar(nationA.getId(), nationB.getId(), 20 + PEACE_COOLDOWN_TICKS - 1)).toBe(false);
    expect(restored.canDeclareWar(nationA.getId(), nationB.getId(), 20 + PEACE_COOLDOWN_TICKS)).toBe(true);
  });
});
