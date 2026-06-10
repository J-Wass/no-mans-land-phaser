import { describe, it, expect, beforeEach } from '@jest/globals';
import { MoraleSystem } from './MoraleSystem';
import {
  getMoraleBand,
  getMoraleDamageMultiplier,
  getMoraleMitigationDelta,
  applyCombatMoraleHit,
  applyAdvancePenalty,
  effectiveBattleOrder,
} from './moraleRules';
import {
  MoraleBand,
  DEFAULT_MORALE,
  GAIN_BATTLE_WIN,
  GAIN_KILL,
  GAIN_WITNESS_VICTORY,
  GAIN_CITY_CONQUER,
  GAIN_RALLY_CRY,
  GAIN_TERRITORY_CONQUER,
  LOSS_ALLIED_DEATH_NEARBY,
  LOSS_CITY_LOST_NATIONWIDE,
  LOSS_ADVANCE_PER_ROUND,
  POST_BATTLE_RECOVERY_COOLDOWN_TICKS,
} from '@/config/moraleBalance';
import { GameState } from '@/managers/GameState';
import { GameEventBus } from '@/systems/events/GameEventBus';
import { Infantry } from '@/entities/units/Infantry';
import { Cavalry } from '@/entities/units/Cavalry';

describe('moraleRules pure functions', () => {
  it('places DEFAULT_MORALE in STEADY band', () => {
    expect(getMoraleBand(DEFAULT_MORALE)).toBe(MoraleBand.STEADY);
  });

  it('places 90 in INSPIRED, 100 in INSPIRED, 89 in STEADY', () => {
    expect(getMoraleBand(100)).toBe(MoraleBand.INSPIRED);
    expect(getMoraleBand(90)).toBe(MoraleBand.INSPIRED);
    expect(getMoraleBand(89)).toBe(MoraleBand.STEADY);
  });

  it('places 59 in WAVERING, 40 in WAVERING, 39 in SHAKEN, 15 in SHAKEN, 14 in BROKEN, 0 in BROKEN', () => {
    expect(getMoraleBand(59)).toBe(MoraleBand.WAVERING);
    expect(getMoraleBand(40)).toBe(MoraleBand.WAVERING);
    expect(getMoraleBand(39)).toBe(MoraleBand.SHAKEN);
    expect(getMoraleBand(15)).toBe(MoraleBand.SHAKEN);
    expect(getMoraleBand(14)).toBe(MoraleBand.BROKEN);
    expect(getMoraleBand(0)).toBe(MoraleBand.BROKEN);
  });

  it('INSPIRED grants +12% damage and +0.04 mitigation', () => {
    expect(getMoraleDamageMultiplier(95)).toBeCloseTo(1.12);
    expect(getMoraleMitigationDelta(95)).toBeCloseTo(0.04);
  });

  it('BROKEN deals 60% damage and takes -0.10 mitigation', () => {
    expect(getMoraleDamageMultiplier(5)).toBeCloseTo(0.60);
    expect(getMoraleMitigationDelta(5)).toBeCloseTo(-0.10);
  });

  it('STEADY is the neutral baseline (×1.0, +0)', () => {
    expect(getMoraleDamageMultiplier(80)).toBe(1.0);
    expect(getMoraleMitigationDelta(80)).toBe(0);
  });

  it('applyCombatMoraleHit drops morale proportional to damage / maxHP', () => {
    const unit = new Infantry('u1', 'nation-a', { row: 0, col: 0 });
    expect(unit.getMorale()).toBe(80);
    // Infantry maxHealth=100, scalar=45 → 25 dmg = ceil(25/100*45) = 12
    applyCombatMoraleHit(unit, 25);
    expect(unit.getMorale()).toBe(68);
  });

  it('applyCombatMoraleHit is a no-op for 0 damage', () => {
    const unit = new Infantry('u1', 'nation-a', { row: 0, col: 0 });
    applyCombatMoraleHit(unit, 0);
    expect(unit.getMorale()).toBe(80);
  });

  it('applyAdvancePenalty drops morale by LOSS_ADVANCE_PER_ROUND', () => {
    const unit = new Infantry('u1', 'nation-a', { row: 0, col: 0 });
    applyAdvancePenalty(unit);
    expect(unit.getMorale()).toBe(80 - LOSS_ADVANCE_PER_ROUND);
  });

  it('effectiveBattleOrder downgrades ADVANCE to HOLD when band <= WAVERING', () => {
    const unit = new Infantry('u1', 'nation-a', { row: 0, col: 0 });
    unit.setBattleOrder('ADVANCE');
    unit.setMorale(59); // top of WAVERING
    expect(effectiveBattleOrder(unit)).toBe('HOLD');
    unit.setMorale(60); // bottom of STEADY
    expect(effectiveBattleOrder(unit)).toBe('ADVANCE');
  });

  it('effectiveBattleOrder collapses to HOLD/WITHDRAW when BROKEN', () => {
    const unit = new Infantry('u1', 'nation-a', { row: 0, col: 0 });
    unit.setMorale(10);
    unit.setBattleOrder('ADVANCE');
    expect(effectiveBattleOrder(unit)).toBe('HOLD');
    unit.setBattleOrder('HOLD');
    expect(effectiveBattleOrder(unit)).toBe('HOLD');
    unit.setBattleOrder('WITHDRAW');
    expect(effectiveBattleOrder(unit)).toBe('WITHDRAW');
  });
});

describe('MoraleSystem event subscriptions', () => {
  let gameState: GameState;
  let bus: GameEventBus;
  let moraleSystem: MoraleSystem;

  beforeEach(() => {
    gameState = new GameState({ rows: 8, cols: 8 });
    bus = new GameEventBus();
    moraleSystem = new MoraleSystem(gameState, bus);
    // Keep reference alive (subscriptions are held by the system instance).
    void moraleSystem;
  });

  it('grants the winner +GAIN_BATTLE_WIN on battle:ended ELIMINATION', () => {
    const winner = new Infantry('w', 'nation-a', { row: 0, col: 0 });
    const loser  = new Infantry('l', 'nation-b', { row: 0, col: 1 });
    gameState.addUnit(winner);
    gameState.addUnit(loser);
    winner.setMorale(70);

    bus.emit('battle:ended', {
      battleId: 'b1', winnerUnitId: 'w', loserUnitId: 'l',
      reason: 'ELIMINATION', tick: 100,
    });

    expect(winner.getMorale()).toBe(70 + GAIN_BATTLE_WIN);
  });

  it('clamps morale at MAX_MORALE on big gains', () => {
    const winner = new Infantry('w', 'nation-a', { row: 0, col: 0 });
    gameState.addUnit(winner);
    winner.setMorale(95);

    bus.emit('battle:ended', {
      battleId: 'b1', winnerUnitId: 'w', loserUnitId: null,
      reason: 'ELIMINATION', tick: 100,
    });

    expect(winner.getMorale()).toBe(100); // 95 + 20 capped at 100
  });

  it('sets a recovery cooldown on the surviving loser', () => {
    const loser = new Infantry('l', 'nation-a', { row: 0, col: 0 });
    gameState.addUnit(loser);

    bus.emit('battle:ended', {
      battleId: 'b1', winnerUnitId: 'w', loserUnitId: 'l',
      reason: 'WITHDRAW', tick: 100,
    });

    expect(loser.getMoraleRecoveryCooldownUntilTick()).toBe(100 + POST_BATTLE_RECOVERY_COOLDOWN_TICKS);
  });

  it('grants killer +GAIN_KILL and nearby allies +GAIN_WITNESS_VICTORY on unit:destroyed', () => {
    const killer    = new Infantry('killer', 'nation-a', { row: 4, col: 4 });
    const cheering  = new Infantry('cheer',  'nation-a', { row: 5, col: 5 }); // within radius 3
    const farFriend = new Infantry('far',    'nation-a', { row: 0, col: 0 }); // outside radius
    gameState.addUnit(killer);
    gameState.addUnit(cheering);
    gameState.addUnit(farFriend);

    bus.emit('unit:destroyed', {
      unitId: 'victim', byUnitId: 'killer',
      ownerNationId: 'nation-b', position: { row: 4, col: 5 },
      tick: 50,
    });

    expect(killer.getMorale()).toBe(80 + GAIN_KILL);
    expect(cheering.getMorale()).toBe(80 + GAIN_WITNESS_VICTORY);
    expect(farFriend.getMorale()).toBe(80); // unchanged
  });

  it('drains allies of the victim within Chebyshev radius on unit:destroyed', () => {
    const grievingAlly = new Infantry('grief', 'nation-b', { row: 4, col: 5 });
    const farAlly      = new Infantry('far',   'nation-b', { row: 0, col: 0 });
    gameState.addUnit(grievingAlly);
    gameState.addUnit(farAlly);

    bus.emit('unit:destroyed', {
      unitId: 'victim', byUnitId: null,
      ownerNationId: 'nation-b', position: { row: 4, col: 4 },
      tick: 50,
    });

    expect(grievingAlly.getMorale()).toBe(80 - LOSS_ALLIED_DEATH_NEARBY);
    expect(farAlly.getMorale()).toBe(80); // outside radius
  });

  it('grants the conqueror +GAIN_CITY_CONQUER and nearby friendlies the rally cry', () => {
    // Use a larger grid so units can be placed outside the rally radius of 4.
    gameState = new GameState({ rows: 16, cols: 16 });
    bus = new GameEventBus();
    moraleSystem = new MoraleSystem(gameState, bus);
    void moraleSystem;

    const conqueror = new Cavalry('cav',    'nation-a', { row: 3, col: 3 });
    const nearby    = new Infantry('near',  'nation-a', { row: 4, col: 5 });   // Chebyshev 2
    const far       = new Infantry('far',   'nation-a', { row: 10, col: 10 }); // Chebyshev 7
    gameState.addUnit(conqueror);
    gameState.addUnit(nearby);
    gameState.addUnit(far);
    // Drop starting morale so the full gain fits below MAX_MORALE.
    conqueror.setMorale(50);
    nearby.setMorale(50);

    bus.emit('city:conquered', {
      cityId: 'c1', byUnitId: 'cav', byNationId: 'nation-a', fromNationId: 'nation-b',
      position: { row: 3, col: 3 }, tick: 200,
    });

    expect(conqueror.getMorale()).toBe(50 + GAIN_CITY_CONQUER);
    expect(nearby.getMorale()).toBe(50 + GAIN_RALLY_CRY);
    expect(far.getMorale()).toBe(80); // outside rally radius (4)
  });

  it('drains every unit of the previous owner on city:conquered (nation-wide)', () => {
    const survivor = new Infantry('s', 'nation-b', { row: 7, col: 7 }); // very far from city
    const closer   = new Infantry('c', 'nation-b', { row: 3, col: 3 });
    gameState.addUnit(survivor);
    gameState.addUnit(closer);

    bus.emit('city:conquered', {
      cityId: 'c1', byUnitId: 'cav', byNationId: 'nation-a', fromNationId: 'nation-b',
      position: { row: 0, col: 0 }, tick: 200,
    });

    // Both lose 10 even though one is very far from the city.
    expect(survivor.getMorale()).toBe(80 - LOSS_CITY_LOST_NATIONWIDE);
    expect(closer.getMorale()).toBe(80 - LOSS_CITY_LOST_NATIONWIDE);
  });

  it('grants nearby friendlies +GAIN_TERRITORY_CONQUER on territory:claimed conquest', () => {
    const near = new Infantry('near', 'nation-a', { row: 2, col: 2 });
    const far  = new Infantry('far',  'nation-a', { row: 7, col: 7 });
    gameState.addUnit(near);
    gameState.addUnit(far);

    bus.emit('territory:claimed', {
      position: { row: 2, col: 3 }, nationId: 'nation-a', fromNationId: 'nation-b', tick: 75,
    });

    expect(near.getMorale()).toBe(80 + GAIN_TERRITORY_CONQUER);
    expect(far.getMorale()).toBe(80);
  });

  it('does NOT grant morale on territory:claimed for a fresh outpost (no fromNationId)', () => {
    const unit = new Infantry('u', 'nation-a', { row: 2, col: 2 });
    gameState.addUnit(unit);

    bus.emit('territory:claimed', {
      position: { row: 2, col: 3 }, nationId: 'nation-a', tick: 75,
    });

    expect(unit.getMorale()).toBe(80);
  });

  it('emits morale:band-changed when a unit crosses a band threshold across two ticks', () => {
    const unit = new Infantry('u', 'nation-a', { row: 0, col: 0 });
    gameState.addUnit(unit);

    const changes: Array<{ oldBand: MoraleBand; newBand: MoraleBand }> = [];
    bus.on('morale:band-changed', (p) => changes.push({ oldBand: p.oldBand, newBand: p.newBand }));

    // First tick seeds the band (STEADY) — no event.
    moraleSystem.tick(1);
    expect(changes).toHaveLength(0);

    // Drop morale below WAVERING threshold and tick again.
    unit.setMorale(45);
    moraleSystem.tick(2);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ oldBand: MoraleBand.STEADY, newBand: MoraleBand.WAVERING });
  });
});
