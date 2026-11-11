package com.example.document.workspace;

/** A user's role in a workspace, as defined by the workspace service. */
public enum WorkspaceRole {
    OWNER,
    EDITOR,
    VIEWER;

    public boolean canEdit() {
        return this != VIEWER;
    }
}
