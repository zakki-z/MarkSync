import { describe, it, expect } from "bun:test";
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

describe("Part B: Chaos Testing for MarkSync CRDT", () => {
  const NUM_CLIENTS = 3;

  it("should achieve Strong Eventual Consistency under random latency, out-of-order delivery, and dropped messages", () => {
    for (let run = 0; run < 50; run++) {
      const network = new ChaosNetwork(NUM_CLIENTS);
      const stepsCount = 20 + (run % 20);

      for (let s = 0; s < stepsCount; s++) {
        const isInsert = (run + s) % 3 !== 0;
        const clientId = (run + s) % NUM_CLIENTS;
        const op: EditOp = isInsert
          ? { type: "insert", client: clientId, index: s * 2, text: `word${s}` }
          : { type: "delete", client: clientId, index: s, length: 2 };

        const latencySeed = (s + 1) * 7;
        const shouldDrop = s % 5 === 0; // 每 5 個封包模擬一次掉包

        network.applyLocalEdit(op, latencySeed, shouldDrop);

        if (s % 3 === 0) {
          network.deliverUpTo(network.currentTime);
        }
      }

      //State Vector andd Strong Eventual Consistency
      network.settleAndSyncAll();

      const referenceText = network.texts[0];
      const referenceState = referenceText ? referenceText.toString() : "";

      for (let i = 1; i < NUM_CLIENTS; i++) {
        const targetText = network.texts[i];
        expect(targetText ? targetText.toString() : "").toBe(referenceState);
      }
    }
  });
});
