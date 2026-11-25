'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { FileText, Search, SearchX, Star } from 'lucide-react';
import { toast } from 'sonner';
import type { DocumentDTO } from '@/src/documentService';
import { EmptyState } from '@/src/components/PageStates';
import { absoluteDate, relativeDate } from '@/src/format';
import { MAX_PINS, usePins } from '@/src/hooks/usePins';
import { usePrefetch } from '@/src/hooks/usePrefetch';
import { cn } from '@/src/lib/utils';

export const visibilityLabel = (doc: Pick<DocumentDTO, 'visibility'>) =>
  doc.visibility === 'PUBLIC' ? 'Public · anyone with the link' : 'Private · workspace members';

type RowProps = {
  workspaceId: number;
  doc: DocumentDTO;
  pinned: boolean;
  onTogglePin: (doc: DocumentDTO) => void;
  onPrefetch: (workspaceId: number, id: number) => void;
};

/** Memoised so that typing in the filter only re-renders rows that appear or change. */
const DocumentRow = memo(function DocumentRow({
  workspaceId,
  doc,
  pinned,
  onTogglePin,
  onPrefetch,
}: RowProps) {
  const date = doc.updatedAt || doc.createdAt;
  return (
    <li className="group/row relative flex items-center rounded-item transition-colors duration-(--duration-fast) ease-standard hover:bg-hover">
      <Link
        href={`/w/${workspaceId}/d/${doc.id}`}
        className="flex h-[60px] min-w-0 flex-1 items-center gap-3 rounded-item py-2 pr-12 pl-2.5"
        onMouseEnter={() => onPrefetch(workspaceId, doc.id)}
        onFocus={() => onPrefetch(workspaceId, doc.id)}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-panel-border bg-hover text-muted-foreground">
          <FileText className="size-4" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">{doc.title}</span>
          <span className="truncate text-xs text-muted-foreground">{visibilityLabel(doc)}</span>
        </span>
        <time
          dateTime={date}
          title={absoluteDate(date)}
          className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:block"
        >
          {relativeDate(date)}
        </time>
      </Link>
      <button
        type="button"
        aria-pressed={pinned}
        aria-label={`${pinned ? 'Unstar' : 'Star'} ${doc.title}`}
        onClick={() => onTogglePin(doc)}
        className={cn(
          'absolute right-2 grid size-8 cursor-pointer place-items-center rounded-lg transition-[opacity,color] duration-(--duration-fast) hover:bg-hover focus-visible:opacity-100',
          pinned
            ? 'text-star'
            : 'text-muted-foreground opacity-100 hover:text-foreground sm:opacity-0 sm:group-focus-within/row:opacity-100 sm:group-hover/row:opacity-100',
        )}
      >
        <Star className={cn('size-4', pinned && 'fill-current')} aria-hidden="true" />
      </button>
    </li>
  );
});

/** Every document of the workspace in a glass panel: starred first, then by recency. */
export function DocumentList({
  workspaceId,
  userId,
  documents,
  emptyAction,
}: {
  workspaceId: number;
  userId: number;
  documents: DocumentDTO[];
  /** Shown in the empty state (the "New document" button). */
  emptyAction?: React.ReactNode;
}) {
  const [search, setSearch] = useState('');
  const pins = usePins(`marksync:pins:documents:${userId}:${workspaceId}`);
  const prefetch = usePrefetch();
  const { isPinned } = pins;
  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      documents
        .filter((doc) => doc.title.toLowerCase().includes(query))
        // Array.sort is stable, so pinned documents keep the API's recency order among themselves.
        .sort((a, b) => Number(isPinned(b.id)) - Number(isPinned(a.id))),
    [documents, query, isPinned],
  );

  // Undo runs after later renders, so it must reach the pins as they are then.
  const latestPins = useRef(pins);
  useEffect(() => {
    latestPins.current = pins;
  });
  const togglePin = useCallback((doc: DocumentDTO) => {
    const wasPinned = latestPins.current.isPinned(doc.id);
    if (!latestPins.current.toggle(doc.id)) {
      toast.error(`You can star up to ${MAX_PINS} documents. Unstar one first.`);
      return;
    }
    toast(`${wasPinned ? 'Unstarred' : 'Starred'} ${doc.title}`, {
      action: { label: 'Undo', onClick: () => latestPins.current.toggle(doc.id) },
    });
  }, []);

  return (
    <section aria-labelledby="all-documents" className="glass-flat overflow-hidden rounded-panel">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-panel-border px-4 py-2.5">
        <h2
          id="all-documents"
          className="flex items-baseline gap-2 text-sm font-medium text-foreground"
        >
          All documents
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {documents.length}
          </span>
        </h2>
        {documents.length > 0 && (
          <label className="field flex h-8 w-full items-center gap-2 rounded-lg px-2.5 transition-colors focus-within:border-ring focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring sm:w-56">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Filter documents</span>
            <input
              type="search"
              placeholder="Filter documents…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-none"
            />
          </label>
        )}
      </div>
      {filtered.length === 0 ? (
        query ? (
          <EmptyState
            icon={SearchX}
            title="No matching documents"
            description={`Nothing in this workspace matches “${search.trim()}”.`}
          />
        ) : (
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Create your first one to start writing together."
            action={emptyAction}
          />
        )
      ) : (
        <ul aria-label="Documents" className="flex flex-col gap-0.5 p-1.5">
          {filtered.map((doc) => (
            <DocumentRow
              key={doc.id}
              workspaceId={workspaceId}
              doc={doc}
              pinned={isPinned(doc.id)}
              onTogglePin={togglePin}
              onPrefetch={prefetch.document}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
