'use client';

import { Inbox } from 'lucide-react';
import { WorkspaceTile } from '@/src/components/common/Identity';
import { ListPanel, ListRow, ListRows, RoleBadge } from '@/src/components/common/ListRow';
import { EmptyState } from '@/src/components/PageStates';
import { Button } from '@/src/components/primitives/button';
import { prettyDate } from '@/src/format';
import { roleLabel } from '@/src/components/roleLabel';
import type { Invitation } from '@/src/workspaceService';

type Props = {
  invitations: Invitation[];
  busyId?: number;
  onAccept: (invitation: Invitation) => void;
  onDecline: (invitation: Invitation) => void;
};

/**
 * Invitations to the signed-in user. Accept and Decline stay visible on the row instead of in a
 * "…" menu: answering is the only thing to do here.
 */
export function MyInvitationList({ invitations, busyId, onAccept, onDecline }: Props) {
  return (
    <ListPanel id="my-invitations-heading" title="Pending" count={invitations.length}>
      {!invitations.length ? (
        <EmptyState
          icon={Inbox}
          title="You have no pending invitations."
          description="When someone invites you to a workspace, it shows up here."
        />
      ) : (
        <ListRows label="Invitations">
          {invitations.map((invitation) => {
            const busy = busyId === invitation.id;
            return (
              <ListRow
                key={invitation.id}
                wrap
                leading={
                  <WorkspaceTile
                    id={invitation.workspaceId}
                    name={invitation.workspaceName}
                    size="md"
                  />
                }
                title={invitation.workspaceName}
                detail={`${invitation.invitedByUsername ?? 'Someone'} invited you as ${roleLabel(invitation.role)} · expires ${prettyDate(invitation.expiresAt)}`}
                badge={<RoleBadge role={invitation.role} className="hidden sm:inline-flex" />}
                actions={
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`Decline invitation to ${invitation.workspaceName}`}
                      onClick={() => onDecline(invitation)}
                    >
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy}
                      aria-label={`Accept invitation to ${invitation.workspaceName}`}
                      onClick={() => onAccept(invitation)}
                    >
                      Accept
                    </Button>
                  </>
                }
              />
            );
          })}
        </ListRows>
      )}
    </ListPanel>
  );
}
