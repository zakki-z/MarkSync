package com.example.document.policy;

import com.example.document.entity.Document;
import com.example.document.entity.DocumentVisibility;
import com.example.document.workspace.WorkspaceClient;
import com.example.document.workspace.WorkspaceAccess;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Workspace members can read; members the workspace service allows to edit (owners and editors)
 * can edit; public documents are readable by anyone.
 */
@Component
public class WorkspaceDocumentAccessPolicy implements DocumentAccessPolicy {
    private final WorkspaceClient workspaces;

    public WorkspaceDocumentAccessPolicy(WorkspaceClient workspaces) {
        this.workspaces = workspaces;
    }

    @Override
    public boolean canRead(String userId, Document document) {
        return document.getVisibility() == DocumentVisibility.PUBLIC
                || canListIn(userId, document.getWorkspaceId());
    }

    @Override
    public boolean canEdit(String userId, Document document) {
        return canCreateIn(userId, document.getWorkspaceId());
    }

    @Override
    public boolean canListIn(String userId, Long workspaceId) {
        return accessOf(userId, workspaceId).isPresent();
    }

    @Override
    public boolean canCreateIn(String userId, Long workspaceId) {
        return accessOf(userId, workspaceId).filter(WorkspaceAccess::canEdit).isPresent();
    }

    private Optional<WorkspaceAccess> accessOf(String userId, Long workspaceId) {
        return userId == null ? Optional.empty() : workspaces.accessOf(userId, workspaceId);
    }
}
