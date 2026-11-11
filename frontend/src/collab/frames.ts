/**
 * Mirror of backend/collaboration-service/src/document-frames.ts: Yjs payloads travel in binary
 * WebSocket frames `[varuint documentId][varuint kind][payload]`. A collaboration-service test
 * fails if the two drift apart. This file has no dependencies so that test can import it without
 * the frontend's packages being installed.
 */
export const FrameKind = { Sync: 0, Awareness: 1 } as const;
export type FrameKind = (typeof FrameKind)[keyof typeof FrameKind];

export type Frame = { documentId: number; kind: FrameKind; payload: Uint8Array };

/** The variable-length unsigned integer used by lib0: 7 bits per byte, low bits first. */
function varUint(value: number): number[] {
  const bytes: number[] = [];
  let rest = value;
  while (rest > 0x7f) {
    bytes.push(0x80 | (rest % 0x80));
    rest = Math.floor(rest / 0x80);
  }
  bytes.push(rest);
  return bytes;
}

function readVarUint(raw: Uint8Array, from: number): { value: number; next: number } | null {
  let value = 0;
  let scale = 1;
  for (let index = from; index < raw.length && index < from + 8; index++) {
    const byte = raw[index]!;
    value += (byte & 0x7f) * scale;
    if (byte < 0x80) return { value, next: index + 1 };
    scale *= 0x80;
  }
  return null;
}

/** `payload` is the y-protocols message, which becomes the rest of the frame. */
export function encodeFrame(documentId: number, kind: FrameKind, payload: Uint8Array): Uint8Array {
  return Uint8Array.from([...varUint(documentId), ...varUint(kind), ...payload]);
}

/** Returns null for anything that is not a well-formed frame with a non-empty payload. */
export function decodeFrame(raw: Uint8Array): Frame | null {
  const id = readVarUint(raw, 0);
  const kind = id && readVarUint(raw, id.next);
  if (!id || !kind) return null;
  const known = kind.value === FrameKind.Sync || kind.value === FrameKind.Awareness;
  const payload = raw.slice(kind.next);
  if (!Number.isSafeInteger(id.value) || id.value <= 0 || !known || payload.length === 0)
    return null;
  return { documentId: id.value, kind: kind.value as FrameKind, payload };
}
