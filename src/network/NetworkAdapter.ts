/**
 * NetworkAdapter — the client-side interface for sending game commands.
 *
 * All player-issued commands flow through here. Today the only implementation
 * is LocalServerAdapter (same process, zero latency). To add real networking,
 * implement this interface with a WebSocket/WebRTC transport and swap it in at
 * the GameScene construction site — nothing else changes.
 */

import type { GameCommand, CommandResult } from '@/commands/GameCommand';

export interface NetworkAdapter {
  /**
   * Send a command to the server (or local authority) and await the result.
   *
   * The returned CommandResult is always from the authoritative source:
   * locally validated for LocalServerAdapter, or the server response in a
   * real networked implementation.
   */
  sendCommand(command: GameCommand): Promise<CommandResult>;
}
