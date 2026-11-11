package com.example.workspace.dto;

import com.example.workspace.entity.InvitationStatus;
import com.example.workspace.entity.WorkspaceRole;

import java.time.Instant;

/** Usernames are looked up in the auth service and are null if the account no longer exists. */
public record InvitationResponse(
        Long id,
        Long workspaceId,
        String workspaceName,
        String invitedUserId,
        String invitedUsername,
        String invitedEmail,
        WorkspaceRole role,
        InvitationStatus status,
        String invitedBy,
        String invitedByUsername,
        Instant createdAt,
        Instant expiresAt) {
}
