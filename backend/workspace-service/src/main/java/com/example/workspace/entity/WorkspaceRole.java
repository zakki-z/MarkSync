package com.example.workspace.entity;

/** A member's role. The capabilities live here so that every permission rule has one home. */
public enum WorkspaceRole {
    OWNER(true, true, true),
    EDITOR(true, false, false),
    VIEWER(false, false, false);

    private final boolean canEdit;
    private final boolean canManageMembers;
    private final boolean canManageWorkspace;

    WorkspaceRole(boolean canEdit, boolean canManageMembers, boolean canManageWorkspace) {
        this.canEdit = canEdit;
        this.canManageMembers = canManageMembers;
        this.canManageWorkspace = canManageWorkspace;
    }

    public boolean canEdit() {
        return canEdit;
    }

    public boolean canManageMembers() {
        return canManageMembers;
    }

    public boolean canManageWorkspace() {
        return canManageWorkspace;
    }
}
