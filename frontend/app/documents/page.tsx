'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, type AuthUser } from '@/src/authService';
import {
  createDocument, deleteDocument, DocumentApiError, listDocuments, updateDocument,
  type DocumentDTO, type DocumentDraft,
} from '@/src/documentService';
import { clearSessionToken, getSessionToken } from '@/src/session';
import { MarkdownPreview } from '@/src/MarkdownPreview';

const emptyDraft = (): DocumentDraft => ({ title: '', markdown: '' });
const orderDocuments = (list: DocumentDTO[]) => [...list].sort((a, b) =>
  Date.parse(b.updatedAt || b.createdAt || '') - Date.parse(a.updatedAt || a.createdAt || ''),
);

function prettyDate(value: string): string {
  if (!value) return 'Just now';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Just now' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DocumentsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [documents, setDocuments] = useState<DocumentDTO[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DocumentDraft>(emptyDraft);
  const [original, setOriginal] = useState<DocumentDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [activeView, setActiveView] = useState<'edit' | 'preview'>('edit');

  const handleExpiredSession = useCallback(() => {
    clearSessionToken();
    router.replace('/auth');
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    const savedToken = getSessionToken();
    if (!savedToken) {
      router.replace('/auth');
      return;
    }
    Promise.all([getCurrentUser(savedToken), listDocuments(savedToken)])
      .then(([account, items]) => {
        if (cancelled) return;
        const sorted = orderDocuments(items);
        setToken(savedToken);
        setUser(account);
        setDocuments(sorted);
        if (sorted.length) {
          setSelectedId(sorted[0].id);
          const initial = { title: sorted[0].title, markdown: sorted[0].markdown };
          setDraft(initial);
          setOriginal(initial);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DocumentApiError && err.status === 401) {
          handleExpiredSession();
          return;
        }
        // A failed /auth/me can mean an expired session or an unavailable service.
        const message = err instanceof Error ? err.message : 'Unable to load your documents.';
        if (/session expired|credentials|unauthorized/i.test(message)) handleExpiredSession();
        else setError(message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [handleExpiredSession, router]);

  const dirty = draft.title !== original.title || draft.markdown !== original.markdown;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const filtered = useMemo(() => documents.filter((doc) =>
    `${doc.title} ${doc.markdown}`.toLowerCase().includes(search.trim().toLowerCase()),
  ), [documents, search]);

  const guardUnsaved = () => !dirty || window.confirm('Discard unsaved changes?');

  const selectDocument = (document: DocumentDTO) => {
    if (saving || deleting || document.id === selectedId || !guardUnsaved()) return;
    const nextDraft = { title: document.title, markdown: document.markdown };
    setSelectedId(document.id);
    setDraft(nextDraft);
    setOriginal(nextDraft);
    setError(''); setNotice('');
    setActiveView('edit');
  };

  const startNew = () => {
    if (saving || deleting || !guardUnsaved()) return;
    setSelectedId(null);
    setDraft(emptyDraft());
    setOriginal(emptyDraft());
    setError(''); setNotice('');
    setActiveView('edit');
  };

  const save = async () => {
    if (!token || saving || deleting) return;
    if (!draft.title.trim()) {
      setError('Please enter a document title.');
      return;
    }
    setSaving(true); setError(''); setNotice('');
    try {
      const payload = { title: draft.title.trim(), markdown: draft.markdown };
      const saved = selectedId === null
        ? await createDocument(token, payload)
        : await updateDocument(token, selectedId, payload);
      setDocuments((current) => orderDocuments([saved, ...current.filter((doc) => doc.id !== saved.id)]));
      setSelectedId(saved.id);
      const updated = { title: saved.title, markdown: saved.markdown };
      setDraft(updated); setOriginal(updated);
      setNotice('Document saved successfully.');
    } catch (err: unknown) {
      if (err instanceof DocumentApiError && err.status === 401) handleExpiredSession();
      else setError(err instanceof Error ? err.message : 'Unable to save document.');
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!token || selectedId === null || deleting || saving) return;
    if (!window.confirm('Delete this document permanently?')) return;
    setDeleting(true); setError(''); setNotice('');
    try {
      await deleteDocument(token, selectedId);
      const remaining = documents.filter((doc) => doc.id !== selectedId);
      setDocuments(remaining);
      if (remaining.length) {
        const next = remaining[0];
        const nextDraft = { title: next.title, markdown: next.markdown };
        setSelectedId(next.id); setDraft(nextDraft); setOriginal(nextDraft);
      } else {
        setSelectedId(null); setDraft(emptyDraft()); setOriginal(emptyDraft());
      }
      setNotice('Document deleted.');
    } catch (err: unknown) {
      if (err instanceof DocumentApiError && err.status === 401) handleExpiredSession();
      else setError(err instanceof Error ? err.message : 'Unable to delete document.');
    } finally { setDeleting(false); }
  };

  const logout = () => {
    if (!guardUnsaved()) return;
    clearSessionToken();
    router.replace('/auth');
  };

  if (loading) return <main className="loading-screen" aria-live="polite">Loading your workspace…</main>;
  if (!token || !user) return (
    <main className="loading-screen">
      <div className="loading-error">
        <h1>Unable to open workspace</h1>
        <p>{error || 'Please sign in to continue.'}</p>
        <button className="button primary" onClick={() => router.replace('/auth')}>Back to login</button>
        <button className="button subtle" onClick={() => window.location.reload()}>Retry</button>
      </div>
    </main>
  );

  return (
    <main className="workspace">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand"><span className="brand-mark">M</span> MarkSync</div>
          <span className="sidebar-caption">Your workspace</span>
        </div>
        <button className="button primary new-button" onClick={startNew} disabled={saving || deleting}>+ New document</button>
        <label className="search-label" htmlFor="document-search">Documents <span>{documents.length}</span></label>
        <input id="document-search" className="search-input" placeholder="Search documents…" value={search}
          onChange={(event) => setSearch(event.target.value)} />
        <div className="document-list" aria-label="Your documents">
          {!filtered.length && <p className="no-documents">{search ? 'No matching documents.' : 'No documents yet. Create your first one.'}</p>}
          {filtered.map((doc) => (
            <button key={doc.id} type="button" onClick={() => selectDocument(doc)} disabled={saving || deleting}
              className={`document-item ${selectedId === doc.id ? 'selected' : ''}`}>
              <span className="document-icon" aria-hidden="true">▤</span>
              <span className="document-info"><strong>{doc.title}</strong><small>{prettyDate(doc.updatedAt || doc.createdAt)}</small></span>
            </button>
          ))}
        </div>
        <div className="profile-bar">
          <div className="profile-avatar">{user.email.charAt(0).toUpperCase()}</div>
          <div className="profile-info"><strong>{user.email}</strong><span>{user.role}</span></div>
          <button className="logout-button" onClick={logout} title="Sign out" aria-label="Sign out">↗</button>
        </div>
      </aside>

      <section className="editor-workspace">
        <header className="workspace-topbar">
          <div className="workspace-location"><span>Documents</span><span className="breadcrumb-separator">/</span>
            <strong>{selectedId === null ? 'New document' : original.title}</strong></div>
          <div className="topbar-actions">
            {dirty && <span className="unsaved-label">Unsaved changes</span>}
            {selectedId !== null && <button className="button danger" onClick={remove} disabled={deleting || saving}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>}
            <button className="button primary" onClick={save} disabled={saving || deleting || !draft.title.trim() || (!dirty && selectedId !== null)}>
              {saving ? 'Saving…' : selectedId === null ? 'Create document' : 'Save changes'}
            </button>
          </div>
        </header>

        <div className="editor-body">
          <div className="editor-heading">
            <span className="eyebrow">MARKDOWN DOCUMENT</span>
            <input className="document-title" aria-label="Document title" placeholder="Untitled document"
              value={draft.title} maxLength={200} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
            <p className="document-subtitle">Write in Markdown and preview your formatted document.</p>
          </div>
          {(error || notice) && <div className={`alert ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>
            {error || notice}
          </div>}
          <div className="editor-tabs" role="tablist" aria-label="Document mode">
            <button type="button" role="tab" aria-selected={activeView === 'edit'}
              className={activeView === 'edit' ? 'tab active' : 'tab'} onClick={() => setActiveView('edit')}>Edit Markdown</button>
            <button type="button" role="tab" aria-selected={activeView === 'preview'}
              className={activeView === 'preview' ? 'tab active' : 'tab'} onClick={() => setActiveView('preview')}>Preview</button>
          </div>
          <div className="editing-surface">
            {activeView === 'edit' ? (
              <textarea className="markdown-editor" aria-label="Markdown content" spellCheck={false}
                placeholder={'# Start writing\n\nUse **bold**, *italic*, lists, and code blocks.'}
                value={draft.markdown} onChange={(event) => setDraft((current) => ({ ...current, markdown: event.target.value }))} />
            ) : <div className="markdown-preview"><MarkdownPreview markdown={draft.markdown} /></div>}
          </div>
          <div className="editor-status"><span>Markdown · {draft.markdown.length.toLocaleString()} characters</span>
            <span>{selectedId === null ? 'New document' : `Last saved ${prettyDate(documents.find((doc) => doc.id === selectedId)?.updatedAt ?? '')}`}</span>
          </div>
        </div>
      </section>
    </main>
  );
}
