/**
 * Diplomacy and nation relation types
 */

export enum DiplomaticStatus {
  ALLY = 'ALLY',
  NEUTRAL = 'NEUTRAL',
  WAR = 'WAR',
}

export interface DiplomaticRelation {
  nationId1: string;
  nationId2: string;
  status: DiplomaticStatus;
  establishedTurn: number;
}
