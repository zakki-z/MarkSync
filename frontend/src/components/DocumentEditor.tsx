'use client';

import dynamic from 'next/dynamic';
import { memo, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  Columns2,
  Eye,
  Globe,
  Lock,
  LogIn,
  MoreHorizontal,
  Pencil,
  Save,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import type { AuthUser } from '@/src/authService';
import { ApiError } from '@/src/apiClient';
import { signInPath } from '@/src/auth/authState';
import type { DocumentDTO, DocumentDraft, DocumentVisibility } from '@/src/documentService';
import { BrandTile } from '@/src/components/common/Identity';
import { InlineAlert } from '@/src/components/common/ListRow';
import { ConnectionStatus } from '@/src/components/ConnectionStatus';
import {
  createCursorStore,
  formatPosition,
  saveStatus,
  type CursorStore,
} from '@/src/components/document/editorState';
import { visibilityLabel } from '@/src/components/DocumentList';
import { LivePreview, TextStats } from '@/src/components/LiveMarkdown';
import { ChatButton, PresenceAvatars } from '@/src/components/presence/PresenceWidgets';
import { Badge } from '@/src/components/primitives/badge';
import { Button } from '@/src/components/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/src/components/primitives/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/primitives/popover';
import { useShell } from '@/src/components/shell/ShellContext';
import { Breadcrumb, TopBar } from '@/src/components/shell/TopBar';
import { useWorkspaceName } from '@/src/components/WorkspaceTabs';
import { absoluteDate, relativeDate } from '@/src/format';
import { useCollaborativeDocument } from '@/src/hooks/useCollaborativeDocument';
import { useMediaQuery } from '@/src/hooks/useMediaQuery';
import { useMembership } from '@/src/hooks/useMembership';
import { cn } from '@/src/lib/utils';
import { useDeleteDocument, useUpdateDocument } from '@/src/queries/mutations';

/**
 * CodeMirror and its language packs are about half of the document route's JavaScript. They load
 * only when an editable view is shown, so reading, previewing and the page shell do not wait for
 * them. The placeholder is the editor's own host box, so nothing moves when the editor arrives.
 */
const CollaborativeEditor = dynamic(
  () => import('@/src/components/CollaborativeEditor').then((module) => module.CollaborativeEditor),
  { ssr: false, loading: () => <div className="cm-host" aria-busy="true" /> },
);

type Props = {
  document: DocumentDTO;
  /** Signed-in user; anonymous visitors only read public documents. */
  user?: AuthUser;
  onDeleted: () => void;
  onSessionExpired: () => void;
};

type Mode = 'edit' | 'split' | 'preview';

const toDraft = (doc: DocumentDTO): DocumentDraft => ({
  title: doc.title,
  visibility: doc.visibility,
});

/** The breadcrumb's first crumb: the workspace, for members; the app, for everyone else. */
function WorkspaceCrumb({ workspaceId }: { workspaceId: number }) {
  return <>{useWorkspaceName(workspaceId) ?? 'Workspace'}</>;
}

/** "Saved just now" / "Unsaved changes". A leaf with its own clock, so the page never ticks. */
const SaveIndicator = memo(function SaveIndicator({
  dirty,
  saving,
  savedAt,
}: {
  dirty: boolean;
  saving: boolean;
  savedAt?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const { label, tone } = saveStatus({ dirty, saving, savedAt, now: Math.max(now, savedAt ?? 0) });
  return (
    <span
      aria-live="polite"
      className={cn(
        'hidden items-center gap-1.5 px-1 text-xs whitespace-nowrap sm:inline-flex',
        tone === 'unsaved' ? 'text-warning-text' : 'text-muted-foreground',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 rounded-full', tone === 'unsaved' ? 'bg-warning' : 'bg-success')}
      />
      {label}
    </span>
  );
});

const MODES: { id: Mode; label: string; icon: ReactNode }[] = [
  { id: 'edit', label: 'Edit', icon: <Pencil /> },
  { id: 'split', label: 'Split', icon: <Columns2 /> },
  { id: 'preview', label: 'Preview', icon: <Eye /> },
];

function ModeSwitch({
  mode,
  onChange,
  allowSplit,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
  allowSplit: boolean;
}) {
  return (
    <div role="group" aria-label="Document mode" className="field inline-flex rounded-lg p-0.5">
      {MODES.filter((option) => allowSplit || option.id !== 'split').map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={mode === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-(--duration-fast) ease-standard [&_svg]:size-3.5',
            mode === option.id
              ? 'bg-accent-tint text-foreground ring-1 ring-accent-ring ring-inset'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function VisibilityChip({
  value,
  disabled,
  onChange,
}: {
  value: DocumentVisibility;
  disabled: boolean;
  onChange: (value: DocumentVisibility) => void;
}) {
  const Icon = value === 'PUBLIC' ? Globe : Lock;
  const label = value === 'PUBLIC' ? 'Public' : 'Private';
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Document visibility: ${label}`}
        className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-panel-border bg-hover px-2 text-xs font-medium text-foreground-secondary transition-colors hover:text-foreground"
      >
        <Icon className="size-3" aria-hidden="true" />
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80" aria-label="Document visibility">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-foreground-secondary">Visibility</span>
          <select
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value as DocumentVisibility)}
            className="field h-9 cursor-pointer rounded-lg px-2.5 text-sm text-foreground"
          >
            <option value="PRIVATE">Private (workspace members)</option>
            <option value="PUBLIC">Public (anyone with the link can read)</option>
          </select>
        </label>
        <p className="mt-2 text-xs text-muted-foreground">Save the document to apply the change.</p>
      </PopoverContent>
    </Popover>
  );
}

/** Presence and invitations of the document's workspace, for signed-in members only. */
function MemberPresence({ workspaceId }: { workspaceId: number }) {
  const shell = useShell();
  const name = useWorkspaceName(workspaceId) ?? 'this workspace';
  const membership = useMembership(workspaceId).data;
  return (
    <>
      <PresenceAvatars
        workspaceName={name}
        onInvite={
          membership?.canManageMembers && shell ? () => shell.openInvite(workspaceId) : undefined
        }
      />
      <ChatButton />
    </>
  );
}

/** Line and column, from the editor's cursor store. */
function CursorPositionLabel({ store }: { store: CursorStore }) {
  const position = useSyncExternalStore(store.subscribe, store.get, store.get);
  return <span className="tabular-nums">{formatPosition(position)}</span>;
}

function Pane({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        'glass-flat flex min-h-[60vh] min-w-0 flex-col overflow-hidden rounded-panel lg:h-[calc(100dvh-92px)] lg:min-h-0',
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * Edits a document, or shows it read-only when the API says the caller cannot edit it. Title and
 * visibility are saved through the REST API; the Markdown is edited live through collaboration.
 */
export function DocumentEditor({ document: initial, user, onDeleted, onSessionExpired }: Props) {
  const pathname = usePathname();
  const updateDocument = useUpdateDocument().mutateAsync;
  const deleteDocument = useDeleteDocument().mutateAsync;
  const mutationPending = useRef(false);
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(toDraft(initial));
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number>();
  const [error, setError] = useState('');
  const [mode, setMode] = useState<Mode>('split');
  const [cursor] = useState(createCursorStore);
  const wide = useMediaQuery('(min-width: 1024px)');

  const live = useCollaborativeDocument(saved.id, !!user, onSessionExpired);
  const snapshot = live?.snapshot;

  const readOnly = !saved.canEdit;
  const original = toDraft(saved);
  const dirty = draft.title !== original.title || draft.visibility !== original.visibility;
  // Until the server's state has arrived, the REST copy (kept current by the server) is shown.
  // The text itself is read by the leaves below, never here, so typing does not re-render this page.
  const synced = snapshot?.hasSynced === true;
  // The server has the last word on editing: it can withdraw it while the page is open.
  const editable = !readOnly && synced && snapshot?.canEdit === true;
  const permissionLost = !readOnly && synced && snapshot?.canEdit === false;
  // Split needs room; on narrow screens the switch offers Edit and Preview only.
  const shown: Mode = readOnly ? 'preview' : !wide && mode === 'split' ? 'edit' : mode;

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
      const updated = await updateDocument({
        id: saved.id,
        workspaceId: saved.workspaceId,
        draft: { ...draft, title: draft.title.trim() },
      });
      // The response carries the stored seed copy of the Markdown, which is not the live text.
      setSaved({ ...updated, markdown: saved.markdown });
      setDraft(toDraft(updated));
      setSavedAt(Date.now());
      toast.success('Document saved successfully.');
    }, 'Unable to save document.');
  };

  const remove = () => {
    if (!window.confirm('Delete this document permanently?')) return;
    return run(async () => {
      await deleteDocument({ id: saved.id, workspaceId: saved.workspaceId });
      toast.success(`Deleted ${saved.title}`);
      onDeleted();
    }, 'Unable to delete document.');
  };

  const canSave = !busy && !!draft.title.trim() && dirty;
  const updated = saved.updatedAt || saved.createdAt;
  const meta = (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      <span>Markdown</span>
      <span aria-hidden="true">·</span>
      <span>{visibilityLabel({ visibility: draft.visibility ?? saved.visibility })}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={updated} title={absoluteDate(updated)}>
        Updated {relativeDate(updated).toLowerCase()}
      </time>
    </p>
  );

  const editorPane = (
    <Pane label="Editor">
      <div className="border-b border-panel-border px-5 pt-4 pb-3 sm:px-6">
        <input
          className="w-full rounded-md bg-transparent text-xl font-semibold tracking-tight text-foreground outline-offset-4 placeholder:text-muted-foreground sm:text-2xl"
          aria-label="Document title"
          placeholder="Untitled document"
          disabled={busy}
          value={draft.title}
          maxLength={200}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
        />
        {meta}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {live ? (
          <CollaborativeEditor collab={live.collab} editable={editable} cursor={cursor} />
        ) : (
          <div className="p-6 text-sm text-muted-foreground" aria-live="polite">
            Connecting…
          </div>
        )}
      </div>
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-panel-border px-4 py-2 text-[11px] text-muted-foreground">
        <CursorPositionLabel store={cursor} />
        <TextStats collab={live?.collab} live={synced} fallback={saved.markdown} />
        <span className="flex-1" />
        {snapshot && (
          <span className="flex items-center gap-3">
            <ConnectionStatus status={snapshot.status} />
            {snapshot.hasSynced &&
              (snapshot.synced ? 'All changes synced' : 'Changes sync when reconnected')}
          </span>
        )}
      </footer>
    </Pane>
  );

  const previewPane = (
    <Pane label="Preview">
      {shown === 'preview' && (
        <div className="border-b border-panel-border px-5 pt-4 pb-3 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {readOnly ? saved.title : draft.title || 'Untitled document'}
          </h1>
          {meta}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto px-5 py-6 sm:px-8">
        <div className="mx-auto max-w-reading">
          <LivePreview collab={live?.collab} live={synced} fallback={saved.markdown} />
        </div>
      </div>
      {readOnly && (
        <footer className="flex items-center gap-4 border-t border-panel-border px-4 py-2 text-[11px] text-muted-foreground">
          <TextStats collab={live?.collab} live={synced} fallback={saved.markdown} />
          <span className="flex-1" />
          {snapshot && <ConnectionStatus status={snapshot.status} />}
        </footer>
      )}
    </Pane>
  );

  return (
    <>
      <TopBar
        breadcrumb={
          <Breadcrumb
            items={[
              user
                ? {
                    label: <WorkspaceCrumb workspaceId={saved.workspaceId} />,
                    href: `/w/${saved.workspaceId}`,
                  }
                : {
                    label: (
                      <span className="inline-flex items-center gap-2 font-semibold text-foreground">
                        <BrandTile className="size-6 text-xs" /> MarkSync
                      </span>
                    ),
                  },
              { label: readOnly ? saved.title : original.title },
            ]}
            after={
              readOnly ? (
                <Badge variant="neutral">Read-only</Badge>
              ) : (
                <VisibilityChip
                  value={draft.visibility ?? saved.visibility}
                  disabled={busy}
                  onChange={(visibility) => setDraft((current) => ({ ...current, visibility }))}
                />
              )
            }
          />
        }
      >
        {!readOnly && <SaveIndicator dirty={dirty} saving={busy} savedAt={savedAt} />}
        {!readOnly && <ModeSwitch mode={shown} onChange={setMode} allowSplit={wide} />}
        {user && <MemberPresence workspaceId={saved.workspaceId} />}
        {!user && (
          <Button asChild size="sm" variant="outline">
            <Link href={signInPath(pathname)}>
              <LogIn /> Sign in
            </Link>
          </Button>
        )}
        {!readOnly && (
          <>
            <Button size="sm" onClick={save} disabled={!canSave}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={save} disabled={!canSave}>
                  <Save /> Save
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={remove} disabled={busy}>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </TopBar>

      {permissionLost && (
        <InlineAlert>
          {snapshot?.status === 'revoked'
            ? 'Your access to this document was revoked.'
            : 'You no longer have permission to edit this document.'}
        </InlineAlert>
      )}
      {error && <InlineAlert>{error}</InlineAlert>}

      <div className={cn('grid gap-3', shown === 'split' && 'lg:grid-cols-2')}>
        {shown !== 'preview' && editorPane}
        {shown !== 'edit' && previewPane}
      </div>
    </>
  );
}
