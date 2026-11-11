import type { Page } from '@playwright/test';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { decodeFrame, encodeFrame, FrameKind } from '../../src/collab/frames';

/**
 * A stand-in for the collaboration service in browser tests: it speaks the same protocol (document
 * join, Yjs sync) with a real Y.Doc, so the page under test runs its real provider and editor.
 */
export type MockCollaboration = {
  doc: Y.Doc;
  canEdit: boolean;
  joins: number;
  leaves: number;
  closes: number;
  /** Tells every connected page what it may do now, as the server does on a role change. */
  setCanEdit(canEdit: boolean): void;
  /** Edits the document as another user would; connected pages receive the change. */
  edit(change: (text: Y.Text) => void): void;
  /** Shows another user's cursor at `index` in every connected page. */
  showCursor(name: string, color: string, index: number): void;
  /** Ends every document connection as a network failure would. */
  dropConnections(): void;
  text(): string;
};

export async function mockCollaboration(
  page: Page,
  { markdown = '', canEdit = true }: { markdown?: string; canEdit?: boolean } = {},
): Promise<MockCollaboration> {
  const doc = new Y.Doc();
  doc.getText('content').insert(0, markdown);
  type Socket = { send(data: string | Buffer): void; drop(): void; documentId?: number };
  const sockets = new Set<Socket>();
  const broadcast = (build: (documentId: number) => Uint8Array) => {
    for (const socket of sockets)
      if (socket.documentId) socket.send(Buffer.from(build(socket.documentId)));
  };
  const remote = new awarenessProtocol.Awareness(new Y.Doc());
  const state: MockCollaboration = {
    doc,
    canEdit,
    joins: 0,
    leaves: 0,
    closes: 0,
    setCanEdit(value) {
      state.canEdit = value;
      for (const socket of sockets)
        if (socket.documentId)
          socket.send(
            JSON.stringify({
              type: 'document-access',
              documentId: socket.documentId,
              canEdit: value,
            }),
          );
    },
    edit(change) {
      const updates: Uint8Array[] = [];
      const collect = (update: Uint8Array) => updates.push(update);
      doc.on('update', collect);
      change(doc.getText('content'));
      doc.off('update', collect);
      for (const update of updates)
        broadcast((id) =>
          encodeFrame(id, FrameKind.Sync, (e) => syncProtocol.writeUpdate(e, update)),
        );
    },
    showCursor(name, color, index) {
      const position = Y.createRelativePositionFromTypeIndex(doc.getText('content'), index);
      remote.setLocalState({
        user: { id: 99, name, color },
        cursor: { anchor: position, head: position },
      });
      const update = awarenessProtocol.encodeAwarenessUpdate(remote, [remote.clientID]);
      broadcast((id) =>
        encodeFrame(id, FrameKind.Awareness, (e) => encoding.writeVarUint8Array(e, update)),
      );
    },
    dropConnections() {
      for (const socket of sockets) socket.drop();
    },
    text: () => doc.getText('content').toString(),
  };

  await page.routeWebSocket(/\/ws$/, (route) => {
    const socket: Socket = {
      send: (data) => route.send(data),
      drop: () => void route.close({ code: 1011 }),
    };
    sockets.add(socket);
    route.onClose(() => {
      sockets.delete(socket);
      if (socket.documentId) state.closes++;
    });
    route.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = JSON.parse(message) as { type: string; documentId?: number };
        if (parsed.type === 'heartbeat') route.send(JSON.stringify({ type: 'heartbeat' }));
        if (parsed.type === 'document-leave') state.leaves++;
        if (parsed.type !== 'document-join') return;
        state.joins++;
        socket.documentId = parsed.documentId;
        route.send(
          JSON.stringify({
            type: 'document-access',
            documentId: parsed.documentId,
            canEdit: state.canEdit,
          }),
        );
        route.send(
          Buffer.from(
            encodeFrame(parsed.documentId!, FrameKind.Sync, (e) =>
              syncProtocol.writeSyncStep1(e, doc),
            ),
          ),
        );
        return;
      }
      const frame = decodeFrame(new Uint8Array(message));
      if (!frame || frame.kind !== FrameKind.Sync) return;
      const decoder = decoding.createDecoder(frame.payload);
      const reply = encoding.createEncoder();
      // Like the real service, drop updates from a connection that may not edit.
      if (!state.canEdit && decoding.peekVarUint(decoder) !== syncProtocol.messageYjsSyncStep1)
        return;
      syncProtocol.readSyncMessage(decoder, reply, doc, socket);
      if (encoding.length(reply) > 0)
        route.send(
          Buffer.from(
            encodeFrame(frame.documentId, FrameKind.Sync, (e) =>
              encoding.writeUint8Array(e, encoding.toUint8Array(reply)),
            ),
          ),
        );
    });
  });
  return state;
}
