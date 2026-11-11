'use client';

import { useState, type FormEvent } from 'react';
import type { Role } from '@/src/workspaceService';

type Props = { onInvite: (identifier: string, role: Role) => Promise<void> };

/** Invites a user by username or email. The API validates; this form only collects the input. */
export function InviteForm({ onInvite }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [role, setRole] = useState<Role>('EDITOR');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await onInvite(identifier.trim(), role);
      setIdentifier('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to send the invitation.');
    }
    setPending(false);
  };

  return (
    <form className="panel invite-form" onSubmit={submit} aria-busy={pending}>
      <h2>Invite someone</h2>
      <div className="inline-form">
        <label>
          <span className="field-label">Username or email</span>
          <input
            className="field"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            maxLength={254}
            required
            disabled={pending}
          />
        </label>
        <label>
          <span className="field-label">Role</span>
          <select
            className="field"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            disabled={pending}
          >
            <option value="EDITOR">Editor</option>
            <option value="VIEWER">Viewer</option>
          </select>
        </label>
        <button type="submit" className="button primary" disabled={pending || !identifier.trim()}>
          {pending ? 'Sending…' : 'Send invitation'}
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
