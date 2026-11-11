package com.example.workspace;

import com.example.workspace.entity.InvitationStatus;
import com.example.workspace.entity.Workspace;
import com.example.workspace.entity.WorkspaceInvitation;
import com.example.workspace.entity.WorkspaceMember;
import com.example.workspace.entity.WorkspaceRole;
import com.example.workspace.entity.WorkspaceVisibility;
import com.example.workspace.repository.WorkspaceInvitationRepository;
import com.example.workspace.repository.WorkspaceMemberRepository;
import com.example.workspace.repository.WorkspaceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Verifies that the Flyway migration produces the schema and constraints we rely on. */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class WorkspaceSchemaTests {

    @Autowired
    WorkspaceRepository workspaces;
    @Autowired
    WorkspaceMemberRepository members;
    @Autowired
    WorkspaceInvitationRepository invitations;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void startFromAnEmptyDatabase() {
        // Other test classes share this database; this runs inside the test's rolled-back transaction.
        jdbc.update("DELETE FROM workspaces");
    }

    private Workspace newWorkspace(WorkspaceVisibility visibility) {
        return workspaces.saveAndFlush(new Workspace("Team notes", visibility, "1"));
    }

    private WorkspaceInvitation newInvitation(Long workspaceId, String userId, WorkspaceRole role) {
        return new WorkspaceInvitation(workspaceId, userId, null, role, "1",
                Instant.now().plus(7, ChronoUnit.DAYS));
    }

    @Test
    void persistsWorkspaceWithTimestampsAndDefaultsToPrivate() {
        Workspace saved = workspaces.saveAndFlush(new Workspace("Docs", WorkspaceVisibility.PRIVATE, "1"));

        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getCreatedAt()).isNotNull();
        assertThat(saved.getVisibility()).isEqualTo(WorkspaceVisibility.PRIVATE);

        jdbc.update("INSERT INTO workspaces (name, owner_id, created_at, updated_at) "
                + "VALUES ('Raw', '2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
        String visibility = jdbc.queryForObject(
                "SELECT visibility FROM workspaces WHERE name = 'Raw'", String.class);
        assertThat(visibility).isEqualTo("PRIVATE");
    }

    @Test
    void rejectsUnknownVisibility() {
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO workspaces (name, visibility, owner_id, created_at, updated_at) "
                        + "VALUES ('Bad', 'SECRET', '1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsDuplicateMembership() {
        Workspace workspace = newWorkspace(WorkspaceVisibility.PRIVATE);
        members.saveAndFlush(new WorkspaceMember(workspace.getId(), "2", WorkspaceRole.VIEWER));

        assertThatThrownBy(() -> members.saveAndFlush(
                new WorkspaceMember(workspace.getId(), "2", WorkspaceRole.EDITOR)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsUnknownMemberRole() {
        Workspace workspace = newWorkspace(WorkspaceVisibility.PRIVATE);

        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at) "
                        + "VALUES (?, '2', 'ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", workspace.getId()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsMembershipForMissingWorkspace() {
        assertThatThrownBy(() -> members.saveAndFlush(new WorkspaceMember(9999L, "2", WorkspaceRole.VIEWER)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void deletingWorkspaceCascadesToMembersAndInvitations() {
        Workspace workspace = newWorkspace(WorkspaceVisibility.PRIVATE);
        members.saveAndFlush(new WorkspaceMember(workspace.getId(), "1", WorkspaceRole.OWNER));
        invitations.saveAndFlush(newInvitation(workspace.getId(), "2", WorkspaceRole.EDITOR));

        jdbc.update("DELETE FROM workspaces WHERE id = ?", workspace.getId());

        assertThat(members.findAllByWorkspaceId(workspace.getId())).isEmpty();
        assertThat(invitations.count()).isZero();
    }

    @Test
    void invitationDefaultsToPendingAndCanBeFoundByWorkspaceUserAndStatus() {
        Workspace workspace = newWorkspace(WorkspaceVisibility.PRIVATE);
        invitations.saveAndFlush(newInvitation(workspace.getId(), "2", WorkspaceRole.VIEWER));

        WorkspaceInvitation found = invitations.findByWorkspaceIdAndInvitedUserIdAndStatus(
                workspace.getId(), "2", InvitationStatus.PENDING).orElseThrow();

        assertThat(found.getStatus()).isEqualTo(InvitationStatus.PENDING);
        assertThat(found.getCreatedAt()).isNotNull();
    }

    @Test
    void rejectsASecondPendingInvitationForTheSameUserAndWorkspace() {
        Workspace workspace = newWorkspace(WorkspaceVisibility.PRIVATE);
        invitations.saveAndFlush(newInvitation(workspace.getId(), "2", WorkspaceRole.VIEWER));

        assertThatThrownBy(() -> invitations.saveAndFlush(
                newInvitation(workspace.getId(), "2", WorkspaceRole.EDITOR)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void allowsManyClosedInvitationsAndANewPendingOneForTheSameUser() {
        Workspace workspace = newWorkspace(WorkspaceVisibility.PRIVATE);
        for (int i = 0; i < 3; i++) {
            WorkspaceInvitation closed = invitations.saveAndFlush(
                    newInvitation(workspace.getId(), "2", WorkspaceRole.VIEWER));
            closed.decline();
            invitations.saveAndFlush(closed);
        }

        invitations.saveAndFlush(newInvitation(workspace.getId(), "2", WorkspaceRole.VIEWER));
        invitations.saveAndFlush(newInvitation(workspace.getId(), "3", WorkspaceRole.VIEWER));

        assertThat(invitations.count()).isEqualTo(5);
    }

    @Test
    void allowsPendingInvitationsForTheSameUserInDifferentWorkspaces() {
        invitations.saveAndFlush(newInvitation(newWorkspace(WorkspaceVisibility.PRIVATE).getId(), "2", WorkspaceRole.VIEWER));
        invitations.saveAndFlush(newInvitation(newWorkspace(WorkspaceVisibility.PRIVATE).getId(), "2", WorkspaceRole.VIEWER));

        assertThat(invitations.count()).isEqualTo(2);
    }

    @Test
    void invitationCannotGrantOwnership() {
        Workspace workspace = newWorkspace(WorkspaceVisibility.PRIVATE);

        assertThatThrownBy(() -> invitations.saveAndFlush(
                newInvitation(workspace.getId(), "2", WorkspaceRole.OWNER)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsAPendingMarkerThatDisagreesWithTheStatus() {
        Workspace workspace = newWorkspace(WorkspaceVisibility.PRIVATE);

        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO workspace_invitations (workspace_id, invited_user_id, role, status, "
                        + "invited_by, pending_marker, expires_at, created_at, updated_at) "
                        + "VALUES (?, '2', 'VIEWER', 'REVOKED', '1', TRUE, CURRENT_TIMESTAMP, "
                        + "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", workspace.getId()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
