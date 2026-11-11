import Link from 'next/link';

const TABS = [
  { id: 'documents', label: 'Documents', path: '' },
  { id: 'members', label: 'Members', path: '/members' },
  { id: 'invitations', label: 'Invitations', path: '/invitations' },
] as const;

export type WorkspaceTab = (typeof TABS)[number]['id'];

/** Switches between the sections of one workspace; invitations are managed per workspace. */
export function WorkspaceTabs({
  workspaceId,
  current,
}: {
  workspaceId: number;
  current: WorkspaceTab;
}) {
  return (
    <nav className="workspace-tabs" aria-label="Workspace sections">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={`/w/${workspaceId}${tab.path}`}
          className={tab.id === current ? 'workspace-tab active' : 'workspace-tab'}
          aria-current={tab.id === current ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
