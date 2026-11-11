package com.example.workspace.repository;

import com.example.workspace.entity.InvitationStatus;
import com.example.workspace.entity.WorkspaceInvitation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface WorkspaceInvitationRepository extends JpaRepository<WorkspaceInvitation, Long> {
    Optional<WorkspaceInvitation> findByWorkspaceIdAndInvitedUserIdAndStatus(
            Long workspaceId, String invitedUserId, InvitationStatus status);

    List<WorkspaceInvitation> findAllByWorkspaceIdAndStatusAndExpiresAtAfterOrderByCreatedAtDesc(
            Long workspaceId, InvitationStatus status, Instant now);

    List<WorkspaceInvitation> findAllByInvitedUserIdAndStatusAndExpiresAtAfterOrderByCreatedAtDesc(
            String invitedUserId, InvitationStatus status, Instant now);
}
