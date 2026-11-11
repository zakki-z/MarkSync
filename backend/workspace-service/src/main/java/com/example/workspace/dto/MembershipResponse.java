package com.example.workspace.dto;

import com.example.workspace.entity.WorkspaceRole;

/**
 * The calling user's role in a workspace and what it allows. Clients show or hide actions from the
 * capabilities and never re-derive them from the role.
 */
public record MembershipResponse(
        WorkspaceRole role,
        boolean canEdit,
        boolean canManageMembers,
        boolean canManageWorkspace) {

    public static MembershipResponse of(WorkspaceRole role) {
        return new MembershipResponse(role, role.canEdit(), role.canManageMembers(), role.canManageWorkspace());
    }
}
