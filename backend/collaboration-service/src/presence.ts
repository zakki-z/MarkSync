import type { User } from './auth';
import type { OnlineUser, ServerMessage } from './protocol';

export type Peer = { data: { user: User; room: number | null }; send(message: string): unknown };

export class Presence {
  private rooms = new Map<number, Set<Peer>>();

  join(peer: Peer, documentId: number) {
    if (peer.data.room !== documentId) this.leave(peer);
    const room = this.rooms.get(documentId) ?? new Set<Peer>();
    room.add(peer);
    this.rooms.set(documentId, room);
    peer.data.room = documentId;
    this.broadcast(documentId);
  }

  leave(peer: Peer) {
    const id = peer.data.room;
    if (id === null) return;
    peer.data.room = null;
    const room = this.rooms.get(id);
    room?.delete(peer);
    if (!room?.size) this.rooms.delete(id);
    else this.broadcast(id);
  }

  private broadcast(documentId: number) {
    const peers = this.rooms.get(documentId);
    const users = new Map<number, OnlineUser>();
    for (const peer of peers ?? []) {
      const user = peer.data.user;
      const existing = users.get(user.id);
      if (existing) existing.sessions++;
      else users.set(user.id, { ...user, sessions: 1 });
    }
    const message: ServerMessage = {
      type: 'presence',
      documentId,
      users: [...users.values()].sort((a, b) => a.id - b.id),
    };
    for (const peer of peers ?? []) peer.send(JSON.stringify(message));
  }
}
