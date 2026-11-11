import { prettyDate } from '@/src/format';
import type { Member, Role } from '@/src/workspaceService';
import { ROLES, roleLabel } from '@/src/components/roleLabel';

type Props = {
  members: Member[];
  currentUserId: string;
  /** From the API's `canManageMembers`; false renders a read-only list. */
  canManage: boolean;
  onChangeRole: (member: Member, role: Role) => void;
  onRemove: (member: Member) => void;
  onLeave: () => void;
};

const nameOf = (member: Member) => member.username ?? `User ${member.userId}`;

export function MemberList({
  members,
  currentUserId,
  canManage,
  onChangeRole,
  onRemove,
  onLeave,
}: Props) {
  return (
    <section className="panel" aria-labelledby="members-heading">
      <h2 id="members-heading">Members</h2>
      {!members.length && <p className="empty">This workspace has no members.</p>}
      <ul className="people">
        {members.map((member) => {
          const isSelf = member.userId === currentUserId;
          return (
            <li key={member.userId} className="person">
              <div className="person-info">
                <strong>
                  {nameOf(member)}
                  {isSelf ? ' (you)' : ''}
                </strong>
                <small>Joined {prettyDate(member.joinedAt)}</small>
              </div>
              {canManage ? (
                <select
                  className="field role-select"
                  aria-label={`Role of ${nameOf(member)}`}
                  value={member.role}
                  onChange={(event) => onChangeRole(member, event.target.value as Role)}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="role-badge">{roleLabel(member.role)}</span>
              )}
              {isSelf ? (
                <button type="button" className="button" onClick={onLeave}>
                  Leave
                </button>
              ) : (
                canManage && (
                  <button
                    type="button"
                    className="button danger"
                    aria-label={`Remove ${nameOf(member)}`}
                    onClick={() => onRemove(member)}
                  >
                    Remove
                  </button>
                )
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
