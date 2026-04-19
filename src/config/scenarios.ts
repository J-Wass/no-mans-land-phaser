import type { TechId } from '@/systems/research/TechTree';
import type { ResourceType } from '@/systems/resources/ResourceType';
import SCENARIO_DATA from './scenarios.json';

export interface ScenarioNationConfig {
  name: string;
  color: string;
  cities: string[];
  resources: Partial<Record<ResourceType, number>>;
  startingTechs: TechId[];
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  playerNation: ScenarioNationConfig;
  opponentNation: ScenarioNationConfig;
}

export const SCENARIOS = SCENARIO_DATA.scenarios as ScenarioDefinition[];
export const DEFAULT_SCENARIO_ID = SCENARIOS[0]?.id ?? 'border-clash';

export function getScenarioById(id: string | null | undefined): ScenarioDefinition | null {
  if (SCENARIOS.length === 0) return null;
  return SCENARIOS.find(s => s.id === id) ?? SCENARIOS[0] ?? null;
}
