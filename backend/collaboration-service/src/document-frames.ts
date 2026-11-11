import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';

/**
 * Yjs payloads travel in binary WebSocket frames: `[varuint documentId][varuint kind][payload]`,
 * where the payload is a y-protocols message. Control messages stay JSON text frames.
 */
export const FrameKind = { Sync: 0, Awareness: 1 } as const;
export type FrameKind = (typeof FrameKind)[keyof typeof FrameKind];

export type Frame = { documentId: number; kind: FrameKind; payload: Uint8Array };

/** Builds a frame; `write` appends the y-protocols message to the encoder. */
export function encodeFrame(
  documentId: number,
  kind: FrameKind,
  write: (encoder: encoding.Encoder) => void,
): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, documentId);
  encoding.writeVarUint(encoder, kind);
  write(encoder);
  return encoding.toUint8Array(encoder);
}

/** Returns null for anything that is not a well-formed frame with a non-empty payload. */
export function decodeFrame(raw: Uint8Array): Frame | null {
  try {
    const decoder = decoding.createDecoder(raw);
    const documentId = decoding.readVarUint(decoder);
    const kind = decoding.readVarUint(decoder);
    const payload = decoding.readTailAsUint8Array(decoder);
    const known = kind === FrameKind.Sync || kind === FrameKind.Awareness;
    if (!Number.isSafeInteger(documentId) || documentId <= 0 || !known || payload.length === 0)
      return null;
    return { documentId, kind, payload };
  } catch {
    return null;
  }
}
