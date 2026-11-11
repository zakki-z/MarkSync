package com.example.document.workspace;

/**
 * What the workspace service allows a member to do. The workspace service derives it from the
 * member's role, so the rules live there and are not repeated in this service.
 */
public record WorkspaceAccess(boolean canEdit) {
}
