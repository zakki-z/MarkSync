package com.example.workspace.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Seeds the V1 schema as MS-01 left it and verifies V2 keeps every workspace and membership. */
class InvitationMigrationTests {
    private SingleConnectionDataSource dataSource;
    private JdbcTemplate jdbc;

    @BeforeEach
    void freshDatabase() {
        // One shared connection: H2 check constraints created by a session that has since closed
        // fail with "database has been closed" on later inserts.
        dataSource = new SingleConnectionDataSource(
                "jdbc:h2:mem:migration-" + System.nanoTime() + ";MODE=PostgreSQL", "sa", "", true);
        jdbc = new JdbcTemplate(dataSource);
    }

    @AfterEach
    void closeDatabase() {
        dataSource.destroy();
    }

    @Test
    void keepsExistingMembershipsAndCreatorsStayOwners() {
        migrateTo("1");
        long first = workspace("7");
        long second = workspace("8");
        member(first, "7", "OWNER");
        member(first, "9", "VIEWER");
        member(second, "8", "OWNER");

        migrateTo("2");

        assertThat(roles()).containsExactlyInAnyOrder(
                Map.of("WORKSPACE_ID", first, "USER_ID", "7", "ROLE", "OWNER"),
                Map.of("WORKSPACE_ID", first, "USER_ID", "9", "ROLE", "VIEWER"),
                Map.of("WORKSPACE_ID", second, "USER_ID", "8", "ROLE", "OWNER"));
    }

    @Test
    void repairsAnOwnerWhoLostTheirMembershipOrRole() {
        migrateTo("1");
        long missing = workspace("7");
        long demoted = workspace("8");
        member(demoted, "8", "EDITOR");

        migrateTo("2");

        assertThat(roles()).containsExactlyInAnyOrder(
                Map.of("WORKSPACE_ID", missing, "USER_ID", "7", "ROLE", "OWNER"),
                Map.of("WORKSPACE_ID", demoted, "USER_ID", "8", "ROLE", "OWNER"));
    }

    @Test
    void replacesLegacyEmailInvitationsWithUserInvitations() {
        migrateTo("1");
        long id = workspace("7");
        jdbc.update("INSERT INTO workspace_invitations (workspace_id, email, role, token_hash, invited_by, "
                + "expires_at, created_at, updated_at) VALUES (?, 'a@example.com', 'VIEWER', 'h', '7', "
                + "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", id);

        migrateTo("2");

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM workspace_invitations", Integer.class)).isZero();
        jdbc.update("INSERT INTO workspace_invitations (workspace_id, invited_user_id, role, invited_by, "
                + "pending_marker, expires_at, created_at, updated_at) VALUES (?, '9', 'EDITOR', '7', TRUE, "
                + "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", id);
        assertThat(jdbc.queryForObject("SELECT status FROM workspace_invitations", String.class))
                .isEqualTo("PENDING");
    }

    @Test
    void migratingAnEmptyDatabaseSucceeds() {
        migrateTo("2");

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM workspace_members", Integer.class)).isZero();
    }

    private List<Map<String, Object>> roles() {
        return jdbc.queryForList("SELECT workspace_id, user_id, role FROM workspace_members");
    }

    private void migrateTo(String version) {
        Flyway.configure().dataSource(dataSource).target(version).load().migrate();
    }

    private long workspace(String ownerId) {
        jdbc.update("INSERT INTO workspaces (name, owner_id, created_at, updated_at) "
                + "VALUES ('W', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", ownerId);
        return jdbc.queryForObject("SELECT MAX(id) FROM workspaces", Long.class);
    }

    private void member(long workspaceId, String userId, String role) {
        jdbc.update("INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at) "
                + "VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", workspaceId, userId, role);
    }
}
