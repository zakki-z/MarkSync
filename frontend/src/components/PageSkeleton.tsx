import { Brand } from '@/src/components/ui';
import { WorkspaceTabs, type WorkspaceTab } from '@/src/components/WorkspaceTabs';

type Variant = 'documents' | 'document' | 'list';

const pulse = 'animate-pulse rounded-md bg-slate-200 motion-reduce:animate-none';

/** `height` is in pixels and matches the element that replaces the bar, so nothing moves. */
const Bar = ({ className = '', height }: { className?: string; height?: number }) => (
  <div className={`${pulse} ${className}`} style={{ height }} aria-hidden="true" />
);

/** Room for the presence panel (200 px when empty) until it is known whether there is one. */
export function PresencePanelPlaceholder() {
  return <Bar className="mb-5" height={200} />;
}

/** The sidebar's workspace list before it is known: same heading and row height as the list. */
export function WorkspaceListPlaceholder() {
  return (
    <nav className="sidebar-scroll" aria-hidden="true">
      <h2 className="sidebar-heading">Workspaces</h2>
      <ul className="list-rows">
        {[0, 1].map((row) => (
          <li key={row} className="list-row">
            <Bar className="w-full" height={40} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * What a signed-in page looks like before its data arrives. It uses the real layout classes and
 * the heights of the real elements (measured with an empty presence panel), so the sidebar, top
 * bar and content are already where they will be when the data lands. `label` stays in the page as
 * hidden text for screen readers. `workspace` shows the real, static section tabs.
 */
export function PageSkeleton({
  variant,
  label,
  workspace,
}: {
  variant: Variant;
  label: string;
  workspace?: { id: number; tab: WorkspaceTab };
}) {
  return (
    <main className="workspace" aria-busy="true">
      <aside className="sidebar" aria-hidden="true">
        <div className="sidebar-brand">
          <Brand />
        </div>
        <button type="button" className="button subtle new-workspace" disabled tabIndex={-1}>
          + New workspace
        </button>
        <span className="sidebar-link">My invitations</span>
        <WorkspaceListPlaceholder />
        <div className="profile-bar">
          <Bar className="w-32" height={34} />
        </div>
      </aside>
      <section className="editor-workspace">
        <p className="sr-only" role="status">
          {label}
        </p>
        <header className="workspace-topbar" aria-hidden="true">
          {workspace ? (
            <div className="workspace-location">
              <WorkspaceTabs workspaceId={workspace.id} current={workspace.tab} />
            </div>
          ) : (
            <Bar className="w-56" height={20} />
          )}
          {variant === 'documents' ? (
            <button className="button primary" disabled tabIndex={-1}>
              + New document
            </button>
          ) : (
            <Bar className="w-36" height={40} />
          )}
        </header>
        <div className="editor-body" aria-hidden="true">
          {variant === 'document' && (
            <>
              <PresencePanelPlaceholder />
              <div className="editor-heading">
                <Bar className="w-3/4" height={124} />
              </div>
              <Bar height={48} />
              <div className="editing-surface">
                <Bar className="m-7 w-2/3" height={16} />
                <Bar className="m-7 w-1/2" height={16} />
              </div>
            </>
          )}
          {variant === 'documents' && (
            <>
              <PresencePanelPlaceholder />
              <Bar className="mb-2.5 w-28" height={18} />
              <Bar className="mb-4" height={40} />
              <div className="flex flex-col gap-1">
                {[0, 1, 2, 3, 4, 5].map((row) => (
                  <Bar key={row} height={67} />
                ))}
              </div>
            </>
          )}
          {variant === 'list' && (
            <div className="flex flex-col gap-1">
              {[0, 1, 2, 3].map((row) => (
                <Bar key={row} height={56} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
