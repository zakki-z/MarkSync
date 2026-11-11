package com.example.workspace.service;

import com.example.workspace.directory.DirectoryUser;
import com.example.workspace.directory.UserDirectoryClient;
import com.example.workspace.dto.InvitationResponse;
import com.example.workspace.dto.SendInvitationRequest;
import com.example.workspace.entity.InvitationStatus;
import com.example.workspace.entity.Workspace;
import com.example.workspace.entity.WorkspaceInvitation;
import com.example.workspace.entity.WorkspaceMember;
import com.example.workspace.entity.WorkspaceRole;
import com.example.workspace.exception.BadRequestException;
import com.example.workspace.exception.ConflictException;
import com.example.workspace.exception.ResourceNotFoundException;
import com.example.workspace.policy.WorkspaceMemberPolicy;
import com.example.workspace.repository.WorkspaceInvitationRepository;
import com.example.workspace.repository.WorkspaceMemberRepository;
import com.example.workspace.repository.WorkspaceRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class InvitationService {
    private final WorkspaceInvitationRepository invitations;
    private final WorkspaceMemberRepository members;
    private final WorkspaceRepository workspaces;
    private final WorkspaceMemberPolicy policy;
    private final UserDirectoryClient directory;
    private final Duration ttl;

    public InvitationService(WorkspaceInvitationRepository invitations, WorkspaceMemberRepository members,
                             WorkspaceRepository workspaces, WorkspaceMemberPolicy policy,
                             UserDirectoryClient directory,
                             @Value("${workspace.invitation.ttl:7d}") Duration ttl) {
        this.invitations = invitations;
        this.members = members;
        this.workspaces = workspaces;
        this.policy = policy;
        this.directory = directory;
        this.ttl = ttl;
    }

    @Transactional
    public InvitationResponse send(Long workspaceId, SendInvitationRequest request, String actorId) {
        policy.requireCanManageMembers(workspaceId, actorId);
        if (request.role() == WorkspaceRole.OWNER) {
            throw new BadRequestException("Ownership cannot be granted by invitation");
        }
        String identifier = request.identifier().trim();
        DirectoryUser invitee = directory.findByIdentifier(identifier, actorId)
                .orElseThrow(() -> new ResourceNotFoundException("No user matches \"" + identifier + "\""));
        if (members.findByWorkspaceIdAndUserId(workspaceId, invitee.id()).isPresent()) {
            throw new ConflictException("This user is already a member of the workspace");
        }
        Instant now = Instant.now();
        invitations.findByWorkspaceIdAndInvitedUserIdAndStatus(workspaceId, invitee.id(), InvitationStatus.PENDING)
                .ifPresent(existing -> supersede(existing, now));

        String email = identifier.contains("@") ? identifier.toLowerCase() : null;
        WorkspaceInvitation invitation = invitations.save(new WorkspaceInvitation(
                workspaceId, invitee.id(), email, request.role(), actorId, now.plus(ttl)));
        return respond(List.of(invitation), actorId).getFirst();
    }

    public List<InvitationResponse> listForWorkspace(Long workspaceId, String actorId) {
        policy.requireCanManageMembers(workspaceId, actorId);
        return respond(invitations.findAllByWorkspaceIdAndStatusAndExpiresAtAfterOrderByCreatedAtDesc(
                workspaceId, InvitationStatus.PENDING, Instant.now()), actorId);
    }

    public List<InvitationResponse> listMine(String userId) {
        return respond(invitations.findAllByInvitedUserIdAndStatusAndExpiresAtAfterOrderByCreatedAtDesc(
                userId, InvitationStatus.PENDING, Instant.now()), userId);
    }

    /** Closes the invitation and creates the membership in one transaction. */
    @Transactional
    public InvitationResponse accept(Long invitationId, String userId) {
        WorkspaceInvitation invitation = findForInvitee(invitationId, userId);
        invitation.accept(Instant.now());
        members.save(new WorkspaceMember(invitation.getWorkspaceId(), userId, invitation.getRole()));
        return respond(List.of(invitation), userId).getFirst();
    }

    @Transactional
    public InvitationResponse decline(Long invitationId, String userId) {
        WorkspaceInvitation invitation = findForInvitee(invitationId, userId);
        invitation.decline();
        return respond(List.of(invitation), userId).getFirst();
    }

    @Transactional
    public void revoke(Long workspaceId, Long invitationId, String actorId) {
        policy.requireCanManageMembers(workspaceId, actorId);
        WorkspaceInvitation invitation = invitations.findById(invitationId)
                .filter(found -> found.getWorkspaceId().equals(workspaceId))
                .orElseThrow(() -> notFound(invitationId));
        invitation.revoke();
    }

    /** An expired pending invitation no longer blocks a new one; it is closed to free the slot. */
    private void supersede(WorkspaceInvitation existing, Instant now) {
        if (existing.isOpenAt(now)) {
            throw new ConflictException("This user already has a pending invitation");
        }
        existing.revoke();
        invitations.saveAndFlush(existing);
    }

    /** Anyone but the invited user sees "not found", so invitation ids reveal nothing. */
    private WorkspaceInvitation findForInvitee(Long invitationId, String userId) {
        return invitations.findById(invitationId)
                .filter(found -> found.getInvitedUserId().equals(userId))
                .orElseThrow(() -> notFound(invitationId));
    }

    private List<InvitationResponse> respond(List<WorkspaceInvitation> found, String actorId) {
        Set<String> userIds = new HashSet<>();
        found.forEach(i -> {
            userIds.add(i.getInvitedUserId());
            userIds.add(i.getInvitedBy());
        });
        Map<String, DirectoryUser> users = userIds.isEmpty() ? Map.of() : directory.findByIds(userIds, actorId);
        Map<Long, String> workspaceNames = workspaces.findAllById(
                        found.stream().map(WorkspaceInvitation::getWorkspaceId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(Workspace::getId, Workspace::getName));
        Function<String, String> username = id -> users.containsKey(id) ? users.get(id).username() : null;
        return found.stream().map(i -> new InvitationResponse(
                i.getId(), i.getWorkspaceId(), workspaceNames.get(i.getWorkspaceId()),
                i.getInvitedUserId(), username.apply(i.getInvitedUserId()), i.getInvitedEmail(),
                i.getRole(), i.getStatus(), i.getInvitedBy(), username.apply(i.getInvitedBy()),
                i.getCreatedAt(), i.getExpiresAt())).toList();
    }

    private static ResourceNotFoundException notFound(Long invitationId) {
        return new ResourceNotFoundException("Invitation not found: " + invitationId);
    }
}
