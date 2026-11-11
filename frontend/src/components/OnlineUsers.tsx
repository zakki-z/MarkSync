import type { PublicUser } from '@/src/presence/protocol';

/** The members the server reports as online, with the signed-in user marked. */
export function OnlineUsers({
  users,
  currentUserId,
}: {
  users: PublicUser[];
  currentUserId: number;
}) {
  return (
    <section aria-label="Online Users">
      <h3 className="presence-heading">
        Online <span className="count-badge">{users.length}</span>
      </h3>
      {users.length === 0 ? (
        <p className="empty">Nobody is online.</p>
      ) : (
        <ul className="online-users">
          {users.map((user) => (
            <li key={user.id} className="online-user">
              <span className="online-dot" aria-hidden="true" />
              {user.displayName}
              {user.id === currentUserId && <span className="you-marker">you</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
