import { expect, test } from 'bun:test';
import * as encoding from 'lib0/encoding';
import * as frontendFrames from '../../../frontend/src/collab/frames';
import * as frontend from '../../../frontend/src/presence/protocol';
import * as serverFrames from '../src/document-frames';
import * as server from '../src/protocol';

// The two services are built separately, so the frontend keeps a copy of the protocol.
// This test fails when the copy no longer matches.

test('the frontend mirror has the same close codes, error codes and limits', () => {
  expect(frontend.CloseCode).toEqual(server.CloseCode);
  expect(frontend.ErrorCode).toEqual(server.ErrorCode);
  expect(frontend.HEARTBEAT_INTERVAL_MS).toBe(server.HEARTBEAT_INTERVAL_MS);
  expect(frontend.MAX_TEXT_LENGTH).toBe(server.MAX_TEXT_LENGTH);
});

test('the frontend parser accepts every message the server can send', () => {
  const user = { id: 3, displayName: 'ada' };
  const messages: server.ServerMessage[] = [
    { type: 'presence', workspaceId: 7, users: [user] },
    { type: 'message', workspaceId: 7, sender: user, text: 'hi', sentAt: '2026-11-11T10:00:00Z' },
    { type: 'heartbeat' },
    { type: 'document-access', documentId: 4, canEdit: false },
    ...Object.values(server.ErrorCode).map((code): server.ServerMessage => ({
      type: 'error',
      code,
      message: 'm',
      workspaceId: 7,
      documentId: 4,
    })),
  ];
  for (const message of messages)
    expect(frontend.parseServerMessage(JSON.stringify(message))).toEqual(message);
});

test('the server parser accepts every message the frontend can send', () => {
  const messages: frontend.ClientMessage[] = [
    { type: 'join', workspaceId: 7 },
    { type: 'leave', workspaceId: 7 },
    { type: 'heartbeat' },
    { type: 'message', workspaceId: 7, text: 'hi' },
    { type: 'document-join', documentId: 4 },
    { type: 'document-leave', documentId: 4 },
  ];
  for (const message of messages)
    expect(server.parseClientMessage(JSON.stringify(message))).toEqual(message);
});

test('the frontend frame codec reads what the server writes and the other way round', () => {
  expect(frontendFrames.FrameKind).toEqual(serverFrames.FrameKind);
  for (const kind of Object.values(serverFrames.FrameKind)) {
    const payload = new Uint8Array([7, 8, 9]);
    const fromServer = serverFrames.encodeFrame(300, kind, (e) =>
      encoding.writeUint8Array(e, payload),
    );
    const fromFrontend = frontendFrames.encodeFrame(300, kind, payload);
    expect(fromFrontend).toEqual(fromServer);
    expect(frontendFrames.decodeFrame(fromServer)).toEqual({ documentId: 300, kind, payload });
    expect(serverFrames.decodeFrame(fromFrontend)).toEqual({ documentId: 300, kind, payload });
  }
});
