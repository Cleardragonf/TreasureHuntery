import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(teamId: string) {
  if (!socket) {
    socket = io('http://localhost:4000');
  }
  socket.emit('join', teamId);
  return socket;
}

