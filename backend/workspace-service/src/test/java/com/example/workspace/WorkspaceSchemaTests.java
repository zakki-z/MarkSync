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

    private Workspace newWorkspace(WorkspaceVisibility visibility) {
        return workspaces.saveAndFlush(new Workspace("Team notes", visibility, "1"));
    }

    private WorkspaceInvitation newInvitation(Long workspaceId, String email, WorkspaceRole role, String hash) {
        return new WorkspaceInvitation(workspaceId, email, role, hash, "1",
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
        invitations.saveAndFlush(newInvitation(workspace.getId(), "a@example.com", WorkspaceRole.EDITOR, "h1"));

        jdbc.update("DELETE FROM workspaces WHERE id = ?", workspace.getId());

        assertThat(members.findAllByWorkspaceId(workspace.getId())).isEmpty();
        assertThat(invitations.findByTokenHash("h1")).isEmpty();
    }

    @Test
    void invitationDefaultsToPendingAndCanBeFoundByTokenHash() {
        Workspace workspace = newWorkspace(WorkspaceVisibility.PRIVATE);
        invitations.saveAndFlush(newInvitation(workspace.getId(), "a@example.com", WorkspaceRole.VIEWER, "h2"));

        WorkspaceInvitation found = invitations.findByTokenHash("h2").orElseThrow();

        assertThat(found.getStatus()).isEqualTo(InvitationStatus.PENDING);
        assertThat(invitations.existsByWorkspaceIdAndEmailAndStatus(
                workspace.getId(), "a@example.com", InvitationStatus.PENDING)).isTrue();
    }

    @Test
    void rejectsDuplicateTokenHash() {
        Workspace workspace = newWorkspace(WorkspaceVisibility.PRIVATE);
        invitations.saveAndFlush(newInvitation(workspace.getId(), "a@example.com", WorkspaceRole.VIEWER, "dup"));

        assertThatThrownBy(() -> invitations.saveAndFlush(
                newInvitation(workspace.getId(), "b@example.com", WorkspaceRole.VIEWER, "dup")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void invitationCannotGrantOwnership() {
        Workspace workspace = newWorkspace(WorkspaceVisibility.PRIVATE);

        assertThatThrownBy(() -> invitations.saveAndFlush(
                newInvitation(workspace.getId(), "a@example.com", WorkspaceRole.OWNER, "owner-attempt")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
