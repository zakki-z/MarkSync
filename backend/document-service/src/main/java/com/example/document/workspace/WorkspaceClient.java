package com.example.document.workspace;

import java.util.Optional;

/** Port to the workspace service, which owns workspaces and memberships. */
public interface WorkspaceClient {
    /** Returns the id of the owner's personal workspace, creating it when it does not exist yet. */
    Long findOrCreatePersonalWorkspace(String ownerId);

    /** Returns what the user may do in the workspace, or empty when the user is not a member. */
    Optional<WorkspaceAccess> accessOf(String userId, Long workspaceId);
}
