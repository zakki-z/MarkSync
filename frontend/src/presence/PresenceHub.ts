import {
  WorkspacePresenceClient,
  type ChatMessage,
  type ConnectionStatus,
  type PresenceSnapshot,
} from './WorkspacePresenceClient';
import type { PublicUser } from './protocol';

type ClientOptions = ConstructorParameters<typeof WorkspacePresenceClient>[0];

/**
 * A stable store in front of the workspace presence connection of the open workspace. The shell
 * owns one; components read only the slice they show (status, users or messages) with
 * useSyncExternalStore, so a presence change re-renders those leaves and nothing else.
 *
 * The connection itself is the unchanged WorkspacePresenceClient: connect, join, heartbeat,
 * reconnect and leave work exactly as before. The hub only decides which client is current.
 */
export class PresenceHub {
  private client?: WorkspacePresenceClient;
  private readonly listeners = new Set<() => void>();

  /** Undefined while no workspace connection is open (not a member, or no workspace). */
  getSnapshot = (): PresenceSnapshot | undefined => this.client?.getSnapshot();

  getStatus = (): ConnectionStatus | undefined => this.client?.getSnapshot().status;
  getUsers = (): PublicUser[] | undefined => this.client?.getSnapshot().users;
  getMessages = (): ChatMessage[] | undefined => this.client?.getSnapshot().messages;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Opens one workspace's connection and returns the function that closes it. */
  connect(options: ClientOptions): () => void {
    const client = new WorkspacePresenceClient(options);
    this.client = client;
    const unsubscribe = client.subscribe(this.notify);
    client.start();
    this.notify();
    return () => {
      unsubscribe();
      client.dispose();
      if (this.client === client) {
        this.client = undefined;
        this.notify();
      }
    };
  }

  /** Returns false (and sends nothing) unless the server has confirmed the join. */
  send = (text: string) => this.client?.send(text) ?? false;

  private readonly notify = () => {
    for (const listener of this.listeners) listener();
  };
}
