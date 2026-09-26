import { io } from 'socket.io-client';
import { ENGINE_PORT, SOCKET, type EngineEvent, type GameCommand, type WorldState } from '../../shared/events.ts';
import { commandKey, store, type createStore } from './store.ts';

/** The sole socket boundary, shared by the dashboard and the story check. */
export function connectEngine(target: ReturnType<typeof createStore> = store) {
  const socket = io(`http://localhost:${ENGINE_PORT}`, { autoConnect: false });
  socket.on('connect', () => target.connection(true));
  socket.on('disconnect', () => target.connection(false));
  socket.on('connect_error', () => target.connection(false, 'Cannot reach the engine on localhost:4000. Reconnecting…'));
  socket.on(SOCKET.snapshot, (snapshot: WorldState) => target.snapshot(snapshot));
  socket.on(SOCKET.event, (event: EngineEvent) => target.event(event));
  socket.connect();
  return {
    send(command: GameCommand) {
      const state = target.getSnapshot();
      if (!socket.connected || !state.synced || state.pending.includes(commandKey(command))) return false;
      target.sent(command);
      socket.emit(SOCKET.command, command);
      return true;
    },
    disconnect() { socket.disconnect(); },
  };
}
