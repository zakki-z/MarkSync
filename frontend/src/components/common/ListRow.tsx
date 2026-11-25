'use client';

import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { roleLabel } from '@/src/components/roleLabel';
import { Badge } from '@/src/components/primitives/badge';
import { Button } from '@/src/components/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/src/components/primitives/dropdown-menu';
import { cn } from '@/src/lib/utils';
import type { Role } from '@/src/workspaceService';

/** A titled glass panel holding a list of rows. */
export function ListPanel({
  id,
  title,
  count,
  action,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="glass-flat mb-5 overflow-hidden rounded-panel">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-panel-border px-4 py-2.5">
        <h2 id={id} className="flex items-baseline gap-2 text-sm font-medium text-foreground">
          {title}
          {count !== undefined && (
            <span className="text-xs font-normal text-muted-foreground tabular-nums">{count}</span>
          )}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The list inside a ListPanel. */
export function ListRows({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="flex flex-col gap-0.5 p-1.5">
      {children}
    </ul>
  );
}

/** One row: a leading avatar or tile, a title and a secondary line, then a badge and actions. */
export function ListRow({
  leading,
  title,
  detail,
  badge,
  actions,
  wrap = false,
  className,
}: {
  leading: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  /** On narrow screens, let the secondary line wrap and move the actions to their own line. */
  wrap?: boolean;
  className?: string;
}) {
  return (
    <li
      className={cn(
        'flex min-h-[60px] items-center gap-3 rounded-item px-2.5 py-2 transition-colors duration-(--duration-fast) ease-standard hover:bg-hover',
        wrap && 'max-sm:flex-wrap',
        className,
      )}
    >
      {leading}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">{title}</span>
        {detail && (
          <span
            className={cn(
              'truncate text-xs text-muted-foreground',
              wrap && 'max-sm:whitespace-normal',
            )}
          >
            {detail}
          </span>
        )}
      </div>
      {badge}
      {actions && (
        <div
          className={cn(
            'flex shrink-0 items-center gap-1.5',
            wrap && 'max-sm:basis-full max-sm:justify-end',
          )}
        >
          {actions}
        </div>
      )}
    </li>
  );
}

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <Badge variant={role === 'OWNER' ? 'accent' : 'neutral'} className={className}>
      {roleLabel(role)}
    </Badge>
  );
}

/** The "…" menu at the end of a row. */
export function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** An inline error for the content area (failed actions); toasts report successes. */
export function InlineAlert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="mb-4 rounded-card border border-destructive/30 bg-destructive-tint px-4 py-3 text-sm text-destructive"
    >
      {children}
    </div>
  );
}
