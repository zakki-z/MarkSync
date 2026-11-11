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
import { OnlineUsers } from '@/src/components/OnlineUsers';
import { prettyDate } from '@/src/format';
import { MarkdownPreview } from '@/src/MarkdownPreview';

type Props = {
  document: DocumentDTO;
  /** Signed-in user; anonymous visitors only read public documents. */
  user?: AuthUser;
  onDeleted: () => void;
  onSessionExpired: () => void;
};

const toDraft = (doc: DocumentDTO): DocumentDraft => ({
  title: doc.title,
  markdown: doc.markdown,
  visibility: doc.visibility,
});

/** Edits a document, or shows it read-only when the API says the caller cannot edit it. */
export function DocumentEditor({ document: initial, user, onDeleted, onSessionExpired }: Props) {
  const mutationPending = useRef(false);
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(toDraft(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeView, setActiveView] = useState<'edit' | 'preview'>('edit');

  const readOnly = !saved.canEdit;
  const original = toDraft(saved);
  const dirty =
    draft.title !== original.title ||
    draft.markdown !== original.markdown ||
    draft.visibility !== original.visibility;

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
      setSaved(updated);
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
        {user && <OnlineUsers documentId={saved.id} onSessionExpired={onSessionExpired} />}
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
            <textarea
              disabled={busy}
              maxLength={1_000_000}
              className="markdown-editor"
              aria-label="Markdown content"
              spellCheck={false}
              placeholder={'# Start writing\n\nUse **bold**, *italic*, lists, and code blocks.'}
              value={draft.markdown}
              onChange={(event) =>
                setDraft((current) => ({ ...current, markdown: event.target.value }))
              }
            />
          ) : (
            <div className="markdown-preview">
              <MarkdownPreview markdown={readOnly ? saved.markdown : draft.markdown} />
            </div>
          )}
        </div>
        <div className="editor-status">
          <span>Markdown · {draft.markdown.length.toLocaleString()} characters</span>
          <span>Last saved {prettyDate(saved.updatedAt)}</span>
        </div>
      </div>
    </>
  );
}
