import { describe, expect, test } from 'bun:test';
import {
  CloseCode,
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
