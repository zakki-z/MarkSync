package com.example.document.policy;

import com.example.document.entity.Document;
import com.example.document.entity.DocumentVisibility;
import com.example.document.workspace.WorkspaceClient;
import com.example.document.workspace.WorkspaceAccess;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class WorkspaceDocumentAccessPolicyTest {
    private static final Long WORKSPACE = 5L;

    /** Users: 1 owner and 2 editor (may edit), 3 viewer (read only), 4 not a member. */
    private final Map<String, WorkspaceAccess> access = Map.of(
            "1", new WorkspaceAccess(true), "2", new WorkspaceAccess(true), "3", new WorkspaceAccess(false));

    private final WorkspaceClient workspaces = new WorkspaceClient() {
        @Override
        public Long findOrCreatePersonalWorkspace(String ownerId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public Optional<WorkspaceAccess> accessOf(String userId, Long workspaceId) {
            return WORKSPACE.equals(workspaceId) ? Optional.ofNullable(access.get(userId)) : Optional.empty();
        }
    };

    private final DocumentAccessPolicy policy = new WorkspaceDocumentAccessPolicy(workspaces);

    @ParameterizedTest(name = "{0} on {1} document: read={2} edit={3}")
    @CsvSource({
            "1, PRIVATE, true,  true",
            "2, PRIVATE, true,  true",
            "3, PRIVATE, true,  false",
            "4, PRIVATE, false, false",
            "1, PUBLIC,  true,  true",
            "2, PUBLIC,  true,  true",
            "3, PUBLIC,  true,  false",
            "4, PUBLIC,  true,  false"
    })
    void membersFollowTheirRoleAndPublicDocumentsAreReadableByAnyUser(
            String userId, DocumentVisibility visibility, boolean read, boolean edit) {
        Document document = document(visibility);

        assertThat(policy.canRead(userId, document)).isEqualTo(read);
        assertThat(policy.canEdit(userId, document)).isEqualTo(edit);
    }

    @Test
    void anonymousVisitorsCanOnlyReadPublicDocuments() {
        assertThat(policy.canRead(null, document(DocumentVisibility.PUBLIC))).isTrue();
        assertThat(policy.canRead(null, document(DocumentVisibility.PRIVATE))).isFalse();
        assertThat(policy.canEdit(null, document(DocumentVisibility.PUBLIC))).isFalse();
        assertThat(policy.canEdit(null, document(DocumentVisibility.PRIVATE))).isFalse();
    }

    @Test
    void documentsOfAnotherWorkspaceGrantNothingToTheseMembers() {
        Document elsewhere = Document.builder().workspaceId(99L).visibility(DocumentVisibility.PRIVATE).build();

        assertThat(policy.canRead("1", elsewhere)).isFalse();
        assertThat(policy.canEdit("1", elsewhere)).isFalse();
    }

    @ParameterizedTest(name = "user {0}: list={1} create={2}")
    @CsvSource({"1, true, true", "2, true, true", "3, true, false", "4, false, false"})
    void workspaceLevelAccessFollowsMembershipRole(String userId, boolean list, boolean create) {
        assertThat(policy.canListIn(userId, WORKSPACE)).isEqualTo(list);
        assertThat(policy.canCreateIn(userId, WORKSPACE)).isEqualTo(create);
    }

    @Test
    void anonymousVisitorsCannotListOrCreate() {
        assertThat(policy.canListIn(null, WORKSPACE)).isFalse();
        assertThat(policy.canCreateIn(null, WORKSPACE)).isFalse();
    }

    private static Document document(DocumentVisibility visibility) {
        return Document.builder().workspaceId(WORKSPACE).visibility(visibility).build();
    }
}
