import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import type * as Y from 'yjs';
import { Connection } from '../connection';

/** What other members see of a collaborator: public data only, never an email or a token. */
export type AwarenessState = {
  user: { id: number; name: string; color: string };
  /** The selection as Yjs relative positions, so it follows the text while others edit. */
  cursor: { anchor: RelativePosition; head: RelativePosition } | null;
};

type Id = { client: number; clock: number };
type RelativePosition = { type: Id | null; tname: string | null; item: Id | null; assoc: number };

const COLORS = [
  '#d9480f',
  '#1971c2',
  '#2f9e44',
  '#9c36b5',
  '#c2255c',
  '#0c8599',
  '#e8590c',
  '#5f3dc4',
];
const MAX_TYPE_NAME_LENGTH = 100;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function toId(value: unknown): Id | null | undefined {
  if (value === null || value === undefined) return null;
  return isRecord(value) && isCount(value.client) && isCount(value.clock)
    ? { client: value.client, clock: value.clock }
    : undefined;
}

/** Rebuilds a relative position from only the fields Yjs defines, or null if it is not one. */
function toPosition(value: unknown): RelativePosition | null {
  if (!isRecord(value)) return null;
  const type = toId(value.type);
  const item = toId(value.item);
  const { tname, assoc } = value;
  const validName =
    tname === null ||
    tname === undefined ||
    (typeof tname === 'string' && tname.length <= MAX_TYPE_NAME_LENGTH);
  if (type === undefined || item === undefined || !validName) return null;
  if (typeof assoc !== 'number' || !Number.isSafeInteger(assoc)) return null;
  return { type, tname: tname ?? null, item, assoc };
}

function toCursor(value: unknown): AwarenessState['cursor'] {
  if (!isRecord(value)) return null;
  const anchor = toPosition(value.anchor);
  const head = toPosition(value.head);
  return anchor && head ? { anchor, head } : null;
}

/**
 * The awareness (cursors and selections) of one document. A client's state is never relayed as it
 * sent it: the server keeps the identity it authenticated and a color derived from it, and only
 * the selection is taken from the client, rebuilt field by field. Each connection controls one
 * client id; when it leaves, that client's state is removed for everyone.
 */
export class DocumentAwareness {
  private readonly awareness: awarenessProtocol.Awareness;
  private readonly controller = new Map<number, Connection>();
  private readonly controlled = new Map<Connection, number>();

  /** `onChange` receives the encoded update and the connection that caused it, if any. */
  constructor(doc: Y.Doc, onChange: (update: Uint8Array, origin: Connection | undefined) => void) {
    this.awareness = new awarenessProtocol.Awareness(doc);
    // The server is not a participant.
    this.awareness.setLocalState(null);
    this.awareness.on(
      'update',
      (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ) => {
        const changed = [...added, ...updated, ...removed];
        if (changed.length === 0) return;
        onChange(
          awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed),
          origin instanceof Connection ? origin : undefined,
        );
      },
    );
  }

  /** Everyone's state, for a connection that just joined; null when nobody is there. */
  snapshot(): Uint8Array | null {
    const ids = [...this.awareness.getStates().keys()];
    return ids.length > 0 ? awarenessProtocol.encodeAwarenessUpdate(this.awareness, ids) : null;
  }

  /** Throws if the payload is not an awareness message; states that break the rules are ignored. */
  receive(connection: Connection, payload: Uint8Array) {
    const decoder = decoding.createDecoder(
      decoding.readVarUint8Array(decoding.createDecoder(payload)),
    );
    const count = decoding.readVarUint(decoder);
    if (count !== 1) throw new Error('Expected exactly one awareness state');
    const clientId = decoding.readVarUint(decoder);
    const clock = decoding.readVarUint(decoder);
    const state = JSON.parse(decoding.readVarString(decoder)) as unknown;
    if (!this.mayControl(connection, clientId)) return;

    const sanitized = state === null ? null : this.stateFor(connection, state);
    const update = encoding.createEncoder();
    encoding.writeVarUint(update, 1);
    encoding.writeVarUint(update, clientId);
    encoding.writeVarUint(update, clock);
    encoding.writeVarString(update, JSON.stringify(sanitized));
    this.claim(connection, clientId);
    awarenessProtocol.applyAwarenessUpdate(
      this.awareness,
      encoding.toUint8Array(update),
      connection,
    );
  }

  /** Removes the state of the client this connection controlled, telling the others. */
  release(connection: Connection) {
    const clientId = this.controlled.get(connection);
    if (clientId === undefined) return;
    this.controlled.delete(connection);
    if (this.controller.get(clientId) !== connection) return;
    this.controller.delete(clientId);
    awarenessProtocol.removeAwarenessStates(this.awareness, [clientId], 'disconnect');
  }

  private stateFor(connection: Connection, state: unknown): AwarenessState {
    const { id, displayName } = connection.user;
    return {
      user: { id, name: displayName, color: COLORS[id % COLORS.length]! },
      cursor: toCursor(isRecord(state) ? state.cursor : null),
    };
  }

  /**
   * One connection controls one client id, and a client id belongs to the first user who used it.
   * The same user may take it over, which is what a reconnecting client does before the server
   * has noticed that its old connection is gone.
   */
  private mayControl(connection: Connection, clientId: number) {
    const own = this.controlled.get(connection);
    if (own !== undefined && own !== clientId) return false;
    const owner = this.controller.get(clientId);
    if (!owner || owner === connection) return true;
    const known = this.awareness.getStates().get(clientId) as AwarenessState | undefined;
    return known?.user.id === connection.user.id;
  }

  private claim(connection: Connection, clientId: number) {
    const previous = this.controller.get(clientId);
    if (previous && previous !== connection) this.controlled.delete(previous);
    this.controller.set(clientId, connection);
    this.controlled.set(connection, clientId);
  }
}
