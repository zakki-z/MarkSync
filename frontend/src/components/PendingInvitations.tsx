'use client';

import type { ReactNode } from 'react';
import { MailX, Send } from 'lucide-react';
import { UserAvatar } from '@/src/components/common/Identity';
import { ListPanel, ListRow, ListRows, RoleBadge, RowMenu } from '@/src/components/common/ListRow';
import { EmptyState } from '@/src/components/PageStates';
import { DropdownMenuItem } from '@/src/components/primitives/dropdown-menu';
import { prettyDate } from '@/src/format';
import type { Invitation } from '@/src/workspaceService';

type Props = {
  invitations: Invitation[];
  onRevoke: (invitation: Invitation) => void;
  /** The "Invite people" button, shown in the panel header and in the empty state. */
  inviteAction?: ReactNode;
};

export const inviteeName = (invitation: Invitation) =>
  invitation.invitedUsername ?? invitation.invitedEmail ?? `User ${invitation.invitedUserId}`;

export function PendingInvitations({ invitations, onRevoke, inviteAction }: Props) {
  return (
    <ListPanel
      id="pending-heading"
      title="Pending invitations"
      count={invitations.length}
      action={invitations.length > 0 ? inviteAction : undefined}
    >
      {!invitations.length ? (
        <EmptyState
          icon={Send}
          title="No pending invitations."
          description="People you invite appear here until they answer."
          action={inviteAction}
        />
      ) : (
        <ListRows label="Pending invitations">
          {invitations.map((invitation) => {
            const name = inviteeName(invitation);
            return (
              <ListRow
                key={invitation.id}
                leading={<UserAvatar id={invitation.invitedUserId} name={name} />}
                title={name}
                detail={`Invited ${prettyDate(invitation.createdAt)} · expires ${prettyDate(invitation.expiresAt)}`}
                badge={<RoleBadge role={invitation.role} />}
                actions={
                  <RowMenu label={`Actions for ${name}`}>
                    <DropdownMenuItem variant="destructive" onSelect={() => onRevoke(invitation)}>
                      <MailX /> Revoke invitation
                    </DropdownMenuItem>
                  </RowMenu>
                }
              />
            );
          })}
        </ListRows>
      )}
    </ListPanel>
  );
}
