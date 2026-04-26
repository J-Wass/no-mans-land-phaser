/**
 * Shared UI utility functions used across overlay scenes.
 */

import { ResourceType } from '@/systems/resources/ResourceType';
import { RESOURCE_EMOJI } from '@/utils/resourceIcons';

/** Format a ResourceCost record as a compact emoji string (e.g. "🍎20  🪨10"). */
export function formatCost(cost: Record<string, number>): string {
  const parts: string[] = [];
  const f = cost[ResourceType.FOOD];
  const m = cost[ResourceType.RAW_MATERIAL];
  const g = cost[ResourceType.GOLD];
  if (f) parts.push(`${RESOURCE_EMOJI[ResourceType.FOOD]}${f}`);
  if (m) parts.push(`${RESOURCE_EMOJI[ResourceType.RAW_MATERIAL]}${m}`);
  if (g) parts.push(`${RESOURCE_EMOJI[ResourceType.GOLD]}${g}`);
  return parts.length ? parts.join('  ') : 'free';
}
