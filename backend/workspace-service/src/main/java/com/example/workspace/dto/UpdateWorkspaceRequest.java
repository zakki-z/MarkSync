package com.example.workspace.dto;

import com.example.workspace.entity.WorkspaceVisibility;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateWorkspaceRequest(
        @Pattern(regexp = ".*\\S.*", message = "Name must not be blank")
        @Size(max = 120, message = "Name must be at most 120 characters")
        String name,
        WorkspaceVisibility visibility) {
}
