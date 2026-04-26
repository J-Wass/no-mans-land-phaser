import { ResourceType } from '@/systems/resources/ResourceType';

export const RESOURCE_EMOJI: Record<ResourceType, string> = {
  [ResourceType.FOOD]: '🍎',
  [ResourceType.RAW_MATERIAL]: '🧱',
  [ResourceType.GOLD]: '🪙',
  [ResourceType.RESEARCH]: '🔬',
};
