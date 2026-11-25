'use client';

import Link from 'next/link';
import {
  ChevronsUpDown,
  Inbox,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Star,
  Sun,
} from 'lucide-react';
import type { AuthUser } from '@/src/authService';
import { BrandTile, Kbd, UserAvatar, WorkspaceTile } from '@/src/components/common/Identity';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/src/components/primitives/dropdown-menu';
import { Skeleton } from '@/src/components/primitives/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/src/components/primitives/tooltip';
import { useModifierKey } from '@/src/hooks/useModifierKey';
import { useTheme } from '@/src/hooks/useTheme';
import { cn } from '@/src/lib/utils';
import type { Workspace } from '@/src/workspaceService';

export type SidebarProps = {
  user: AuthUser;
  workspaces?: Workspace[];
  activeWorkspaceId?: number;
  pinned: number[];
  pendingInvitations: number;
  onTogglePin: (workspace: Workspace) => void;
  onPrefetch: (workspaceId: number) => void;
  onSearch: () => void;
  onNewWorkspace: () => void;
  onSignOut: () => void;
  /** Called after a link is followed, so the mobile drawer can close. */
  onNavigate?: () => void;
  /** Present on document pages: collapses the sidebar to the icon rail. */
  onCollapse?: () => void;
};

/** The account's display name: the API has no name field, so the email's local part stands in. */
export const displayName = (user: AuthUser) => user.email.split('@')[0];

const rowClass = (active: boolean) =>
  cn(
    'group/row flex h-9 items-center gap-2.5 rounded-item px-2 text-[13px] font-medium transition-colors duration-(--duration-fast) ease-standard',
    active
      ? 'bg-accent-tint text-foreground ring-1 ring-accent-ring ring-inset'
      : 'text-foreground-secondary hover:bg-hover hover:text-foreground',
  );

function ThemeButton({ className }: { className?: string }) {
  const { resolvedTheme, toggle } = useTheme();
  const next = resolvedTheme === 'dark' ? 'light' : 'dark';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggle}
          aria-label={`Switch to ${next} theme`}
          className={cn(
            'grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-foreground',
            className,
          )}
        >
          {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>Switch to {next} theme</TooltipContent>
    </Tooltip>
  );
}

function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  onNewWorkspace,
  onSearch,
  onSignOut,
  onNavigate,
}: Pick<
  SidebarProps,
  'workspaces' | 'activeWorkspaceId' | 'onNewWorkspace' | 'onSearch' | 'onSignOut' | 'onNavigate'
>) {
  const modifier = useModifierKey();
  const active = workspaces?.find((workspace) => workspace.id === activeWorkspaceId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-10 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 text-left transition-colors hover:bg-hover data-[state=open]:bg-hover"
        aria-label="MarkSync menu"
      >
        <BrandTile />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight text-foreground">MarkSync</span>
          {active && <span className="truncate text-xs text-muted-foreground">{active.name}</span>}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces?.map((workspace) => (
          <DropdownMenuItem key={workspace.id} asChild>
            <Link href={`/w/${workspace.id}`} onClick={onNavigate}>
              <WorkspaceTile id={workspace.id} name={workspace.name} />
              <span className="truncate">{workspace.name}</span>
              {workspace.id === activeWorkspaceId && (
                <span className="ml-auto text-xs text-muted-foreground">Current</span>
              )}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onNewWorkspace}>
          <Plus /> New workspace
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSearch}>
          <Search /> Search
          <DropdownMenuShortcut>{modifier}K</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PinToggle({
  workspace,
  pinned,
  onToggle,
}: {
  workspace: Workspace;
  pinned: boolean;
  onToggle: (workspace: Workspace) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pinned}
      aria-label={`${pinned ? 'Unpin' : 'Pin'} ${workspace.name}`}
      onClick={() => onToggle(workspace)}
      className={cn(
        'grid size-6 shrink-0 cursor-pointer place-items-center rounded-md transition-[opacity,color] duration-(--duration-fast) hover:bg-hover focus-visible:opacity-100',
        pinned
          ? 'text-star opacity-100'
          : 'text-muted-foreground opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100 hover:text-foreground',
      )}
    >
      <Star className={cn('size-3.5', pinned && 'fill-current')} aria-hidden="true" />
    </button>
  );
}

function WorkspaceSection({
  title,
  workspaces,
  activeWorkspaceId,
  pinned,
  onTogglePin,
  onPrefetch,
  onNavigate,
  action,
}: {
  title: string;
  workspaces: Workspace[];
  action?: React.ReactNode;
} & Pick<
  SidebarProps,
  'activeWorkspaceId' | 'pinned' | 'onTogglePin' | 'onPrefetch' | 'onNavigate'
>) {
  const headingId = `sidebar-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className="mt-4">
      <div className="mb-1 flex h-6 items-center justify-between pr-1 pl-2">
        <h2 id={headingId} className="section-label">
          {title}
        </h2>
        {action}
      </div>
      <ul className="flex flex-col gap-0.5">
        {workspaces.map((workspace) => {
          const active = workspace.id === activeWorkspaceId;
          return (
            <li key={workspace.id} className={cn('group/item pr-1', rowClass(active))}>
              <Link
                href={`/w/${workspace.id}`}
                aria-current={active ? 'page' : undefined}
                className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-md outline-offset-4"
                onMouseEnter={() => onPrefetch(workspace.id)}
                onFocus={() => onPrefetch(workspace.id)}
                onClick={onNavigate}
              >
                <WorkspaceTile id={workspace.id} name={workspace.name} />
                <span className="truncate">{workspace.name}</span>
              </Link>
              <PinToggle
                workspace={workspace}
                pinned={pinned.includes(workspace.id)}
                onToggle={onTogglePin}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The full 248 px sidebar (also the content of the mobile drawer). */
export function Sidebar(props: SidebarProps) {
  const {
    user,
    workspaces,
    pinned,
    pendingInvitations,
    onSearch,
    onNewWorkspace,
    onSignOut,
    onNavigate,
    onCollapse,
  } = props;
  const modifier = useModifierKey();
  const pinnedWorkspaces = pinned.flatMap((id) => workspaces?.find((w) => w.id === id) ?? []);
  const others = workspaces?.filter((workspace) => !pinned.includes(workspace.id)) ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="flex items-center gap-1">
        <WorkspaceSwitcher {...props} />
        {onCollapse && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onCollapse}
                aria-label="Collapse sidebar"
                className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
              >
                <PanelLeftClose className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Collapse sidebar</TooltipContent>
          </Tooltip>
        )}
      </div>

      <button
        type="button"
        onClick={onSearch}
        className="field mt-3 flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-muted-foreground transition-colors hover:border-ring/60"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">Search or jump to…</span>
        <Kbd>{modifier}K</Kbd>
      </button>

      {pendingInvitations > 0 && (
        <Link href="/invitations" className={cn(rowClass(false), 'mt-2')} onClick={onNavigate}>
          <Inbox className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">My invitations</span>
          <span
            className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
            aria-label={`${pendingInvitations} pending`}
          >
            {pendingInvitations}
          </span>
        </Link>
      )}

      <nav aria-label="Workspaces" className="-mx-1 mt-1 min-h-0 flex-1 overflow-y-auto px-1">
        {!workspaces ? (
          <WorkspaceListPlaceholder />
        ) : (
          <>
            {pinnedWorkspaces.length > 0 && (
              <WorkspaceSection {...props} title="Pinned" workspaces={pinnedWorkspaces} />
            )}
            <WorkspaceSection
              {...props}
              title="Workspaces"
              workspaces={others}
              action={
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onNewWorkspace}
                      aria-label="New workspace"
                      className="grid size-6 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                    >
                      <Plus className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>New workspace</TooltipContent>
                </Tooltip>
              }
            />
          </>
        )}
      </nav>

      <div
        data-testid="account-card"
        className="mt-3 flex items-center gap-2.5 rounded-card border border-panel-border bg-hover p-2"
      >
        <UserAvatar id={user.id} name={user.email} />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13px] font-medium text-foreground">
            {displayName(user)}
          </span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </div>
        <ThemeButton />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Sign out</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

/** The workspace list before it is known: same heading and row height as the list. */
export function WorkspaceListPlaceholder() {
  return (
    <div aria-hidden="true" className="mt-4">
      <div className="mb-1 flex h-6 items-center pl-2">
        <span className="section-label">Workspaces</span>
      </div>
      <div className="flex flex-col gap-0.5">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-9 rounded-item" />
        ))}
      </div>
    </div>
  );
}

const railButton =
  'grid size-10 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-foreground';

function RailTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/** The 64 px icon rail used on document pages, to give the editor room. */
export function SidebarRail({
  user,
  workspaces,
  activeWorkspaceId,
  pendingInvitations,
  onPrefetch,
  onSearch,
  onNewWorkspace,
  onExpand,
}: SidebarProps & { onExpand: () => void }) {
  const modifier = useModifierKey();
  return (
    <div className="flex h-full min-h-0 flex-col items-center gap-1.5 py-3">
      <RailTip label="Expand sidebar">
        <button type="button" onClick={onExpand} aria-label="Expand sidebar" className={railButton}>
          <BrandTile />
        </button>
      </RailTip>
      <RailTip label={`Search (${modifier}K)`}>
        <button type="button" onClick={onSearch} aria-label="Search" className={railButton}>
          <Search className="size-4" />
        </button>
      </RailTip>
      {pendingInvitations > 0 && (
        <RailTip label={`My invitations (${pendingInvitations})`}>
          <Link
            href="/invitations"
            aria-label={`My invitations, ${pendingInvitations} pending`}
            className={cn(railButton, 'relative')}
          >
            <Inbox className="size-4" />
            <span className="absolute top-2 right-2 size-2 rounded-full bg-brand" />
          </Link>
        </RailTip>
      )}
      <div className="my-1 h-px w-8 bg-panel-border" />
      <nav
        aria-label="Workspaces"
        className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto px-1"
      >
        {workspaces?.map((workspace) => {
          const active = workspace.id === activeWorkspaceId;
          return (
            <RailTip key={workspace.id} label={workspace.name}>
              <Link
                href={`/w/${workspace.id}`}
                aria-label={workspace.name}
                aria-current={active ? 'page' : undefined}
                onMouseEnter={() => onPrefetch(workspace.id)}
                onFocus={() => onPrefetch(workspace.id)}
                className={cn(
                  'grid size-10 shrink-0 place-items-center rounded-lg transition-colors',
                  active ? 'bg-accent-tint ring-1 ring-accent-ring ring-inset' : 'hover:bg-hover',
                )}
              >
                <WorkspaceTile id={workspace.id} name={workspace.name} size="md" />
              </Link>
            </RailTip>
          );
        })}
        <RailTip label="New workspace">
          <button
            type="button"
            onClick={onNewWorkspace}
            aria-label="New workspace"
            className={railButton}
          >
            <Plus className="size-4" />
          </button>
        </RailTip>
      </nav>
      <RailTip label="Expand sidebar">
        <button type="button" onClick={onExpand} aria-label="Expand sidebar" className={railButton}>
          <PanelLeftOpen className="size-4" />
        </button>
      </RailTip>
      <RailTip label={user.email}>
        <span className="grid size-10 place-items-center">
          <UserAvatar id={user.id} name={user.email} label={user.email} />
        </span>
      </RailTip>
    </div>
  );
}
