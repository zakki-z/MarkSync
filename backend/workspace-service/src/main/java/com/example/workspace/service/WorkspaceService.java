package com.example.workspace.service;

import com.example.workspace.dto.CreateWorkspaceRequest;
import com.example.workspace.dto.MembershipResponse;
import com.example.workspace.dto.UpdateWorkspaceRequest;
import com.example.workspace.dto.WorkspaceResponse;
import com.example.workspace.entity.Workspace;
import com.example.workspace.entity.WorkspaceMember;
import com.example.workspace.entity.WorkspaceRole;
import com.example.workspace.entity.WorkspaceVisibility;
import com.example.workspace.exception.ForbiddenException;
import com.example.workspace.exception.ResourceNotFoundException;
import com.example.workspace.repository.WorkspaceMemberRepository;
import com.example.workspace.repository.WorkspaceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class WorkspaceService {
    private final WorkspaceRepository workspaces;
    private final WorkspaceMemberRepository members;

    public WorkspaceService(WorkspaceRepository workspaces, WorkspaceMemberRepository members) {
        this.workspaces = workspaces;
        this.members = members;
    }

    @Transactional
    public WorkspaceResponse create(CreateWorkspaceRequest request, String userId) {
        WorkspaceVisibility visibility = request.visibility() != null
                ? request.visibility()
                : WorkspaceVisibility.PRIVATE;
        Workspace workspace = workspaces.save(new Workspace(request.name().trim(), visibility, userId));
        members.save(new WorkspaceMember(workspace.getId(), userId, WorkspaceRole.OWNER));
        return WorkspaceResponse.from(workspace);
    }

    public List<WorkspaceResponse> list(String userId) {
        List<Long> workspaceIds = members.findAllByUserId(userId).stream()
                .map(WorkspaceMember::getWorkspaceId)
                .toList();
        return workspaces.findAllById(workspaceIds).stream()
                .sorted(Comparator.comparing(Workspace::getUpdatedAt).reversed())
                .map(WorkspaceResponse::from)
                .toList();
    }

    public WorkspaceResponse get(Long id, String userId) {
        return WorkspaceResponse.from(findVisible(id, userId));
    }

    public MembershipResponse membership(Long id, String userId) {
        return members.findByWorkspaceIdAndUserId(id, userId)
                .map(member -> MembershipResponse.of(member.getRole()))
                .orElseThrow(() -> notFound(id));
    }

    @Transactional
    public WorkspaceResponse update(Long id, UpdateWorkspaceRequest request, String userId) {
        Workspace workspace = findOwned(id, userId);
        if (request.name() != null) {
            workspace.setName(request.name().trim());
        }
        if (request.visibility() != null) {
            workspace.setVisibility(request.visibility());
        }
        return WorkspaceResponse.from(workspaces.saveAndFlush(workspace));
    }

    @Transactional
    public void delete(Long id, String userId) {
        workspaces.delete(findOwned(id, userId));
    }

    private Workspace findVisible(Long id, String userId) {
        Workspace workspace = workspaces.findById(id).orElseThrow(() -> notFound(id));
        boolean visible = workspace.getVisibility() == WorkspaceVisibility.PUBLIC
                || members.findByWorkspaceIdAndUserId(id, userId).isPresent();
        if (!visible) {
            throw notFound(id);
        }
        return workspace;
    }

    private Workspace findOwned(Long id, String userId) {
        Workspace workspace = findVisible(id, userId);
        boolean allowed = members.findByWorkspaceIdAndUserId(id, userId)
                .filter(member -> member.getRole().canManageWorkspace())
                .isPresent();
        if (!allowed) {
            throw new ForbiddenException("Only a workspace owner can do this");
        }
        return workspace;
    }

    private ResourceNotFoundException notFound(Long id) {
        return new ResourceNotFoundException("Workspace not found: " + id);
    }
}
