package com.example.workspace.dto;

import com.example.workspace.entity.WorkspaceRole;
import jakarta.validation.constraints.NotNull;

public record ChangeRoleRequest(@NotNull(message = "Role is required") WorkspaceRole role) {
}
