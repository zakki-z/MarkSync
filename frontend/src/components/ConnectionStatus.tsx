import type { ConnectionStatus as Status } from '@/src/presence/WorkspacePresenceClient';

const LABELS: Record<Status, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  disconnected: 'Disconnected',
  revoked: 'Access revoked',
};

export function ConnectionStatus({ status }: { status: Status }) {
  return (
    <span role="status" className={`connection-status ${status}`}>
      {LABELS[status]}
    </span>
  );
}
