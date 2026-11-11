import type { Workspace } from '@/src/workspaceService';

type Props = {
  workspaces: Workspace[];
  activeId: number;
  onSelect: (id: number) => void;
  onCreate: () => void;
};

export function WorkspaceSwitcher({ workspaces, activeId, onSelect, onCreate }: Props) {
  return (
    <div className="workspace-switcher">
      <label className="search-label" htmlFor="workspace-switcher">
        Workspace
      </label>
      <select
        id="workspace-switcher"
        className="search-input"
        value={activeId}
        onChange={(event) => onSelect(Number(event.target.value))}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      <button type="button" className="button subtle" onClick={onCreate}>
        + New workspace
      </button>
    </div>
  );
}
