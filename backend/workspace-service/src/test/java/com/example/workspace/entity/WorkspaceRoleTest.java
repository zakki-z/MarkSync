package com.example.workspace.entity;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class WorkspaceRoleTest {
    @ParameterizedTest(name = "{0}: edit={1} members={2} workspace={3}")
    @CsvSource({
            "OWNER,  true,  true,  true",
            "EDITOR, true,  false, false",
            "VIEWER, false, false, false"
    })
    void capabilitiesFollowTheRole(WorkspaceRole role, boolean edit, boolean members, boolean workspace) {
        assertThat(role.canEdit()).isEqualTo(edit);
        assertThat(role.canManageMembers()).isEqualTo(members);
        assertThat(role.canManageWorkspace()).isEqualTo(workspace);
    }
}
