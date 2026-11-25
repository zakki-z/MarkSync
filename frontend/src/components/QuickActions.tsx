'use client';

import Link from 'next/link';
import { Clock3, FilePlus2, UserPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DocumentDTO } from '@/src/documentService';
import { relativeDate } from '@/src/format';
import { usePrefetch } from '@/src/hooks/usePrefetch';
import { cn } from '@/src/lib/utils';

const card =
  'group flex h-[92px] min-w-0 items-center gap-3 rounded-card p-4 text-left transition-colors duration-(--duration-fast) ease-standard';
const actionCard = cn(
  card,
  'cursor-pointer border border-dashed border-field-border hover:border-accent-ring hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-field-border disabled:hover:bg-transparent',
);

function CardBody({ icon, title, detail }: { icon: ReactNode; title: string; detail: ReactNode }) {
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-panel-border bg-hover text-foreground-secondary transition-colors group-hover:text-foreground">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{detail}</span>
      </span>
    </>
  );
}

/**
 * Three shortcuts above the document list. The first opens the most recently updated document:
 * the API does not record what each user opened, so recency of updates stands in for it.
 */
export function QuickActions({
  workspaceId,
  documents,
  creating,
  onNewDocument,
  onInvite,
}: {
  workspaceId: number;
  documents: DocumentDTO[];
  creating: boolean;
  onNewDocument: () => void;
  /** Present when the user may invite people (owners). */
  onInvite?: () => void;
}) {
  const prefetch = usePrefetch();
  const latest = documents.reduce<DocumentDTO | undefined>(
    (best, doc) =>
      !best || (doc.updatedAt || doc.createdAt) > (best.updatedAt || best.createdAt) ? doc : best,
    undefined,
  );
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      {latest ? (
        <Link
          href={`/w/${workspaceId}/d/${latest.id}`}
          onMouseEnter={() => prefetch.document(workspaceId, latest.id)}
          onFocus={() => prefetch.document(workspaceId, latest.id)}
          className={cn(card, 'glass-flat hover:border-accent-ring')}
        >
          <CardBody
            icon={<Clock3 className="size-[18px]" aria-hidden="true" />}
            title={latest.title}
            detail={`Last updated ${relativeDate(latest.updatedAt || latest.createdAt).toLowerCase()}`}
          />
        </Link>
      ) : (
        <div className={cn(card, 'glass-flat')}>
          <CardBody
            icon={<Clock3 className="size-[18px]" aria-hidden="true" />}
            title="Last updated"
            detail="Nothing here yet"
          />
        </div>
      )}
      <button type="button" onClick={onNewDocument} disabled={creating} className={actionCard}>
        <CardBody
          icon={<FilePlus2 className="size-[18px]" aria-hidden="true" />}
          title={creating ? 'Creating…' : 'New document'}
          detail="Start from a blank page"
        />
      </button>
      <button
        type="button"
        onClick={onInvite}
        disabled={!onInvite}
        className={actionCard}
        aria-describedby={onInvite ? undefined : 'invite-owner-only'}
      >
        <CardBody
          icon={<UserPlus className="size-[18px]" aria-hidden="true" />}
          title="Invite people"
          detail={
            onInvite ? (
              'Add editors or viewers'
            ) : (
              <span id="invite-owner-only">Only owners can invite</span>
            )
          }
        />
      </button>
    </div>
  );
}
