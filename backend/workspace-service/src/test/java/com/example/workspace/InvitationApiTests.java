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

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Users: 1 olivia owner, 2 eli editor, 3 vera viewer, 4 dana invitee, 5 omar outsider. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(FakeUserDirectory.Config.class)
class InvitationApiTests {
    @Autowired
    private MockMvc mvc;
    @Autowired
    private WorkspaceRepository workspaces;
    @Autowired
    private WorkspaceMemberRepository members;
    @Autowired
    private WorkspaceInvitationRepository invitations;
    @Value("${JWT_SECRET_KEY}")
    private String secret;

    private Long workspaceId;
    private String owner;
    private String editor;
    private String viewer;
    private String invitee;
    private String outsider;

    @BeforeEach
    void setUp() throws Exception {
        workspaces.deleteAll();
        Workspace workspace = workspaces.save(new Workspace("Team", WorkspaceVisibility.PRIVATE, "1"));
        workspaceId = workspace.getId();
        members.save(new WorkspaceMember(workspaceId, "1", WorkspaceRole.OWNER));
        members.save(new WorkspaceMember(workspaceId, "2", WorkspaceRole.EDITOR));
        members.save(new WorkspaceMember(workspaceId, "3", WorkspaceRole.VIEWER));
        owner = Tokens.bearer(secret, "1");
        editor = Tokens.bearer(secret, "2");
        viewer = Tokens.bearer(secret, "3");
        invitee = Tokens.bearer(secret, "4");
        outsider = Tokens.bearer(secret, "5");
    }

    // --- sending ---

    @Test
    void ownerInvitesByUsernameAndTheResponseNamesEveryone() throws Exception {
        send(owner, "dana", "EDITOR")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.workspaceId").value(workspaceId))
                .andExpect(jsonPath("$.workspaceName").value("Team"))
                .andExpect(jsonPath("$.invitedUserId").value("4"))
                .andExpect(jsonPath("$.invitedUsername").value("dana"))
                .andExpect(jsonPath("$.invitedEmail").doesNotExist())
                .andExpect(jsonPath("$.invitedByUsername").value("olivia"))
                .andExpect(jsonPath("$.role").value("EDITOR"))
                .andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test
    void ownerInvitesByEmailAndTheTypedEmailIsKeptForDisplay() throws Exception {
        send(owner, "  Dana@Example.com ", "VIEWER")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.invitedUserId").value("4"))
                .andExpect(jsonPath("$.invitedEmail").value("dana@example.com"));
    }

    @Test
    void invitationsExpireAfterTheConfiguredLifetime() throws Exception {
        send(owner, "dana", "VIEWER").andExpect(status().isCreated());

        Instant expires = invitations.findAll().getFirst().getExpiresAt();
        assertThat(expires).isBetween(Instant.now().plus(7, ChronoUnit.DAYS).minusSeconds(60),
                Instant.now().plus(7, ChronoUnit.DAYS).plusSeconds(60));
    }

    @Test
    void onlyAnOwnerCanInvite() throws Exception {
        send(editor, "dana", "VIEWER").andExpect(status().isForbidden());
        send(viewer, "dana", "VIEWER").andExpect(status().isForbidden());
        send(outsider, "dana", "VIEWER").andExpect(status().isNotFound());
        assertThat(invitations.count()).isZero();
    }

    @Test
    void anUnknownUserCannotBeInvited() throws Exception {
        send(owner, "nobody", "VIEWER").andExpect(status().isNotFound());
        send(owner, "nobody@example.com", "VIEWER").andExpect(status().isNotFound());
    }

    @Test
    void anExistingMemberCannotBeInvited() throws Exception {
        send(owner, "eli", "VIEWER").andExpect(status().isConflict());
        send(owner, "olivia", "VIEWER").andExpect(status().isConflict());
    }

    @Test
    void aSecondPendingInvitationForTheSameUserIsRejected() throws Exception {
        send(owner, "dana", "VIEWER").andExpect(status().isCreated());
        send(owner, "dana", "EDITOR").andExpect(status().isConflict());
        send(owner, "dana@example.com", "EDITOR").andExpect(status().isConflict());
        assertThat(invitations.count()).isOne();
    }

    @Test
    void anExpiredPendingInvitationDoesNotBlockANewOne() throws Exception {
        WorkspaceInvitation stale = expiredInvitation("4");

        send(owner, "dana", "EDITOR").andExpect(status().isCreated());

        assertThat(invitations.findById(stale.getId()).orElseThrow().getStatus()).isEqualTo(InvitationStatus.REVOKED);
        assertThat(invitations.count()).isEqualTo(2);
    }

    @Test
    void ownershipCannotBeGrantedByInvitation() throws Exception {
        send(owner, "dana", "OWNER").andExpect(status().isBadRequest());
    }

    @Test
    void invalidRequestsAreRejected() throws Exception {
        send(owner, "   ", "VIEWER").andExpect(status().isBadRequest());
        send(owner, "x".repeat(255), "VIEWER").andExpect(status().isBadRequest());
        send(owner, "dana", "ADMIN").andExpect(status().isBadRequest());
        mvc.perform(post(invitationsUrl()).header("Authorization", owner)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"identifier\":\"dana\"}"))
                .andExpect(status().isBadRequest());
    }

    // --- listing ---

    @Test
    void ownersListPendingInvitationsAndOthersCannot() throws Exception {
        send(owner, "dana", "VIEWER").andExpect(status().isCreated());
        send(owner, "omar", "EDITOR").andExpect(status().isCreated());

        mvc.perform(get(invitationsUrl()).header("Authorization", owner))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(2)));
        mvc.perform(get(invitationsUrl()).header("Authorization", editor)).andExpect(status().isForbidden());
        mvc.perform(get(invitationsUrl()).header("Authorization", viewer)).andExpect(status().isForbidden());
        mvc.perform(get(invitationsUrl()).header("Authorization", outsider)).andExpect(status().isNotFound());
    }

    @Test
    void listsOmitClosedAndExpiredInvitations() throws Exception {
        long declined = idOf(send(owner, "dana", "VIEWER"));
        mvc.perform(post("/api/invitations/" + declined + "/decline").header("Authorization", invitee))
                .andExpect(status().isOk());
        expiredInvitation("5");
        send(owner, "dana", "EDITOR").andExpect(status().isCreated());

        mvc.perform(get(invitationsUrl()).header("Authorization", owner))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].role").value("EDITOR"));
        mvc.perform(get("/api/invitations").header("Authorization", outsider))
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void usersSeeOnlyTheirOwnPendingInvitationsWithWorkspaceAndInviterNames() throws Exception {
        send(owner, "dana", "EDITOR").andExpect(status().isCreated());
        send(owner, "omar", "VIEWER").andExpect(status().isCreated());

        mvc.perform(get("/api/invitations").header("Authorization", invitee))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].workspaceName").value("Team"))
                .andExpect(jsonPath("$[0].invitedByUsername").value("olivia"))
                .andExpect(jsonPath("$[0].role").value("EDITOR"));
        mvc.perform(get("/api/invitations").header("Authorization", owner))
                .andExpect(jsonPath("$", hasSize(0)));
    }

    // --- accepting and declining ---

    @Test
    void acceptingCreatesAMembershipWithTheInvitedRoleAndClosesTheInvitation() throws Exception {
        long id = idOf(send(owner, "dana", "EDITOR"));

        mvc.perform(post("/api/invitations/" + id + "/accept").header("Authorization", invitee))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACCEPTED"));

        assertThat(members.findByWorkspaceIdAndUserId(workspaceId, "4").orElseThrow().getRole())
                .isEqualTo(WorkspaceRole.EDITOR);
        assertThat(invitations.findById(id).orElseThrow().getStatus()).isEqualTo(InvitationStatus.ACCEPTED);
        mvc.perform(get("/api/invitations").header("Authorization", invitee))
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void decliningClosesTheInvitationWithoutAMembershipAndAllowsAFreshInvite() throws Exception {
        long id = idOf(send(owner, "dana", "VIEWER"));

        mvc.perform(post("/api/invitations/" + id + "/decline").header("Authorization", invitee))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DECLINED"));

        assertThat(members.findByWorkspaceIdAndUserId(workspaceId, "4")).isEmpty();
        send(owner, "dana", "VIEWER").andExpect(status().isCreated());
    }

    @Test
    void onlyTheInvitedUserCanAcceptOrDecline() throws Exception {
        long id = idOf(send(owner, "dana", "EDITOR"));

        for (String other : new String[] {owner, editor, viewer, outsider}) {
            mvc.perform(post("/api/invitations/" + id + "/accept").header("Authorization", other))
                    .andExpect(status().isNotFound());
            mvc.perform(post("/api/invitations/" + id + "/decline").header("Authorization", other))
                    .andExpect(status().isNotFound());
        }
        assertThat(invitations.findById(id).orElseThrow().getStatus()).isEqualTo(InvitationStatus.PENDING);
        assertThat(members.findByWorkspaceIdAndUserId(workspaceId, "5")).isEmpty();
    }

    @Test
    void anInvitationCanOnlyBeUsedOnce() throws Exception {
        long accepted = idOf(send(owner, "dana", "EDITOR"));
        mvc.perform(post("/api/invitations/" + accepted + "/accept").header("Authorization", invitee))
                .andExpect(status().isOk());
        long declined = idOf(send(owner, "omar", "VIEWER"));
        mvc.perform(post("/api/invitations/" + declined + "/decline").header("Authorization", outsider))
                .andExpect(status().isOk());

        for (String action : new String[] {"accept", "decline"}) {
            mvc.perform(post("/api/invitations/" + accepted + "/" + action).header("Authorization", invitee))
                    .andExpect(status().isConflict());
            mvc.perform(post("/api/invitations/" + declined + "/" + action).header("Authorization", outsider))
                    .andExpect(status().isConflict());
        }
        assertThat(members.findByWorkspaceIdAndUserId(workspaceId, "5")).isEmpty();
    }

    @Test
    void anExpiredInvitationCannotBeAccepted() throws Exception {
        WorkspaceInvitation stale = expiredInvitation("4");

        mvc.perform(post("/api/invitations/" + stale.getId() + "/accept").header("Authorization", invitee))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("This invitation has expired"));

        assertThat(members.findByWorkspaceIdAndUserId(workspaceId, "4")).isEmpty();
    }

    @Test
    void acceptingAnUnknownInvitationIsNotFound() throws Exception {
        mvc.perform(post("/api/invitations/9999/accept").header("Authorization", invitee))
                .andExpect(status().isNotFound());
    }

    // --- revoking ---

    @Test
    void ownerRevokesAPendingInvitationAndItCanNoLongerBeAccepted() throws Exception {
        long id = idOf(send(owner, "dana", "EDITOR"));

        mvc.perform(delete(invitationsUrl() + "/" + id).header("Authorization", owner))
                .andExpect(status().isNoContent());

        assertThat(invitations.findById(id).orElseThrow().getStatus()).isEqualTo(InvitationStatus.REVOKED);
        mvc.perform(post("/api/invitations/" + id + "/accept").header("Authorization", invitee))
                .andExpect(status().isConflict());
        send(owner, "dana", "VIEWER").andExpect(status().isCreated());
    }

    @Test
    void onlyAnOwnerCanRevoke() throws Exception {
        long id = idOf(send(owner, "dana", "EDITOR"));

        mvc.perform(delete(invitationsUrl() + "/" + id).header("Authorization", editor)).andExpect(status().isForbidden());
        mvc.perform(delete(invitationsUrl() + "/" + id).header("Authorization", viewer)).andExpect(status().isForbidden());
        mvc.perform(delete(invitationsUrl() + "/" + id).header("Authorization", invitee)).andExpect(status().isNotFound());
        mvc.perform(delete(invitationsUrl() + "/" + id).header("Authorization", outsider)).andExpect(status().isNotFound());
        assertThat(invitations.findById(id).orElseThrow().getStatus()).isEqualTo(InvitationStatus.PENDING);
    }

    @Test
    void aClosedInvitationCannotBeRevokedAndAnotherWorkspacesInvitationIsNotFound() throws Exception {
        long id = idOf(send(owner, "dana", "EDITOR"));
        mvc.perform(post("/api/invitations/" + id + "/decline").header("Authorization", invitee));
        Workspace other = workspaces.save(new Workspace("Other", WorkspaceVisibility.PRIVATE, "1"));
        members.save(new WorkspaceMember(other.getId(), "1", WorkspaceRole.OWNER));

        mvc.perform(delete(invitationsUrl() + "/" + id).header("Authorization", owner)).andExpect(status().isConflict());
        mvc.perform(delete("/api/workspaces/" + other.getId() + "/invitations/" + id).header("Authorization", owner))
                .andExpect(status().isNotFound());
    }

    @Test
    void invitationEndpointsRequireAuthentication() throws Exception {
        mvc.perform(get(invitationsUrl())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/invitations")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/invitations/1/accept")).andExpect(status().isUnauthorized());
        mvc.perform(delete(invitationsUrl() + "/1")).andExpect(status().isUnauthorized());
    }

    // --- helpers ---

    private String invitationsUrl() {
        return "/api/workspaces/" + workspaceId + "/invitations";
    }

    private ResultActions send(String token, String identifier, String role) throws Exception {
        return mvc.perform(post(invitationsUrl()).header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"identifier\":\"" + identifier + "\",\"role\":\"" + role + "\"}"));
    }

    private static long idOf(ResultActions sent) throws Exception {
        sent.andExpect(status().isCreated());
        String body = sent.andReturn().getResponse().getContentAsString();
        return Long.parseLong(body.replaceAll(".*\"id\":(\\d+).*", "$1"));
    }

    private WorkspaceInvitation expiredInvitation(String userId) {
        return invitations.save(new WorkspaceInvitation(workspaceId, userId, null, WorkspaceRole.VIEWER, "1",
                Instant.now().minus(1, ChronoUnit.HOURS)));
    }
}
