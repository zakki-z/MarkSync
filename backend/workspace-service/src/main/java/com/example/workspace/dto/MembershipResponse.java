package com.example.workspace.dto;

import com.example.workspace.entity.WorkspaceRole;

/** The calling user's role in a workspace. */
public record MembershipResponse(WorkspaceRole role) {
}
