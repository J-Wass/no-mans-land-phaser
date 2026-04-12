/**
 * Nation entity - represents a player/AI nation
 */

import type { EntityId } from '@/types/common';
import { DiplomaticStatus } from '@/types/diplomacy';
import { ResourceStorage } from '@/systems/resources/ResourceType';

export interface NationData {
  id: EntityId;
  name: string;
  color: string; // Hex color for map display
  isAI: boolean;
}

export class Nation {
  private data: NationData;
  private treasury: ResourceStorage;
  private relations: Map<EntityId, DiplomaticStatus>; // Relations with other nations

  constructor(id: EntityId, name: string, color: string, isAI: boolean = false) {
    this.data = {
      id,
      name,
      color,
      isAI
    };
    this.treasury = new ResourceStorage();
    this.relations = new Map();
  }

  public getId(): EntityId {
    return this.data.id;
  }

  public getName(): string {
    return this.data.name;
  }

  public getColor(): string {
    return this.data.color;
  }

  public isAI(): boolean {
    return this.data.isAI;
  }

  public getTreasury(): ResourceStorage {
    return this.treasury;
  }

  // Diplomacy methods
  public setRelation(nationId: EntityId, status: DiplomaticStatus): void {
    this.relations.set(nationId, status);
  }

  public getRelation(nationId: EntityId): DiplomaticStatus {
    return this.relations.get(nationId) ?? DiplomaticStatus.NEUTRAL;
  }

  public isAtWar(nationId: EntityId): boolean {
    return this.getRelation(nationId) === DiplomaticStatus.WAR;
  }

  public isAlly(nationId: EntityId): boolean {
    return this.getRelation(nationId) === DiplomaticStatus.ALLY;
  }

  public hasTradeAgreement(nationId: EntityId): boolean {
    return this.getRelation(nationId) === DiplomaticStatus.TRADE_AGREEMENT;
  }

  public getAllRelations(): Map<EntityId, DiplomaticStatus> {
    return new Map(this.relations);
  }

  public declareWar(nationId: EntityId): void {
    this.setRelation(nationId, DiplomaticStatus.WAR);
  }

  public makePeace(nationId: EntityId): void {
    this.setRelation(nationId, DiplomaticStatus.NEUTRAL);
  }

  public formAlliance(nationId: EntityId): void {
    this.setRelation(nationId, DiplomaticStatus.ALLY);
  }

  public establishTrade(nationId: EntityId): void {
    this.setRelation(nationId, DiplomaticStatus.TRADE_AGREEMENT);
  }

  public getData(): Readonly<NationData> {
    return this.data;
  }
}
