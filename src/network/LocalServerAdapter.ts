/**
 * LocalServerAdapter — NetworkAdapter implementation that runs the "server"
 * in the same process as the client.
 *
 * This is the fake-server layer: it wraps CommandProcessor and exposes the
 * same async interface that a real WebSocketClientAdapter would. Commands are
 * dispatched synchronously under the hood (no actual I/O), but the API is
 * intentionally async so all call sites are already written correctly for when
 * a real transport is swapped in.
 *
 * Migration path to real multiplayer:
 *   1. Move CommandProcessor + TickEngine to a server process.
 *   2. Replace this class with a WebSocketClientAdapter (or similar) that
 *      serialises the GameCommand to JSON, sends it over the wire, and resolves
 *      the Promise when the server sends back a CommandResult.
 *   3. Zero changes required anywhere else in the codebase.
 */

import type { NetworkAdapter } from './NetworkAdapter';
import type { CommandProcessor } from '@/commands/CommandProcessor';
import type { GameCommand, CommandResult } from '@/commands/GameCommand';

export class LocalServerAdapter implements NetworkAdapter {
  constructor(private readonly processor: CommandProcessor) {}

  async sendCommand(command: GameCommand): Promise<CommandResult> {
    // In a real networked adapter this would be:
    //   return this.socket.sendAndAwait('command', command);
    // For now, dispatch synchronously and wrap in a resolved promise.
    return this.processor.dispatch(command);
  }
}
