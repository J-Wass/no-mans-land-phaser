/**
 * Player entity - represents a human or AI controller.
 * Separate from Nation (the in-game faction).
 * Future multiplayer: PlayerId maps to a socket/peer session ID.
 */

import type { EntityId } from '@/types/common';
import type { Serializable } from '@/types/serializable';

export type PlayerId = string;

export interface PlayerData {
  id: PlayerId;
  displayName: string;
  controlledNationId: EntityId;
  isLocal: boolean; // true = this machine; false = future remote player
}

export class Player implements Serializable<PlayerData> {
  private data: PlayerData;

  constructor(
    id: PlayerId,
    displayName: string,
    controlledNationId: EntityId,
    isLocal: boolean = true
  ) {
    this.data = { id, displayName, controlledNationId, isLocal };
  }

  public getId(): PlayerId {
    return this.data.id;
  }

  public getDisplayName(): string {
    return this.data.displayName;
  }

  public getControlledNationId(): EntityId {
    return this.data.controlledNationId;
  }

  public isLocalPlayer(): boolean {
    return this.data.isLocal;
  }

  public getData(): Readonly<PlayerData> {
    return this.data;
  }

  public toJSON(): PlayerData {
    return { ...this.data };
  }
}
