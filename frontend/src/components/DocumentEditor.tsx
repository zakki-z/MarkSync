'use client';

import { useEffect, useRef, useState } from 'react';
import type { AuthUser } from '@/src/authService';
import { ApiError } from '@/src/apiClient';
import {
  deleteDocument,
  updateDocument,
  type DocumentDTO,
  type DocumentDraft,
  type DocumentVisibility,
} from '@/src/documentService';
import { CollaborativeEditor } from '@/src/components/CollaborativeEditor';
import { ConnectionStatus } from '@/src/components/ConnectionStatus';
import { WorkspacePresencePanel } from '@/src/components/WorkspacePresencePanel';
import { useCollaborativeDocument } from '@/src/hooks/useCollaborativeDocument';
import { useMembership } from '@/src/hooks/useMembership';
import { MarkdownPreview } from '@/src/MarkdownPreview';

type Props = {
  document: DocumentDTO;
  /** Signed-in user; anonymous visitors only read public documents. */
  user?: AuthUser;
  onDeleted: () => void;
  onSessionExpired: () => void;
};

/** Presence is for members: a signed-in visitor of a public document gets no panel. */
function MemberPresence({
  workspaceId,
  userId,
  onSessionExpired,
}: {
  workspaceId: number;
  userId: number;
  onSessionExpired: () => void;
}) {
  const { data: membership } = useMembership(workspaceId);
  if (!membership) return null;
  return (
    <WorkspacePresencePanel
      workspaceId={workspaceId}
      currentUserId={userId}
      onSessionExpired={onSessionExpired}
    />
  );
}

const toDraft = (doc: DocumentDTO): DocumentDraft => ({
  title: doc.title,
  visibility: doc.visibility,
});

/**
 * Edits a document, or shows it read-only when the API says the caller cannot edit it. Title and
 * visibility are saved through the REST API; the Markdown is edited live through collaboration.
 */
export function DocumentEditor({ document: initial, user, onDeleted, onSessionExpired }: Props) {
  const mutationPending = useRef(false);
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(toDraft(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeView, setActiveView] = useState<'edit' | 'preview'>('edit');

  const live = useCollaborativeDocument(saved.id, !!user, onSessionExpired);
  const snapshot = live?.snapshot;

  const readOnly = !saved.canEdit;
  const original = toDraft(saved);
  const dirty = draft.title !== original.title || draft.visibility !== original.visibility;
  // Until the server's state has arrived, the REST copy (kept current by the server) is shown.
  const markdown = snapshot?.hasSynced ? snapshot.markdown : saved.markdown;
  // The server has the last word on editing: it can withdraw it while the page is open.
  const editable = !readOnly && snapshot?.hasSynced === true && snapshot.canEdit === true;
  const permissionLost = !readOnly && snapshot?.hasSynced === true && snapshot.canEdit === false;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const run = async (action: () => Promise<void>, failure: string) => {
    if (mutationPending.current) return;
    mutationPending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) onSessionExpired();
      else setError(err instanceof Error ? err.message : failure);
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  };

  const save = () => {
    if (!draft.title.trim()) {
      setError('Please enter a document title.');
      return;
    }
    return run(async () => {
      const updated = await updateDocument(saved.id, { ...draft, title: draft.title.trim() });
      // The response carries the stored seed copy of the Markdown, which is not the live text.
      setSaved({ ...updated, markdown: saved.markdown });
      setDraft(toDraft(updated));
      setNotice('Document saved successfully.');
    }, 'Unable to save document.');
  };

  const remove = () => {
    if (!window.confirm('Delete this document permanently?')) return;
    return run(async () => {
      await deleteDocument(saved.id);
      onDeleted();
    }, 'Unable to delete document.');
  };

  return (
    <>
      <header className="workspace-topbar">
        <div className="workspace-location">
          <span>Documents</span>
          <span className="breadcrumb-separator">/</span>
          <strong>{original.title}</strong>
          {readOnly && <span className="readonly-badge">Read-only</span>}
        </div>
        {!readOnly && (
          <div className="topbar-actions">
            {dirty && <span className="unsaved-label">Unsaved changes</span>}
            <button className="button danger" onClick={remove} disabled={busy}>
              Delete
            </button>
            <button
              className="button primary"
              onClick={save}
              disabled={busy || !draft.title.trim() || !dirty}
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}
      </header>

      <div className="editor-body">
        {user && (
          <MemberPresence
            workspaceId={saved.workspaceId}
            userId={user.id}
            onSessionExpired={onSessionExpired}
          />
        )}
        <div className="editor-heading">
          <span className="eyebrow">MARKDOWN DOCUMENT</span>
          {readOnly ? (
            <h1 className="document-title">{saved.title}</h1>
          ) : (
            <input
              className="document-title"
              aria-label="Document title"
              placeholder="Untitled document"
              disabled={busy}
              value={draft.title}
              maxLength={200}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
            />
          )}
          {!readOnly && (
            <label className="visibility-field">
              Visibility{' '}
              <select
                value={draft.visibility}
                disabled={busy}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    visibility: event.target.value as DocumentVisibility,
                  }))
                }
              >
                <option value="PRIVATE">Private (workspace members)</option>
                <option value="PUBLIC">Public (anyone with the link can read)</option>
              </select>
            </label>
          )}
        </div>
        {permissionLost && (
          <div className="alert error" role="alert">
            {snapshot?.status === 'revoked'
              ? 'Your access to this document was revoked.'
              : 'You no longer have permission to edit this document.'}
          </div>
        )}
        {(error || notice) && (
          <div className={`alert ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>
            {error || notice}
          </div>
        )}
        {!readOnly && (
          <div className="editor-tabs" role="group" aria-label="Document mode">
            <button
              type="button"
              aria-pressed={activeView === 'edit'}
              className={activeView === 'edit' ? 'tab active' : 'tab'}
              onClick={() => setActiveView('edit')}
            >
              Edit Markdown
            </button>
            <button
              type="button"
              aria-pressed={activeView === 'preview'}
              className={activeView === 'preview' ? 'tab active' : 'tab'}
              onClick={() => setActiveView('preview')}
            >
              Preview
            </button>
          </div>
        )}
        <div className="editing-surface">
          {!readOnly && activeView === 'edit' ? (
            live ? (
              <CollaborativeEditor collab={live.collab} editable={editable} />
            ) : (
              <div className="markdown-preview" aria-live="polite">
                Connecting…
              </div>
            )
          ) : (
            <div className="markdown-preview">
              <MarkdownPreview markdown={markdown} />
            </div>
          )}
        </div>
        <div className="editor-status">
          <span>Markdown · {markdown.length.toLocaleString()} characters</span>
          {snapshot && (
            <span className="status-group">
              <ConnectionStatus status={snapshot.status} />
              {snapshot.hasSynced &&
                (snapshot.synced ? 'All changes synced' : 'Changes sync when reconnected')}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
