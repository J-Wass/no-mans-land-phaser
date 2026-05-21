import type { TechId } from '@/systems/research/TechTree';
import type { ResourceType } from '@/systems/resources/ResourceType';
import type { UnitType } from '@/entities/units/Unit';
import evershadowRaw from '@/config/maps/evershadow.terrain?raw';
import invadersRaw   from '@/config/maps/invaders.terrain?raw';
import SCENARIO_DATA from './scenarios.json';

// ── Map file registry ─────────────────────────────────────────────────────────
// To add a new scenario map: create src/config/maps/<id>.map, import it above,
// and add the id → parsed rows entry here.
const MAP_REGISTRY: Record<string, string[]> = {
  'evershadow-tribe': evershadowRaw.trim().split('\n').map(r => r.trimEnd()),
  'the-invaders':     invadersRaw.trim().split('\n').map(r => r.trimEnd()),
};

export function getScenarioMap(id: string): string[] | null {
  return MAP_REGISTRY[id] ?? null;
}

// ── Schema types ──────────────────────────────────────────────────────────────

export interface ScenarioCityDef {
  name: string;
  row:  number;
  col:  number;
}

export interface ScenarioUnitDef {
  type: UnitType;
  row:  number;
  col:  number;
}

export type VictoryCondition =
  | { type: 'eliminate_all' }
  | { type: 'survive_ticks'; ticks: number };

export interface ScenarioDepositDef {
  row:  number;
  col:  number;
  type: string; // key of TerritoryResourceType enum
}

export interface ScenarioDiplomacyDef {
  nation1: number; // index into nations array
  nation2: number;
  status:  'WAR' | 'ALLY';
}

export interface ScenarioNationConfig {
  name:          string;
  color:         string;
  isPlayer:      boolean;
  cities:        ScenarioCityDef[];
  units:         ScenarioUnitDef[];
  resources:     Partial<Record<ResourceType, number>>;
  startingTechs: TechId[];
}

export interface ScenarioDefinition {
  id:                string;
  name:              string;
  description:       string;
  deposits:          ScenarioDepositDef[];
  nations:           ScenarioNationConfig[];
  diplomacy?:        ScenarioDiplomacyDef[];
  victoryCondition?: VictoryCondition;
}

export const SCENARIOS = SCENARIO_DATA.scenarios as ScenarioDefinition[];
export const DEFAULT_SCENARIO_ID = SCENARIOS[0]?.id ?? 'evershadow-tribe';

export function getScenarioById(id: string | null | undefined): ScenarioDefinition | null {
  if (SCENARIOS.length === 0) return null;
  return SCENARIOS.find(s => s.id === id) ?? SCENARIOS[0] ?? null;
}
