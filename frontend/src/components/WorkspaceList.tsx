import Link from 'next/link';
import { PinButton } from '@/src/components/PinButton';
import type { Workspace } from '@/src/workspaceService';

type Props = {
  workspaces: Workspace[];
  activeId: number;
  pinned: number[];
  onTogglePin: (id: number) => void;
};

/** Workspaces as a conversation-style list: pinned first, then the rest. */
export function WorkspaceList({ workspaces, activeId, pinned, onTogglePin }: Props) {
  const pinnedWorkspaces = pinned.flatMap((id) => workspaces.find((w) => w.id === id) ?? []);
  const others = workspaces.filter((workspace) => !pinned.includes(workspace.id));

  const row = (workspace: Workspace) => (
    <li key={workspace.id} className={`list-row ${workspace.id === activeId ? 'selected' : ''}`}>
      <Link
        href={`/w/${workspace.id}`}
        className="list-row-link"
        aria-current={workspace.id === activeId ? 'page' : undefined}
      >
        {workspace.name}
      </Link>
      <PinButton
        label={workspace.name}
        pinned={pinned.includes(workspace.id)}
        onClick={() => onTogglePin(workspace.id)}
      />
    </li>
  );

  return (
    <nav className="sidebar-scroll" aria-label="Workspaces">
      {pinnedWorkspaces.length > 0 && (
        <>
          <h2 className="sidebar-heading">Pinned</h2>
          <ul className="list-rows">{pinnedWorkspaces.map(row)}</ul>
        </>
      )}
      <h2 className="sidebar-heading">Workspaces</h2>
      <ul className="list-rows">{others.map(row)}</ul>
    </nav>
  );
}
