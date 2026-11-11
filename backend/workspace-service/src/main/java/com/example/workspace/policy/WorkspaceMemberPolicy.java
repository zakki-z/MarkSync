package com.example.workspace.policy;

import com.example.workspace.entity.WorkspaceMember;
import com.example.workspace.exception.ForbiddenException;
import com.example.workspace.exception.ResourceNotFoundException;
import com.example.workspace.repository.WorkspaceMemberRepository;
import org.springframework.stereotype.Component;

/**
 * The single place that decides who may manage a workspace's members and invitations. What each
 * role may do is defined by {@code WorkspaceRole}; this class only applies it. Non-members get
 * "not found" so that private workspaces stay invisible to them.
 */
@Component
public class WorkspaceMemberPolicy {
    private final WorkspaceMemberRepository members;

    public WorkspaceMemberPolicy(WorkspaceMemberRepository members) {
        this.members = members;
    }

    /** The caller's membership; any role may view the member list. */
    public WorkspaceMember requireMember(Long workspaceId, String userId) {
        return members.findByWorkspaceIdAndUserId(workspaceId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceId));
    }

    /** Only roles that can manage members may invite, revoke, change roles or remove members. */
    public WorkspaceMember requireCanManageMembers(Long workspaceId, String userId) {
        WorkspaceMember member = requireMember(workspaceId, userId);
        if (!member.getRole().canManageMembers()) {
            throw new ForbiddenException("Only a workspace owner can manage members");
        }
        return member;
    }
}
