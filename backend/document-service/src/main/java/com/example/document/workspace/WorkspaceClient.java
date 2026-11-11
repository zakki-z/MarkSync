package com.example.document.workspace;

import java.util.Optional;

/** Port to the workspace service, which owns workspaces and memberships. */
public interface WorkspaceClient {
    /** Returns the id of the owner's personal workspace, creating it when it does not exist yet. */
    Long findOrCreatePersonalWorkspace(String ownerId);

    /** Returns the user's role in the workspace, or empty when the user is not a member. */
    Optional<WorkspaceRole> roleOf(String userId, Long workspaceId);
}
