import type { ConnectionStatus as Status } from '@/src/presence/WorkspacePresenceClient';
import { cn } from '@/src/lib/utils';

const LABELS: Record<Status, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  disconnected: 'Disconnected',
  revoked: 'Access revoked',
};

const DOTS: Record<Status, string> = {
  connecting: 'bg-warning',
  connected: 'bg-success',
  reconnecting: 'bg-warning',
  disconnected: 'bg-label',
  revoked: 'bg-destructive',
};

/** The document's own collaboration connection, for the editor status bar. */
export function ConnectionStatus({ status }: { status: Status }) {
  return (
    <span role="status" className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', DOTS[status])} />
      {LABELS[status]}
    </span>
  );
}
