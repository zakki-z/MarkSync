package com.example.workspace;

import com.example.workspace.entity.WorkspaceMember;
import com.example.workspace.entity.WorkspaceRole;
import com.example.workspace.repository.WorkspaceMemberRepository;
import com.example.workspace.repository.WorkspaceRepository;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WorkspaceApiTests {
    private static final String OWNER_ID = "7";

    @Autowired
    private MockMvc mvc;
    @Autowired
    private WorkspaceRepository workspaces;
    @Autowired
    private WorkspaceMemberRepository members;
    @Value("${JWT_SECRET_KEY}")
    private String secret;

    private String owner;
    private String stranger;

    @BeforeEach
    void setUp() throws Exception {
        workspaces.deleteAll();
        owner = token(OWNER_ID);
        stranger = token("8");
    }

    @Test
    void createReturnsCreatedAndMakesCreatorAnOwnerMember() throws Exception {
        String location = create(owner, "Team notes", "PUBLIC")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Team notes"))
                .andExpect(jsonPath("$.visibility").value("PUBLIC"))
                .andExpect(jsonPath("$.ownerId").value(OWNER_ID))
                .andReturn().getResponse().getHeader("Location");

        WorkspaceMember member = members.findByWorkspaceIdAndUserId(idOf(location), OWNER_ID).orElseThrow();
        assertThat(member.getRole()).isEqualTo(WorkspaceRole.OWNER);
    }

    @Test
    void createDefaultsToPrivateVisibility() throws Exception {
        mvc.perform(post("/api/workspaces").header("Authorization", owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Quiet\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.visibility").value("PRIVATE"));
    }

    @Test
    void createRejectsBlankTooLongAndUnknownVisibility() throws Exception {
        create(owner, "   ", "PRIVATE").andExpect(status().isBadRequest());
        create(owner, "x".repeat(121), "PRIVATE").andExpect(status().isBadRequest());
        create(owner, "Valid", "SECRET").andExpect(status().isBadRequest());
        assertThat(workspaces.count()).isZero();
    }

    @Test
    void updateRejectsBlankAndTooLongName() throws Exception {
        String location = createdLocation(owner, "Docs", "PRIVATE");

        update(location, owner, "{\"name\":\" \"}").andExpect(status().isBadRequest());
        update(location, owner, "{\"name\":\"" + "x".repeat(121) + "\"}").andExpect(status().isBadRequest());
    }

    @Test
    void listReturnsOnlyWorkspacesTheCallerBelongsTo() throws Exception {
        createdLocation(owner, "Mine", "PRIVATE");
        createdLocation(stranger, "Theirs public", "PUBLIC");

        mvc.perform(get("/api/workspaces").header("Authorization", owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].name").value("Mine"));
    }

    @Test
    void nonMemberGetsNotFoundOnPrivateAndOkOnPublicWorkspace() throws Exception {
        String privateWorkspace = createdLocation(owner, "Private", "PRIVATE");
        String publicWorkspace = createdLocation(owner, "Public", "PUBLIC");

        mvc.perform(get(privateWorkspace).header("Authorization", stranger))
                .andExpect(status().isNotFound());
        mvc.perform(get(publicWorkspace).header("Authorization", stranger))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Public"));
    }

    @Test
    void nonOwnerMemberCannotUpdateOrDelete() throws Exception {
        String location = createdLocation(owner, "Shared", "PRIVATE");
        addMember(location, "8", WorkspaceRole.EDITOR);

        update(location, stranger, "{\"name\":\"Hijacked\"}").andExpect(status().isForbidden());
        mvc.perform(delete(location).header("Authorization", stranger)).andExpect(status().isForbidden());
        mvc.perform(get(location).header("Authorization", owner))
                .andExpect(jsonPath("$.name").value("Shared"));
    }

    @Test
    void nonMemberCannotUpdateOrDeletePrivateWorkspace() throws Exception {
        String location = createdLocation(owner, "Private", "PRIVATE");

        update(location, stranger, "{\"name\":\"Hijacked\"}").andExpect(status().isNotFound());
        mvc.perform(delete(location).header("Authorization", stranger)).andExpect(status().isNotFound());
    }

    @Test
    void ownerCanUpdateNameAndVisibility() throws Exception {
        String location = createdLocation(owner, "Old", "PRIVATE");

        update(location, owner, "{\"name\":\" New \",\"visibility\":\"PUBLIC\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("New"))
                .andExpect(jsonPath("$.visibility").value("PUBLIC"));
        update(location, owner, "{\"visibility\":\"PRIVATE\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("New"))
                .andExpect(jsonPath("$.visibility").value("PRIVATE"));
    }

    @Test
    void ownerCanDeleteAndWorkspaceAndMembersAreGone() throws Exception {
        String location = createdLocation(owner, "Temporary", "PRIVATE");
        Long id = idOf(location);

        mvc.perform(delete(location).header("Authorization", owner)).andExpect(status().isNoContent());

        mvc.perform(get(location).header("Authorization", owner)).andExpect(status().isNotFound());
        assertThat(members.findAllByWorkspaceId(id)).isEmpty();
    }

    @Test
    void requestsWithoutTokenAreUnauthorized() throws Exception {
        mvc.perform(get("/api/workspaces")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/workspaces/1")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/workspaces").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/workspaces/1").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/workspaces/1")).andExpect(status().isUnauthorized());
    }

    private ResultActions create(String token, String name,
                                                                        String visibility) throws Exception {
        return mvc.perform(post("/api/workspaces").header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + name + "\",\"visibility\":\"" + visibility + "\"}"));
    }

    private String createdLocation(String token, String name, String visibility) throws Exception {
        return create(token, name, visibility)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getHeader("Location");
    }

    private ResultActions update(String location, String token,
                                                                        String body) throws Exception {
        return mvc.perform(patch(location).header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private void addMember(String location, String userId, WorkspaceRole role) {
        members.save(new WorkspaceMember(idOf(location), userId, role));
    }

    private Long idOf(String location) {
        return Long.valueOf(location.substring(location.lastIndexOf('/') + 1));
    }

    private String token(String subject) throws Exception {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject(subject)
                .expirationTime(Date.from(Instant.now().plusSeconds(600)))
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
        jwt.sign(new MACSigner(secret));
        return "Bearer " + jwt.serialize();
    }
}
