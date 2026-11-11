package com.example.document.migration;

import com.example.document.workspace.WorkspaceClient;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/**
 * Moves every pre-existing document into its author's personal workspace. Workspaces live in the
 * workspace service, so this cannot be plain SQL. It is idempotent: the personal workspace is
 * found or created per author, and only documents still without a workspace are updated.
 */
@Component
public class V3__BackfillDocumentWorkspaces extends BaseJavaMigration {
    private final WorkspaceClient workspaces;

    public V3__BackfillDocumentWorkspaces(WorkspaceClient workspaces) {
        this.workspaces = workspaces;
    }

    @Override
    public void migrate(Context context) throws SQLException {
        Connection connection = context.getConnection();
        for (String authorId : authorsWithoutWorkspace(connection)) {
            Long workspaceId = workspaces.findOrCreatePersonalWorkspace(authorId);
            try (PreparedStatement update = connection.prepareStatement(
                    "UPDATE documents SET workspace_id = ? WHERE author_id = ? AND workspace_id IS NULL")) {
                update.setLong(1, workspaceId);
                update.setString(2, authorId);
                update.executeUpdate();
            }
        }
    }

    private List<String> authorsWithoutWorkspace(Connection connection) throws SQLException {
        List<String> authors = new ArrayList<>();
        try (PreparedStatement select = connection.prepareStatement(
                "SELECT DISTINCT author_id FROM documents WHERE workspace_id IS NULL");
             ResultSet rows = select.executeQuery()) {
            while (rows.next()) {
                authors.add(rows.getString(1));
            }
        }
        return authors;
    }
}
