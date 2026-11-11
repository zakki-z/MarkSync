package com.example.workspace.dto;

import com.example.workspace.entity.WorkspaceRole;

import java.time.Instant;

/** The username is looked up in the auth service and is null if the account no longer exists. */
public record MemberResponse(String userId, String username, WorkspaceRole role, Instant joinedAt) {
}
