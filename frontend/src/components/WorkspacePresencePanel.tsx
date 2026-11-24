'use client';

import { memo } from 'react';
import { ConnectionStatus } from '@/src/components/ConnectionStatus';
import { OnlineUsers } from '@/src/components/OnlineUsers';
import { WorkspaceMessagePanel } from '@/src/components/WorkspaceMessagePanel';
import { useWorkspacePresence } from '@/src/hooks/useWorkspacePresence';

type Props = {
  workspaceId: number;
  currentUserId: number;
  onSessionExpired: () => void;
};

/**
 * Who is online in the workspace, the connection state, and a small message box. Presence changes
 * stay inside this component's own state; memo keeps edits to the page around it (the title, the
 * document text) from re-rendering it.
 */
export const WorkspacePresencePanel = memo(function WorkspacePresencePanel({
  workspaceId,
  currentUserId,
  onSessionExpired,
}: Props) {
  const { status, users, messages, send } = useWorkspacePresence(workspaceId, onSessionExpired);
  return (
    <section className="panel presence-panel" aria-labelledby="presence-heading">
      <div className="presence-header">
        <h2 id="presence-heading">Live in this workspace</h2>
        <ConnectionStatus status={status} />
      </div>
      {status === 'revoked' && (
        <p className="alert error" role="alert">
          Your access to this workspace was revoked.
        </p>
      )}
      <OnlineUsers users={users} currentUserId={currentUserId} />
      <WorkspaceMessagePanel
        messages={messages}
        currentUserId={currentUserId}
        onSend={send}
        disabled={status !== 'connected'}
      />
    </section>
  );
});
