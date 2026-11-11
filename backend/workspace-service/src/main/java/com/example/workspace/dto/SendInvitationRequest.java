package com.example.workspace.dto;

import com.example.workspace.entity.WorkspaceRole;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** The identifier is a username or an email address. */
public record SendInvitationRequest(
        @NotBlank(message = "Username or email is required")
        @Size(max = 254, message = "Username or email must be at most 254 characters")
        String identifier,
        @NotNull(message = "Role is required")
        WorkspaceRole role) {
}
