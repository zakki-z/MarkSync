package com.example.document.migration;

import com.example.document.workspace.WorkspaceClient;
import com.example.document.workspace.WorkspaceRole;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.ActiveProfiles;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Seeds documents as they exist before MS-02 and verifies the migration keeps all of them. */
@SpringBootTest
@ActiveProfiles("test")
class DocumentWorkspaceMigrationTests {
    @Autowired
    private JdbcTemplate appJdbc;

    private final Map<String, Long> personalWorkspaces = new HashMap<>();
    private final WorkspaceClient workspaces = new StubWorkspaceClient() {
        @Override
        public Long findOrCreatePersonalWorkspace(String ownerId) {
            return personalWorkspaces.computeIfAbsent(ownerId, id -> 100L + personalWorkspaces.size());
        }
    };

    private JdbcTemplate jdbc;
    private DriverManagerDataSource dataSource;

    @BeforeEach
    void freshDatabase() {
        dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:migration-" + System.nanoTime() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(dataSource);
    }

    @Test
    void backfillsEveryExistingDocumentIntoItsAuthorsPersonalWorkspace() {
        migrateTo("1");
        seed("7", "A");
        seed("7", "B");
        seed("8", "C");

        migrateTo("3");

        List<Map<String, Object>> rows = jdbc.queryForList("SELECT title, author_id, workspace_id FROM documents ORDER BY id");
        assertThat(rows).hasSize(3);
        assertThat(rows).noneMatch(row -> row.get("WORKSPACE_ID") == null);
        assertThat(rows.get(0).get("WORKSPACE_ID")).isEqualTo(rows.get(1).get("WORKSPACE_ID"));
        assertThat(rows.get(2).get("WORKSPACE_ID")).isNotEqualTo(rows.get(0).get("WORKSPACE_ID"));
        assertThat(rows).extracting(row -> row.get("TITLE")).containsExactly("A", "B", "C");
        assertThat(personalWorkspaces).containsOnlyKeys("7", "8");
    }

    @Test
    void enforcesWorkspaceAndDefaultsExistingDocumentsToPrivate() {
        migrateTo("1");
        seed("7", "A");

        migrateTo("5");

        assertThat(jdbc.queryForObject("SELECT visibility FROM documents", String.class)).isEqualTo("PRIVATE");
        assertThatThrownBy(() -> seed("7", "No workspace")).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE documents SET visibility = 'SECRET'"))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void leavesAnEmptyDatabaseAloneAndNeverCallsTheWorkspaceService() {
        migrateTo("3");

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM documents", Integer.class)).isZero();
        assertThat(personalWorkspaces).isEmpty();
    }

    @Test
    void failsWithoutLosingDataWhenTheWorkspaceServiceIsDown() {
        migrateTo("1");
        seed("7", "A");
        WorkspaceClient down = new StubWorkspaceClient() {
            @Override
            public Long findOrCreatePersonalWorkspace(String ownerId) {
                throw new IllegalStateException("workspace service unavailable");
            }
        };

        assertThatThrownBy(() -> flyway("3", down).migrate()).isInstanceOf(RuntimeException.class);

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM documents", Integer.class)).isOne();
    }

    @Test
    void applicationContextRegistersTheBackfillMigration() {
        Integer applied = appJdbc.queryForObject(
                "SELECT COUNT(*) FROM \"flyway_schema_history\" WHERE \"version\" = '3'", Integer.class);

        assertThat(applied).isOne();
    }

    private void migrateTo(String version) {
        flyway(version, workspaces).migrate();
    }

    private Flyway flyway(String target, WorkspaceClient client) {
        return Flyway.configure()
                .dataSource(dataSource)
                .javaMigrations(new V3__BackfillDocumentWorkspaces(client))
                .target(target)
                .load();
    }

    private abstract static class StubWorkspaceClient implements WorkspaceClient {
        @Override
        public Optional<WorkspaceRole> roleOf(String userId, Long workspaceId) {
            throw new UnsupportedOperationException();
        }
    }

    private void seed(String authorId, String title) {
        jdbc.update("INSERT INTO documents (title, author_id, markdown, created_at, updated_at) "
                + "VALUES (?, ?, 'text', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", title, authorId);
    }
}
