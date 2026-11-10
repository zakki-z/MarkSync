package com.example.workspace.dto;

import com.example.workspace.entity.WorkspaceVisibility;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateWorkspaceRequest(
        @NotBlank(message = "Name is required")
        @Size(max = 120, message = "Name must be at most 120 characters")
        String name,
        WorkspaceVisibility visibility) {
}
