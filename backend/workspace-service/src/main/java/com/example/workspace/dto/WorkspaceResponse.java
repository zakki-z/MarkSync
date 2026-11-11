package com.example.workspace.dto;

import com.example.workspace.entity.Workspace;
import com.example.workspace.entity.WorkspaceVisibility;

import java.time.Instant;

public record WorkspaceResponse(
        Long id,
        String name,
        WorkspaceVisibility visibility,
        String ownerId,
        Instant createdAt,
        Instant updatedAt) {

    public static WorkspaceResponse from(Workspace workspace) {
        return new WorkspaceResponse(
                workspace.getId(),
                workspace.getName(),
                workspace.getVisibility(),
                workspace.getOwnerId(),
                workspace.getCreatedAt(),
                workspace.getUpdatedAt());
    }
}
