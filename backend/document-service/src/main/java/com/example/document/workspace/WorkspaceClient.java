package com.example.document.workspace;

/** Port to the workspace service, which owns workspaces and memberships. */
public interface WorkspaceClient {
    /** Returns the id of the owner's personal workspace, creating it when it does not exist yet. */
    Long findOrCreatePersonalWorkspace(String ownerId);
}
