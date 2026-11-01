import { describe, it, expect } from '@jest/globals';
import { VisionSystem, SHOOTER_REVEAL_TICKS } from './VisionSystem';
import { GameState } from '@/managers/GameState';
import { Nation } from '@/entities/nations';
import { Infantry } from '@/entities/units/Infantry';
import { Scout } from '@/entities/units/Scout';
import { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';

function createNation(id: string): Nation {
  return new Nation(id, id.toUpperCase(), `#${id}`);
}

describe('VisionSystem', () => {
  it('computes visible, near-visible, and discovered tiles from territory and units', () => {
    const state = new GameState({ rows: 6, cols: 6 });
    const nation = createNation('nation-a');
    state.addNation(nation);
    state.getGrid().getTerritory({ row: 2, col: 2 })?.setControllingNation(nation.getId());

    const scout = new Scout('scout-a', nation.getId(), { row: 3, col: 3 });
    state.addUnit(scout);

    const vision = new VisionSystem().compute(state, nation.getId());

    expect(vision.visible.has('2,2')).toBe(true);
    expect(vision.visible.has('4,3')).toBe(true);
    expect(vision.nearVisible.has('0,3')).toBe(true);
    expect(vision.nearVisible.has('0,4')).toBe(true);
    expect(vision.nearVisible.has('4,3')).toBe(false);
    expect(vision.discovered.has('0,3')).toBe(true);
  });

  it('uses precomputed visibility when the target nation has no shadow mana', () => {
    const state = new GameState({ rows: 6, cols: 6 });
    const viewerNation = createNation('nation-a');
    const enemyNation = createNation('nation-b');
    state.addNation(viewerNation);
    state.addNation(enemyNation);

    const scout = new Scout('scout-a', viewerNation.getId(), { row: 2, col: 2 });
    const enemy = new Infantry('enemy-a', enemyNation.getId(), { row: 2, col: 4 });
    state.addUnit(scout);
    state.addUnit(enemy);

    const system = new VisionSystem();
    const vision = system.compute(state, viewerNation.getId());

    expect(system.unitVisibility(enemy, vision.visible, vision.nearVisible, state, viewerNation.getId())).toBe('visible');
  });

  it('hides an undercover spy from enemies but keeps it visible to its owner', () => {
    const state = new GameState({ rows: 6, cols: 6 });
    const viewerNation = createNation('nation-a');
    const ownerNation = createNation('nation-b');
    state.addNation(viewerNation);
    state.addNation(ownerNation);

    // Viewer's scout sits right next to the spy — it WOULD see it without the disguise.
    state.addUnit(new Scout('viewer-scout', viewerNation.getId(), { row: 2, col: 2 }));
    const spy = new Scout('spy', ownerNation.getId(), { row: 2, col: 3 });
    spy.setSpy(true);
    state.addUnit(spy);

    const system = new VisionSystem();
    const viewerVision = system.compute(state, viewerNation.getId());
    expect(system.unitVisibility(spy, viewerVision.visible, viewerVision.nearVisible, state, viewerNation.getId())).toBe('hidden');

    const ownerVision = system.compute(state, ownerNation.getId());
    expect(system.unitVisibility(spy, ownerVision.visible, ownerVision.nearVisible, state, ownerNation.getId())).toBe('visible');
  });

  it('reduces visibility by one with shadow mana and lets air mana counter it', () => {
    const state = new GameState({ rows: 6, cols: 6 });
    const viewerNation = createNation('nation-a');
    const enemyNation = createNation('nation-b');
    state.addNation(viewerNation);
    state.addNation(enemyNation);

    const observer = new Scout('scout-a', viewerNation.getId(), { row: 2, col: 2 });
    const enemy = new Infantry('enemy-a', enemyNation.getId(), { row: 2, col: 4 });
    state.addUnit(observer);
    state.addUnit(enemy);

    const shadowTile = state.getGrid().getTerritory({ row: 0, col: 0 });
    shadowTile?.setControllingNation(enemyNation.getId());
    shadowTile?.setResourceDeposit(TerritoryResourceType.SHADOW_MANA);
    shadowTile?.setBuildings([TerritoryBuildingType.MANA_MINE]);

    const system = new VisionSystem();
    const firstPass = system.compute(state, viewerNation.getId());
    expect(system.unitVisibility(enemy, firstPass.visible, firstPass.nearVisible, state, viewerNation.getId())).toBe('near');

    const airTile = state.getGrid().getTerritory({ row: 0, col: 1 });
    airTile?.setControllingNation(viewerNation.getId());
    airTile?.setResourceDeposit(TerritoryResourceType.AIR_MANA);
    airTile?.setBuildings([TerritoryBuildingType.MANA_MINE]);

    const secondPass = system.compute(state, viewerNation.getId());
    expect(system.unitVisibility(enemy, secondPass.visible, secondPass.nearVisible, state, viewerNation.getId())).toBe('visible');
  });

  it('keeps enemies in the expanded two-tile fog edge band before hiding them', () => {
    const state = new GameState({ rows: 8, cols: 8 });
    const viewerNation = createNation('nation-a');
    const enemyNation = createNation('nation-b');
    state.addNation(viewerNation);
    state.addNation(enemyNation);

    const observer = new Infantry('inf-a', viewerNation.getId(), { row: 3, col: 3 });
    const nearEnemy = new Infantry('enemy-near', enemyNation.getId(), { row: 3, col: 6 });
    const hiddenEnemy = new Infantry('enemy-hidden', enemyNation.getId(), { row: 3, col: 7 });
    state.addUnit(observer);
    state.addUnit(nearEnemy);
    state.addUnit(hiddenEnemy);

    const system = new VisionSystem();
    const vision = system.compute(state, viewerNation.getId());

    expect(system.unitVisibility(nearEnemy, vision.visible, vision.nearVisible, state, viewerNation.getId())).toBe('near');
    expect(system.unitVisibility(hiddenEnemy, vision.visible, vision.nearVisible, state, viewerNation.getId())).toBe('hidden');
  });
  describe('shooters revealed by ranged fire', () => {
    function setup() {
      const state = new GameState({ rows: 12, cols: 12 });
      state.addNation(createNation('nation-a'));
      state.addNation(createNation('nation-b'));
      state.addNation(createNation('nation-c'));
      state.addUnit(new Infantry('target', 'nation-a', { row: 1, col: 1 }));
      state.addUnit(new Infantry('archer', 'nation-b', { row: 1, col: 4 }));
      return state;
    }

    it('reveals the shooter tile to the nation it hit, for SHOOTER_REVEAL_TICKS', () => {
      const state = setup();
      const vision = new VisionSystem();
      expect(vision.compute(state, 'nation-a', 100).visible.has('1,4')).toBe(false);

      vision.noteRangedFire(state, { targetId: 'target', targetType: 'unit', from: { row: 1, col: 4 }, tick: 100 });

      const seen = vision.compute(state, 'nation-a', 100);
      expect(seen.visible.has('1,4')).toBe(true);
      expect(vision.unitVisibility(state.getUnit('archer')!, seen.visible, seen.nearVisible, state, 'nation-a')).toBe('visible');
      expect(vision.compute(state, 'nation-a', 100 + SHOOTER_REVEAL_TICKS - 1).visible.has('1,4')).toBe(true);
      expect(vision.compute(state, 'nation-a', 100 + SHOOTER_REVEAL_TICKS).visible.has('1,4')).toBe(false);
    });

    it('reveals nothing to bystanders', () => {
      const state = setup();
      const vision = new VisionSystem();
      vision.noteRangedFire(state, { targetId: 'target', targetType: 'unit', from: { row: 1, col: 4 }, tick: 100 });
      expect(vision.compute(state, 'nation-c', 100).visible.has('1,4')).toBe(false);
    });
  });
});
