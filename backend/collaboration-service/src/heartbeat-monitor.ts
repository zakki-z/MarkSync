import type { ConnectionRegistry } from './connection-registry';
import { CloseCode } from './protocol';

export type HeartbeatOptions = {
  /** How often clients send a heartbeat, and how often the monitor looks for silent connections. */
  intervalMs: number;
  /** A connection that stays silent for more than this many intervals is dropped. */
  maxMissed: number;
};

/** Drops connections whose client stopped sending frames, e.g. after the network disappeared. */
export class HeartbeatMonitor {
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly connections: ConnectionRegistry,
    private readonly options: HeartbeatOptions,
    private readonly clock: () => number = Date.now,
  ) {}

  /** Closing a connection also removes it from its rooms and updates the others' presence. */
  sweep() {
    const deadline = this.clock() - this.options.intervalMs * this.options.maxMissed;
    for (const connection of this.connections.all())
      if (connection.lastSeen < deadline)
        this.connections.close(connection, CloseCode.HeartbeatTimeout, 'Heartbeat timeout.');
  }

  start() {
    this.timer ??= setInterval(() => this.sweep(), this.options.intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
