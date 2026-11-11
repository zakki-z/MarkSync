package com.example.workspace.repository;

import com.example.workspace.entity.InvitationStatus;
import com.example.workspace.entity.WorkspaceInvitation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WorkspaceInvitationRepository extends JpaRepository<WorkspaceInvitation, Long> {
    Optional<WorkspaceInvitation> findByTokenHash(String tokenHash);

    List<WorkspaceInvitation> findAllByWorkspaceIdAndStatus(Long workspaceId, InvitationStatus status);

    boolean existsByWorkspaceIdAndEmailAndStatus(Long workspaceId, String email, InvitationStatus status);
}
