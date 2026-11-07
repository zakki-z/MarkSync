import { describe, it, expect } from "bun:test";
import * as fc from "fast-check";
import * as Y from "yjs";

interface Packet {
  fromClient: number;
  toClient: number;
  update: Uint8Array;
  deliverAt: number;
}

type EditOp =
  | { type: "insert"; client: number; index: number; text: string }
  | { type: "delete"; client: number; index: number; length: number };

class ChaosNetwork {
  clients: Y.Doc[] = [];
  texts: Y.Text[] = [];
  queue: Packet[] = [];
  currentTime = 0;

  constructor(numClients: number) {
    for (let i = 0; i < numClients; i++) {
      const doc = new Y.Doc();
      doc.clientID = i + 1;
      this.clients.push(doc);
      this.texts.push(doc.getText("markdown"));
    }
  }

  applyLocalEdit(op: EditOp, latencySeed: number, shouldDrop: boolean) {
    // 加上 ! 確保 TypeScript 知道物件絕對存在
    const doc = this.clients[op.client]!;
    const ytext = this.texts[op.client]!;

    let capturedUpdate: Uint8Array | null = null;
    const updateHandler = (update: Uint8Array, origin: any) => {
      if (origin === "local") {
        capturedUpdate = update;
      }
    };

    doc.on("update", updateHandler);

    doc.transact(() => {
      const currentLen = ytext.length;
      if (op.type === "insert") {
        const safeIndex = currentLen === 0 ? 0 : op.index % (currentLen + 1);
        ytext.insert(safeIndex, op.text);
      } else if (op.type === "delete" && currentLen > 0) {
        const safeIndex = op.index % currentLen;
        const safeLen = Math.min(op.length, currentLen - safeIndex);
        if (safeLen > 0) {
          ytext.delete(safeIndex, safeLen);
        }
      }
    }, "local");

    doc.off("update", updateHandler);

    if (capturedUpdate) {
      for (let target = 0; target < this.clients.length; target++) {
        if (target === op.client) continue;
        if (shouldDrop) continue;

        const delay = (latencySeed * (target + 1)) % 100;
        this.queue.push({
          fromClient: op.client,
          toClient: target,
          update: capturedUpdate,
          deliverAt: this.currentTime + delay,
        });
      }
    }
    this.currentTime += 10;
  }

  deliverUpTo(timeLimit: number) {
    this.queue.sort((a, b) => a.deliverAt - b.deliverAt);
    while (this.queue.length > 0 && this.queue[0]!.deliverAt <= timeLimit) {
      const pkt = this.queue.shift()!;
      const targetDoc = this.clients[pkt.toClient];
      if (targetDoc) {
        Y.applyUpdate(targetDoc, pkt.update, "remote");
      }
    }
  }

  settleAndSyncAll() {
    this.deliverUpTo(Infinity);
    for (let i = 0; i < this.clients.length; i++) {
      for (let j = i + 1; j < this.clients.length; j++) {
        const docI = this.clients[i];
        const docJ = this.clients[j];
        if (!docI || !docJ) continue;

        const svI = Y.encodeStateVector(docI);
        const svJ = Y.encodeStateVector(docJ);

        const diffForJ = Y.encodeStateAsUpdate(docI, svJ);
        const diffForI = Y.encodeStateAsUpdate(docJ, svI);

        Y.applyUpdate(docJ, diffForJ, "sync");
        Y.applyUpdate(docI, diffForI, "sync");
      }
    }
  }
}

describe("Part B: Property-Based & Chaos Testing for MarkSync CRDT", () => {
  const NUM_CLIENTS = 3;

  const editOpArb = fc.oneof(
    fc.record({
      type: fc.constant("insert" as const),
      client: fc.integer({ min: 0, max: NUM_CLIENTS - 1 }),
      index: fc.nat(100),
      text: fc.string({ minLength: 1, maxLength: 8 }),
    }),
    fc.record({
      type: fc.constant("delete" as const),
      client: fc.integer({ min: 0, max: NUM_CLIENTS - 1 }),
      index: fc.nat(100),
      length: fc.integer({ min: 1, max: 5 }),
    })
  );

  const chaosStepArb = fc.record({
    op: editOpArb,
    latencySeed: fc.integer({ min: 1, max: 500 }),
    shouldDrop: fc.boolean(),
    flushNow: fc.boolean(),
  });

  it("should achieve Strong Eventual Consistency under random latency, out-of-order delivery, and dropped messages", () => {
    fc.assert(
      fc.property(
        fc.array(chaosStepArb, { minLength: 15, maxLength: 60 }),
        (steps) => {
          const network = new ChaosNetwork(NUM_CLIENTS);

          for (const step of steps) {
            network.applyLocalEdit(step.op, step.latencySeed, step.shouldDrop);
            if (step.flushNow) {
              network.deliverUpTo(network.currentTime);
            }
          }

          network.settleAndSyncAll();

          const referenceText = network.texts[0];
          const referenceState = referenceText ? referenceText.toString() : "";
          
          for (let i = 1; i < NUM_CLIENTS; i++) {
            const targetText = network.texts[i];
            expect(targetText ? targetText.toString() : "").toBe(referenceState);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
