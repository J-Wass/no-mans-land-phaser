/**
 * Nation entity - represents a player/AI faction in the game world.
 * Separate from Player (the human/AI controlling it).
 * Owns treasury, diplomatic relations, and tech research progress.
 */

import type { EntityId } from '@/types/common';
import type { PlayerId } from '@/entities/players/Player';
import type { Serializable } from '@/types/serializable';
import { DiplomaticStatus } from '@/types/diplomacy';
import { ResourceStorage } from '@/systems/resources/ResourceType';
import type { ResourceStorageData } from '@/systems/resources/ResourceType';
import { TECH_MAP } from '@/systems/research/TechTree';
import type { TechId } from '@/systems/research/TechTree';

export interface NationData {
  id:          EntityId;
  name:        string;
  color:       string;
  isAI:        boolean;
  controlledBy: PlayerId | null;
}

interface ResearchState {
  techId:          TechId;
  ticksTotal:      number;
  ticksRemaining:  number;
}

export type NationJSON = NationData & {
  treasury:         ResourceStorageData;
  relations:        Record<string, DiplomaticStatus>;
  researchedTechs:  TechId[];
  currentResearch:  ResearchState | null;
};

export class Nation implements Serializable<NationJSON> {
  private data:            NationData;
  private treasury:        ResourceStorage;
  private relations:       Map<EntityId, DiplomaticStatus>;
  private researchedTechs: Set<TechId>          = new Set();
  private currentResearch: ResearchState | null = null;

  constructor(id: EntityId, name: string, color: string, isAI: boolean = false) {
    this.data = { id, name, color, isAI, controlledBy: null };
    this.treasury  = new ResourceStorage();
    this.relations = new Map();
  }

  public getId(): EntityId          { return this.data.id; }
  public getName(): string          { return this.data.name; }
  public getColor(): string         { return this.data.color; }
  public isAIControlled(): boolean  { return this.data.isAI; }

  public getControlledBy(): PlayerId | null       { return this.data.controlledBy; }
  public setControlledBy(id: PlayerId | null): void { this.data.controlledBy = id; }

  public getTreasury(): ResourceStorage { return this.treasury; }

  public setRelation(nationId: EntityId, status: DiplomaticStatus): void {
    this.relations.set(nationId, status);
  }
  public getRelation(nationId: EntityId): DiplomaticStatus {
    return this.relations.get(nationId) ?? DiplomaticStatus.NEUTRAL;
  }
  public isAtWar(nationId: EntityId): boolean  { return this.getRelation(nationId) === DiplomaticStatus.WAR; }
  public isAlly(nationId: EntityId): boolean   { return this.getRelation(nationId) === DiplomaticStatus.ALLY; }
  public getAllRelations(): Map<EntityId, DiplomaticStatus> { return new Map(this.relations); }
  public declareWar(nationId: EntityId): void  { this.setRelation(nationId, DiplomaticStatus.WAR); }
  public makePeace(nationId: EntityId): void   { this.setRelation(nationId, DiplomaticStatus.NEUTRAL); }
  public formAlliance(nationId: EntityId): void { this.setRelation(nationId, DiplomaticStatus.ALLY); }

  // ── Research ─────────────────────────────────────────────────────────────────

  public hasResearched(techId: TechId): boolean {
    return this.researchedTechs.has(techId);
  }

  /** Returns true if all prerequisites are met and it hasn't been researched yet. */
  public canResearch(techId: TechId): boolean {
    if (this.researchedTechs.has(techId)) return false;
    const node = TECH_MAP.get(techId);
    if (!node) return false;
    return node.requires.every(req => this.researchedTechs.has(req));
  }

  public startResearch(techId: TechId, ticks: number): void {
    this.currentResearch = { techId, ticksTotal: ticks, ticksRemaining: ticks };
  }

  public cancelResearch(): void {
    this.currentResearch = null;
  }

  /**
   * Advance research by one tick.
   * @returns the completed TechId if research finished this tick, otherwise null.
   */
  public tickResearch(): TechId | null {
    if (!this.currentResearch) return null;
    this.currentResearch.ticksRemaining = Math.max(0, this.currentResearch.ticksRemaining - 1);
    if (this.currentResearch.ticksRemaining === 0) {
      const completed = this.currentResearch.techId;
      this.researchedTechs.add(completed);
      this.currentResearch = null;
      return completed;
    }
    return null;
  }

  public getCurrentResearch(): Readonly<ResearchState> | null {
    return this.currentResearch ? { ...this.currentResearch } : null;
  }

  public getResearchedTechs(): ReadonlySet<TechId> {
    return this.researchedTechs;
  }

  public setResearchedTechs(techs: TechId[]): void {
    this.researchedTechs = new Set(techs);
  }

  public restoreCurrentResearch(state: ResearchState | null): void {
    this.currentResearch = state ? { ...state } : null;
  }

  public getData(): Readonly<NationData> { return this.data; }

  public toJSON(): NationJSON {
    const relations: Record<string, DiplomaticStatus> = {};
    this.relations.forEach((status, nationId) => { relations[nationId] = status; });
    return {
      ...this.data,
      treasury:        this.treasury.toJSON(),
      relations,
      researchedTechs: Array.from(this.researchedTechs),
      currentResearch: this.currentResearch ? { ...this.currentResearch } : null,
    };
  }
}
