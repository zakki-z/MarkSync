import { describe, expect, test } from 'bun:test';
import * as encoding from 'lib0/encoding';
import { encodeFrame, FrameKind } from '../src/document-frames';
import {
  CloseCode,
  MAX_BINARY_FRAME_BYTES,
  MAX_FRAME_BYTES,
  MAX_TEXT_LENGTH,
  parseClientMessage,
  type ClientMessage,
} from '../src/protocol';

const parse = (value: unknown) => parseClientMessage(JSON.stringify(value));

describe('parseClientMessage', () => {
  test('accepts every client message type with exactly its fields', () => {
    const valid: ClientMessage[] = [
      { type: 'join', workspaceId: 7 },
      { type: 'leave', workspaceId: 7 },
      { type: 'heartbeat' },
      { type: 'message', workspaceId: 7, text: 'hello' },
    ];
    for (const message of valid) expect(parse(message)).toEqual(message);
  });

  test('rejects malformed JSON, non-objects and non-text frames without throwing', () => {
    for (const raw of ['{', '', 'null', '[]', '"join"', '7'])
      expect(parseClientMessage(raw)).toBeNull();
    expect(parseClientMessage(Buffer.from('{"type":"heartbeat"}'))).toBeNull();
    expect(parseClientMessage(undefined)).toBeNull();
  });

  test('rejects unknown types, missing fields and unexpected extra fields', () => {
    for (const data of [
      {},
      { type: 'presence', workspaceId: 1, users: [] },
      { type: 'unknown' },
      { type: 'join' },
      { type: 'heartbeat', token: 'secret' },
      { type: 'join', workspaceId: 1, token: 'secret' },
      { type: 'message', workspaceId: 1 },
      { type: 'message', text: 'hi' },
    ])
      expect(parse(data)).toBeNull();
  });

  test('rejects workspace ids that are not positive safe integers', () => {
    for (const workspaceId of [0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1, NaN])
      expect(parse({ type: 'join', workspaceId })).toBeNull();
  });

  test('bounds message text: not blank, not longer than the limit, always a string', () => {
    expect(parse({ type: 'message', workspaceId: 1, text: '   ' })).toBeNull();
    expect(parse({ type: 'message', workspaceId: 1, text: 5 })).toBeNull();
    expect(
      parse({ type: 'message', workspaceId: 1, text: 'x'.repeat(MAX_TEXT_LENGTH) }),
    ).not.toBeNull();
    expect(
      parse({ type: 'message', workspaceId: 1, text: 'x'.repeat(MAX_TEXT_LENGTH + 1) }),
    ).toBeNull();
  });

  test('rejects oversized frames before parsing them', () => {
    expect(parseClientMessage(' '.repeat(20 * 1024) + '{"type":"heartbeat"}')).toBeNull();
  });
});

test('close codes are the documented application codes', () => {
  expect(CloseCode.Unauthenticated).toBe(4401);
  expect(CloseCode.Forbidden).toBe(4403);
  expect(CloseCode.HeartbeatTimeout).toBe(4408);
});

describe('document messages', () => {
  test('accepts document join and leave with exactly their fields', () => {
    for (const type of ['document-join', 'document-leave'] as const)
      expect(parse({ type, documentId: 4 })).toEqual({ type, documentId: 4 });
    for (const data of [
      { type: 'document-join' },
      { type: 'document-join', documentId: 0 },
      { type: 'document-join', documentId: '4' },
      { type: 'document-join', documentId: 4, workspaceId: 1 },
    ])
      expect(parse(data)).toBeNull();
  });

  test('binary frames carry a document id, a kind and a payload', () => {
    const sync = encodeFrame(4, FrameKind.Sync, (e) =>
      encoding.writeUint8Array(e, new Uint8Array([0, 1])),
    );
    expect(parseClientMessage(sync)).toEqual({
      type: 'document-sync',
      documentId: 4,
      payload: new Uint8Array([0, 1]),
    });
    const awareness = encodeFrame(300, FrameKind.Awareness, (e) =>
      encoding.writeUint8Array(e, new Uint8Array([9])),
    );
    expect(parseClientMessage(awareness)).toMatchObject({
      type: 'document-awareness',
      documentId: 300,
    });
  });

  test('rejects binary frames with a bad id, unknown kind, no payload or truncated header', () => {
    expect(parseClientMessage(new Uint8Array([0, 0, 1]))).toBeNull();
    expect(parseClientMessage(new Uint8Array([4, 9, 1]))).toBeNull();
    expect(parseClientMessage(new Uint8Array([4, 0]))).toBeNull();
    expect(parseClientMessage(new Uint8Array([200]))).toBeNull();
    expect(parseClientMessage(new Uint8Array())).toBeNull();
  });

  test('limits binary frames to the binary size and JSON frames to the text size', () => {
    const big = encodeFrame(4, FrameKind.Sync, (e) =>
      encoding.writeUint8Array(e, new Uint8Array(MAX_BINARY_FRAME_BYTES)),
    );
    expect(parseClientMessage(big)).toBeNull();
    const roomy = encodeFrame(4, FrameKind.Sync, (e) =>
      encoding.writeUint8Array(e, new Uint8Array(MAX_FRAME_BYTES * 8)),
    );
    expect(parseClientMessage(roomy)?.type).toBe('document-sync');
    expect(
      parse({ type: 'message', workspaceId: 1, text: 'x'.repeat(MAX_FRAME_BYTES) }),
    ).toBeNull();
  });
});
