import { prettyDate } from '@/src/format';
import type { Invitation } from '@/src/workspaceService';
import { roleLabel } from '@/src/components/roleLabel';

type Props = { invitations: Invitation[]; onRevoke: (invitation: Invitation) => void };

const nameOf = (invitation: Invitation) =>
  invitation.invitedUsername ?? invitation.invitedEmail ?? `User ${invitation.invitedUserId}`;

export function PendingInvitations({ invitations, onRevoke }: Props) {
  return (
    <section className="panel" aria-labelledby="pending-heading">
      <h2 id="pending-heading">Pending invitations</h2>
      {!invitations.length && <p className="empty">No pending invitations.</p>}
      <ul className="people">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="person">
            <div className="person-info">
              <strong>{nameOf(invitation)}</strong>
              <small>
                {roleLabel(invitation.role)} · expires {prettyDate(invitation.expiresAt)}
              </small>
            </div>
            <button
              type="button"
              className="button danger"
              aria-label={`Revoke invitation for ${nameOf(invitation)}`}
              onClick={() => onRevoke(invitation)}
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
