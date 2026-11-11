import { prettyDate } from '@/src/format';
import { roleLabel } from '@/src/components/roleLabel';
import type { Invitation } from '@/src/workspaceService';

type Props = {
  invitations: Invitation[];
  busyId?: number;
  onAccept: (invitation: Invitation) => void;
  onDecline: (invitation: Invitation) => void;
};

export function MyInvitationList({ invitations, busyId, onAccept, onDecline }: Props) {
  if (!invitations.length) return <p className="empty">You have no pending invitations.</p>;
  return (
    <ul className="people panel">
      {invitations.map((invitation) => (
        <li key={invitation.id} className="person">
          <div className="person-info">
            <strong>{invitation.workspaceName}</strong>
            <small>
              {invitation.invitedByUsername ?? 'Someone'} invited you as{' '}
              {roleLabel(invitation.role)} · expires {prettyDate(invitation.expiresAt)}
            </small>
          </div>
          <button
            type="button"
            className="button primary"
            disabled={busyId === invitation.id}
            aria-label={`Accept invitation to ${invitation.workspaceName}`}
            onClick={() => onAccept(invitation)}
          >
            Accept
          </button>
          <button
            type="button"
            className="button"
            disabled={busyId === invitation.id}
            aria-label={`Decline invitation to ${invitation.workspaceName}`}
            onClick={() => onDecline(invitation)}
          >
            Decline
          </button>
        </li>
      ))}
    </ul>
  );
}
