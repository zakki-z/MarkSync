package com.example.workspace;

import com.example.workspace.entity.Workspace;
import com.example.workspace.entity.WorkspaceMember;
import com.example.workspace.entity.WorkspaceRole;
import com.example.workspace.entity.WorkspaceVisibility;
import com.example.workspace.repository.WorkspaceMemberRepository;
import com.example.workspace.repository.WorkspaceRepository;
import com.example.workspace.support.FakeUserDirectory;
import com.example.workspace.support.Tokens;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Users: 1 olivia owner, 2 eli editor, 3 vera viewer, 5 omar outsider. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(FakeUserDirectory.Config.class)
class MembershipApiTests {
    @Autowired
    private MockMvc mvc;
    @Autowired
    private WorkspaceRepository workspaces;
    @Autowired
    private WorkspaceMemberRepository members;
    @Value("${JWT_SECRET_KEY}")
    private String secret;

    private Long workspaceId;
    private String owner;
    private String editor;
    private String viewer;
    private String outsider;

    @BeforeEach
    void setUp() throws Exception {
        workspaces.deleteAll();
        workspaceId = workspaces.save(new Workspace("Team", WorkspaceVisibility.PRIVATE, "1")).getId();
        members.save(new WorkspaceMember(workspaceId, "1", WorkspaceRole.OWNER));
        members.save(new WorkspaceMember(workspaceId, "2", WorkspaceRole.EDITOR));
        members.save(new WorkspaceMember(workspaceId, "3", WorkspaceRole.VIEWER));
        owner = Tokens.bearer(secret, "1");
        editor = Tokens.bearer(secret, "2");
        viewer = Tokens.bearer(secret, "3");
        outsider = Tokens.bearer(secret, "5");
    }

    // --- listing ---

    @Test
    void everyMemberSeesTheMembersWithUsernamesOwnersFirst() throws Exception {
        for (String member : new String[] {owner, editor, viewer}) {
            mvc.perform(get(url("/members")).header("Authorization", member))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$", hasSize(3)))
                    .andExpect(jsonPath("$[*].username", contains("olivia", "eli", "vera")))
                    .andExpect(jsonPath("$[*].role", contains("OWNER", "EDITOR", "VIEWER")));
        }
    }

    @Test
    void nonMembersCannotSeeTheMembers() throws Exception {
        mvc.perform(get(url("/members")).header("Authorization", outsider)).andExpect(status().isNotFound());
        mvc.perform(get(url("/members"))).andExpect(status().isUnauthorized());
    }

    @Test
    void membershipReportsWhatEachRoleMayDo() throws Exception {
        capabilities(owner, "OWNER", true, true, true);
        capabilities(editor, "EDITOR", true, false, false);
        capabilities(viewer, "VIEWER", false, false, false);
    }

    // --- changing roles ---

    @Test
    void ownerChangesARole() throws Exception {
        changeRole(owner, "3", "EDITOR")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value("3"))
                .andExpect(jsonPath("$.username").value("vera"))
                .andExpect(jsonPath("$.role").value("EDITOR"));

        assertThat(roleOf("3")).isEqualTo(WorkspaceRole.EDITOR);
    }

    @Test
    void ownerCanPromoteAnotherOwnerAndThenStepDown() throws Exception {
        changeRole(owner, "2", "OWNER").andExpect(status().isOk());
        changeRole(owner, "1", "VIEWER").andExpect(status().isOk());

        assertThat(roleOf("1")).isEqualTo(WorkspaceRole.VIEWER);
        assertThat(roleOf("2")).isEqualTo(WorkspaceRole.OWNER);
    }

    @Test
    void onlyAnOwnerCanChangeRoles() throws Exception {
        changeRole(editor, "3", "EDITOR").andExpect(status().isForbidden());
        changeRole(viewer, "2", "VIEWER").andExpect(status().isForbidden());
        changeRole(editor, "2", "OWNER").andExpect(status().isForbidden());
        changeRole(outsider, "3", "EDITOR").andExpect(status().isNotFound());

        assertThat(roleOf("3")).isEqualTo(WorkspaceRole.VIEWER);
        assertThat(roleOf("2")).isEqualTo(WorkspaceRole.EDITOR);
    }

    @Test
    void theLastOwnerCannotBeDemoted() throws Exception {
        changeRole(owner, "1", "EDITOR")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("A workspace must keep at least one owner"));

        assertThat(roleOf("1")).isEqualTo(WorkspaceRole.OWNER);
    }

    @Test
    void changingTheRoleOfANonMemberOrWithAnInvalidRoleFails() throws Exception {
        changeRole(owner, "5", "EDITOR").andExpect(status().isNotFound());
        changeRole(owner, "3", "ADMIN").andExpect(status().isBadRequest());
        mvc.perform(patch(url("/members/3")).header("Authorization", owner)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
    }

    // --- removing and leaving ---

    @Test
    void ownerRemovesAMember() throws Exception {
        mvc.perform(delete(url("/members/3")).header("Authorization", owner)).andExpect(status().isNoContent());

        assertThat(members.findByWorkspaceIdAndUserId(workspaceId, "3")).isEmpty();
        mvc.perform(get(url("/members")).header("Authorization", viewer)).andExpect(status().isNotFound());
    }

    @Test
    void onlyAnOwnerCanRemoveMembers() throws Exception {
        mvc.perform(delete(url("/members/3")).header("Authorization", editor)).andExpect(status().isForbidden());
        mvc.perform(delete(url("/members/2")).header("Authorization", viewer)).andExpect(status().isForbidden());
        mvc.perform(delete(url("/members/3")).header("Authorization", outsider)).andExpect(status().isNotFound());

        assertThat(members.findAllByWorkspaceId(workspaceId)).hasSize(3);
    }

    @Test
    void theLastOwnerCannotBeRemoved() throws Exception {
        mvc.perform(delete(url("/members/1")).header("Authorization", owner)).andExpect(status().isConflict());

        assertThat(roleOf("1")).isEqualTo(WorkspaceRole.OWNER);
    }

    @Test
    void anOwnerCanBeRemovedWhenAnotherOwnerRemains() throws Exception {
        changeRole(owner, "2", "OWNER").andExpect(status().isOk());

        mvc.perform(delete(url("/members/1")).header("Authorization", Tokens.bearer(secret, "2")))
                .andExpect(status().isNoContent());

        assertThat(members.countByWorkspaceIdAndRole(workspaceId, WorkspaceRole.OWNER)).isOne();
    }

    @Test
    void removingANonMemberIsNotFound() throws Exception {
        mvc.perform(delete(url("/members/5")).header("Authorization", owner)).andExpect(status().isNotFound());
    }

    @Test
    void membersCanLeave() throws Exception {
        mvc.perform(delete(url("/membership")).header("Authorization", viewer)).andExpect(status().isNoContent());
        mvc.perform(delete(url("/membership")).header("Authorization", editor)).andExpect(status().isNoContent());

        assertThat(members.findAllByWorkspaceId(workspaceId)).extracting(WorkspaceMember::getUserId)
                .containsExactly("1");
    }

    @Test
    void theLastOwnerCannotLeaveButACoOwnerCan() throws Exception {
        mvc.perform(delete(url("/membership")).header("Authorization", owner)).andExpect(status().isConflict());

        changeRole(owner, "2", "OWNER").andExpect(status().isOk());
        mvc.perform(delete(url("/membership")).header("Authorization", owner)).andExpect(status().isNoContent());

        assertThat(roleOf("2")).isEqualTo(WorkspaceRole.OWNER);
    }

    @Test
    void nonMembersCannotLeave() throws Exception {
        mvc.perform(delete(url("/membership")).header("Authorization", outsider)).andExpect(status().isNotFound());
    }

    @Test
    void aCoOwnerMayRenameTheWorkspaceButAnEditorMayNot() throws Exception {
        changeRole(owner, "2", "OWNER").andExpect(status().isOk());

        mvc.perform(patch("/api/workspaces/" + workspaceId).header("Authorization", editor)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Renamed\"}"))
                .andExpect(status().isOk());
        mvc.perform(patch("/api/workspaces/" + workspaceId).header("Authorization", viewer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Nope\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void memberEndpointsRequireAuthentication() throws Exception {
        mvc.perform(patch(url("/members/3")).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(delete(url("/members/3"))).andExpect(status().isUnauthorized());
        mvc.perform(delete(url("/membership"))).andExpect(status().isUnauthorized());
    }

    // --- helpers ---

    private String url(String path) {
        return "/api/workspaces/" + workspaceId + path;
    }

    private ResultActions changeRole(String token, String userId, String role) throws Exception {
        return mvc.perform(patch(url("/members/" + userId)).header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"" + role + "\"}"));
    }

    private WorkspaceRole roleOf(String userId) {
        return members.findByWorkspaceIdAndUserId(workspaceId, userId).orElseThrow().getRole();
    }

    private void capabilities(String token, String role, boolean edit, boolean members, boolean workspace)
            throws Exception {
        mvc.perform(get(url("/membership")).header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value(role))
                .andExpect(jsonPath("$.canEdit").value(edit))
                .andExpect(jsonPath("$.canManageMembers").value(members))
                .andExpect(jsonPath("$.canManageWorkspace").value(workspace));
    }
}
