'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, FilePlus2, FileText, FolderPlus, Moon, Sun, UserPlus } from 'lucide-react';
import { Kbd, WorkspaceTile } from '@/src/components/common/Identity';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/src/components/primitives/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/src/components/primitives/dialog';
import { useMembership } from '@/src/hooks/useMembership';
import { useNewDocument } from '@/src/hooks/useNewDocument';
import { useTheme } from '@/src/hooks/useTheme';
import { useWorkspaceDocuments } from '@/src/hooks/useWorkspaceDocuments';
import type { Workspace } from '@/src/workspaceService';

/**
 * Substring matching over each item's keywords (its visible label), so what matches is exactly
 * what gets highlighted. Labels that start with the query rank first.
 */
export function paletteFilter(_value: string, search: string, keywords?: string[]): number {
  const query = search.trim().toLowerCase();
  if (!query) return 1;
  const text = (keywords ?? []).join(' ').toLowerCase();
  const index = text.indexOf(query);
  if (index < 0) return 0;
  return index === 0 ? 1 : 0.5;
}

/** The label with the first occurrence of the query emphasised. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const index = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-transparent font-semibold text-accent-text">
        {text.slice(index, index + q.length)}
      </mark>
      {text.slice(index + q.length)}
    </>
  );
}

const MAX_DOCUMENTS = 50;

/** The open workspace's documents, from the list the workspace page already loads. */
function DocumentResults({
  workspaceId,
  search,
  onRun,
}: {
  workspaceId: number;
  search: string;
  onRun: (run: () => void) => void;
}) {
  const router = useRouter();
  const documents = useWorkspaceDocuments(workspaceId).data;
  if (!documents?.length) return null;
  return (
    <CommandGroup heading="Documents">
      {documents.slice(0, MAX_DOCUMENTS).map((doc) => (
        <CommandItem
          key={doc.id}
          value={`document-${doc.id}`}
          keywords={[doc.title]}
          onSelect={() => onRun(() => router.push(`/w/${workspaceId}/d/${doc.id}`))}
        >
          <FileText />
          <span className="truncate">
            <Highlight text={doc.title} query={search} />
          </span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {doc.visibility === 'PUBLIC' ? 'Public' : 'Private'}
          </span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

/** Actions that need the open workspace: creating a document, inviting (owners only). */
function WorkspaceActions({
  workspaceId,
  search,
  onRun,
  onInvite,
}: {
  workspaceId: number;
  search: string;
  onRun: (run: () => void) => void;
  onInvite: (workspaceId: number) => void;
}) {
  const { create } = useNewDocument();
  const canInvite = useMembership(workspaceId).data?.canManageMembers ?? false;
  return (
    <>
      <Action
        label="New document"
        icon={<FilePlus2 />}
        search={search}
        onSelect={() => onRun(() => void create(workspaceId))}
      />
      {canInvite && (
        <Action
          label="Invite people"
          icon={<UserPlus />}
          search={search}
          onSelect={() => onRun(() => onInvite(workspaceId))}
        />
      )}
    </>
  );
}

function Action({
  label,
  icon,
  search,
  onSelect,
}: {
  label: string;
  icon: ReactNode;
  search: string;
  onSelect: () => void;
}) {
  return (
    <CommandItem value={`action-${label}`} keywords={[label]} onSelect={onSelect}>
      {icon}
      <Highlight text={label} query={search} />
    </CommandItem>
  );
}

/**
 * Jump to a document or workspace, or run an action. Everything listed comes from data the app
 * already has; nothing here makes a new kind of request.
 */
export function CommandPalette({
  open,
  onOpenChange,
  workspaces,
  activeWorkspaceId,
  onNewWorkspace,
  onInvite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces?: Workspace[];
  activeWorkspaceId?: number;
  onNewWorkspace: () => void;
  onInvite: (workspaceId: number) => void;
}) {
  const router = useRouter();
  const { resolvedTheme, toggle } = useTheme();
  const [search, setSearch] = useState('');

  const changeOpen = (next: boolean) => {
    if (!next) setSearch('');
    onOpenChange(next);
  };
  /** Closes the palette first, so focus returns before the action moves it elsewhere. */
  const runAndClose = (run: () => void) => {
    changeOpen(false);
    run();
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[14vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[640px]"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search documents and workspaces, or run an action.
        </DialogDescription>
        <Command
          filter={paletteFilter}
          loop
          className="[&_[cmdk-input-wrapper]]:h-14 [&_[data-slot=command-input-wrapper]]:h-14 [&_[data-slot=command-input-wrapper]]:border-overlay-border [&_[data-slot=command-input-wrapper]]:px-4"
        >
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search or jump to…"
            className="h-14 text-[15px] text-foreground"
          />
          <CommandList className="max-h-[min(420px,55vh)] p-2">
            <CommandEmpty>No results for “{search.trim()}”.</CommandEmpty>
            {activeWorkspaceId !== undefined && (
              <DocumentResults
                workspaceId={activeWorkspaceId}
                search={search}
                onRun={runAndClose}
              />
            )}
            <CommandGroup heading="Actions">
              {activeWorkspaceId !== undefined && (
                <WorkspaceActions
                  workspaceId={activeWorkspaceId}
                  search={search}
                  onRun={runAndClose}
                  onInvite={onInvite}
                />
              )}
              <Action
                label="New workspace"
                icon={<FolderPlus />}
                search={search}
                onSelect={() => runAndClose(onNewWorkspace)}
              />
              <Action
                label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
                icon={resolvedTheme === 'dark' ? <Sun /> : <Moon />}
                search={search}
                onSelect={() => runAndClose(toggle)}
              />
            </CommandGroup>
            {workspaces && workspaces.length > 0 && (
              <CommandGroup heading="Workspaces">
                {workspaces.map((workspace) => (
                  <CommandItem
                    key={workspace.id}
                    value={`workspace-${workspace.id}`}
                    keywords={[workspace.name]}
                    onSelect={() => runAndClose(() => router.push(`/w/${workspace.id}`))}
                  >
                    <WorkspaceTile id={workspace.id} name={workspace.name} />
                    <span className="truncate">
                      <Highlight text={workspace.name} query={search} />
                    </span>
                    {workspace.id === activeWorkspaceId && (
                      <span className="ml-auto text-xs text-muted-foreground">Current</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <div className="flex items-center gap-4 border-t border-overlay-border px-4 py-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> Navigate
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>
                <CornerDownLeft className="size-3" aria-hidden="true" />
              </Kbd>{' '}
              Open
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>Esc</Kbd> Close
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
