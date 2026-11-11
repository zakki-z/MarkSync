package com.example.workspace.service;

import com.example.workspace.directory.DirectoryUser;
import com.example.workspace.directory.UserDirectoryClient;
import com.example.workspace.dto.ChangeRoleRequest;
import com.example.workspace.dto.MemberResponse;
import com.example.workspace.entity.WorkspaceMember;
import com.example.workspace.entity.WorkspaceRole;
import com.example.workspace.exception.ConflictException;
import com.example.workspace.exception.ResourceNotFoundException;
import com.example.workspace.policy.WorkspaceMemberPolicy;
import com.example.workspace.repository.WorkspaceMemberRepository;
import com.example.workspace.repository.WorkspaceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class MembershipService {
    private final WorkspaceMemberRepository members;
    private final WorkspaceRepository workspaces;
    private final WorkspaceMemberPolicy policy;
    private final UserDirectoryClient directory;

    public MembershipService(WorkspaceMemberRepository members, WorkspaceRepository workspaces,
                             WorkspaceMemberPolicy policy, UserDirectoryClient directory) {
        this.members = members;
        this.workspaces = workspaces;
        this.policy = policy;
        this.directory = directory;
    }

    /** Every member can see who else is in the workspace. */
    public List<MemberResponse> list(Long workspaceId, String actorId) {
        policy.requireMember(workspaceId, actorId);
        List<WorkspaceMember> found = members.findAllByWorkspaceId(workspaceId).stream()
                .sorted(Comparator.comparing(WorkspaceMember::getRole)
                        .thenComparing(WorkspaceMember::getCreatedAt))
                .toList();
        Set<String> userIds = found.stream().map(WorkspaceMember::getUserId).collect(Collectors.toSet());
        Map<String, DirectoryUser> users = directory.findByIds(userIds, actorId);
        return found.stream()
                .map(member -> new MemberResponse(member.getUserId(),
                        users.containsKey(member.getUserId()) ? users.get(member.getUserId()).username() : null,
                        member.getRole(), member.getCreatedAt()))
                .toList();
    }

    @Transactional
    public MemberResponse changeRole(Long workspaceId, String userId, ChangeRoleRequest request, String actorId) {
        lockWorkspace(workspaceId);
        policy.requireCanManageMembers(workspaceId, actorId);
        WorkspaceMember member = find(workspaceId, userId);
        if (request.role() != WorkspaceRole.OWNER) {
            requireAnotherOwner(member);
        }
        member.setRole(request.role());
        DirectoryUser user = directory.findByIds(Set.of(userId), actorId).get(userId);
        return new MemberResponse(userId, user == null ? null : user.username(), member.getRole(),
                member.getCreatedAt());
    }

    @Transactional
    public void remove(Long workspaceId, String userId, String actorId) {
        lockWorkspace(workspaceId);
        policy.requireCanManageMembers(workspaceId, actorId);
        delete(find(workspaceId, userId));
    }

    @Transactional
    public void leave(Long workspaceId, String userId) {
        lockWorkspace(workspaceId);
        delete(policy.requireMember(workspaceId, userId));
    }

    private void delete(WorkspaceMember member) {
        requireAnotherOwner(member);
        members.delete(member);
    }

    /** A workspace always keeps at least one owner: its last one can be neither demoted nor removed. */
    private void requireAnotherOwner(WorkspaceMember member) {
        if (member.getRole() == WorkspaceRole.OWNER
                && members.countByWorkspaceIdAndRole(member.getWorkspaceId(), WorkspaceRole.OWNER) <= 1) {
            throw new ConflictException("A workspace must keep at least one owner");
        }
    }

    private WorkspaceMember find(Long workspaceId, String userId) {
        return members.findByWorkspaceIdAndUserId(workspaceId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Member not found: " + userId));
    }

    private void lockWorkspace(Long workspaceId) {
        workspaces.findWithLockById(workspaceId)
                .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceId));
    }
}
