package com.example.document;

import com.example.document.repository.DocumentRepository;
import com.example.document.workspace.WorkspaceClient;
import com.example.document.workspace.WorkspaceAccess;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.Date;
import java.util.Optional;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DocumentApiTests {
    private static final String COLLECTION = "/api/workspaces/5/documents";
    private static final String BODY = """
            {"title":"Notes","markdown":"# Text"}
            """;

    @Autowired
    private MockMvc mvc;
    @Autowired
    private DocumentRepository repository;
    @MockitoBean
    private WorkspaceClient workspaces;
    @Value("${JWT_SECRET_KEY}")
    private String secret;

    private String owner;
    private String editor;
    private String viewer;
    private String stranger;

    @BeforeEach
    void setUp() throws Exception {
        repository.deleteAll();
        when(workspaces.accessOf(anyString(), anyLong())).thenReturn(Optional.empty());
        when(workspaces.accessOf("7", 5L)).thenReturn(Optional.of(new WorkspaceAccess(true)));
        when(workspaces.accessOf("8", 5L)).thenReturn(Optional.of(new WorkspaceAccess(true)));
        when(workspaces.accessOf("9", 5L)).thenReturn(Optional.of(new WorkspaceAccess(false)));
        owner = token("7", Instant.now().plusSeconds(600), secret);
        editor = token("8", Instant.now().plusSeconds(600), secret);
        viewer = token("9", Instant.now().plusSeconds(600), secret);
        stranger = token("10", Instant.now().plusSeconds(600), secret);
    }

    @Test
    void ownerCreatesListsReadsUpdatesAndDeletesWithServerAssignedAuthorAndWorkspace() throws Exception {
        String location = create(owner, "{\"title\":\"Original\",\"markdown\":\"# Text\",\"authorId\":\"99\",\"workspaceId\":6}")
                .andExpect(jsonPath("$.authorId").value("7"))
                .andExpect(jsonPath("$.workspaceId").value(5))
                .andExpect(jsonPath("$.visibility").value("PRIVATE"))
                .andExpect(jsonPath("$.canEdit").value(true))
                .andReturn().getResponse().getHeader("Location");
        mvc.perform(get(COLLECTION).header("Authorization", owner))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].canEdit").value(true));
        mvc.perform(get("/api/workspaces/6/documents").header("Authorization", owner))
                .andExpect(status().isForbidden());
        mvc.perform(get(location).header("Authorization", owner))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Original"));
        mvc.perform(put(location).header("Authorization", owner).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Updated\",\"markdown\":\"New\",\"visibility\":\"PUBLIC\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Updated"))
                .andExpect(jsonPath("$.visibility").value("PUBLIC"));
        mvc.perform(delete(location).header("Authorization", owner)).andExpect(status().isNoContent());
        mvc.perform(get(location).header("Authorization", owner)).andExpect(status().isNotFound());
    }

    @Test
    void updatesKeepTheStoredMarkdownBecauseTheCollaborationServiceOwnsLiveContent() throws Exception {
        String location = create(owner, BODY).andReturn().getResponse().getHeader("Location");

        mvc.perform(put(location).header("Authorization", owner).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Renamed\",\"markdown\":\"Overwrite attempt\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Renamed"))
                .andExpect(jsonPath("$.markdown").value("# Text"));
        mvc.perform(put(location).header("Authorization", owner).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Metadata only\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.markdown").value("# Text"));
    }

    @Test
    void creatingWithoutInitialMarkdownIsRejected() throws Exception {
        mvc.perform(post(COLLECTION).header("Authorization", owner).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Notes\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void documentsCannotBeMovedToAnotherWorkspace() throws Exception {
        String location = create(owner, BODY).andReturn().getResponse().getHeader("Location");

        mvc.perform(put(location).header("Authorization", owner).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Notes\",\"markdown\":\"x\",\"workspaceId\":6}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void editorCanEditButViewerCanOnlyRead() throws Exception {
        String location = create(owner, BODY).andReturn().getResponse().getHeader("Location");

        mvc.perform(get(location).header("Authorization", editor))
                .andExpect(status().isOk()).andExpect(jsonPath("$.canEdit").value(true));
        mvc.perform(put(location).header("Authorization", editor).contentType(MediaType.APPLICATION_JSON)
                .content(BODY)).andExpect(status().isOk());
        create(editor, BODY).andExpect(status().isCreated());

        mvc.perform(get(location).header("Authorization", viewer))
                .andExpect(status().isOk()).andExpect(jsonPath("$.canEdit").value(false));
        mvc.perform(get(COLLECTION).header("Authorization", viewer))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].canEdit").value(false));
        create(viewer, BODY).andExpect(status().isForbidden());
        mvc.perform(put(location).header("Authorization", viewer).contentType(MediaType.APPLICATION_JSON)
                .content(BODY)).andExpect(status().isForbidden());
        mvc.perform(delete(location).header("Authorization", viewer)).andExpect(status().isForbidden());
    }

    @Test
    void nonMemberGetsForbiddenOnEveryOperationOnAPrivateDocument() throws Exception {
        String location = create(owner, BODY).andReturn().getResponse().getHeader("Location");

        mvc.perform(get(COLLECTION).header("Authorization", stranger)).andExpect(status().isForbidden());
        create(stranger, BODY).andExpect(status().isForbidden());
        mvc.perform(get(location).header("Authorization", stranger)).andExpect(status().isForbidden());
        mvc.perform(put(location).header("Authorization", stranger).contentType(MediaType.APPLICATION_JSON)
                .content(BODY)).andExpect(status().isForbidden());
        mvc.perform(delete(location).header("Authorization", stranger)).andExpect(status().isForbidden());
        mvc.perform(get(location).header("Authorization", owner)).andExpect(status().isOk());
    }

    @Test
    void anonymousRequestsAreUnauthorizedOnEveryEndpoint() throws Exception {
        String location = create(owner, BODY).andReturn().getResponse().getHeader("Location");

        mvc.perform(get(COLLECTION)).andExpect(status().isUnauthorized());
        mvc.perform(post(COLLECTION).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isUnauthorized());
        mvc.perform(get(location)).andExpect(status().isUnauthorized());
        mvc.perform(put(location).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isUnauthorized());
        mvc.perform(delete(location)).andExpect(status().isUnauthorized());
    }

    @Test
    void anyoneCanReadAPublicDocumentButNeverEditIt() throws Exception {
        String location = create(owner, "{\"title\":\"Open\",\"markdown\":\"# Hi\",\"visibility\":\"PUBLIC\"}")
                .andReturn().getResponse().getHeader("Location");

        mvc.perform(get(location)).andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Open")).andExpect(jsonPath("$.canEdit").value(false));
        mvc.perform(get(location).header("Authorization", stranger)).andExpect(status().isOk())
                .andExpect(jsonPath("$.canEdit").value(false));
        mvc.perform(get(location).header("Authorization", viewer)).andExpect(status().isOk())
                .andExpect(jsonPath("$.canEdit").value(false));
    }

    @Test
    void publicDocumentRejectsEveryWriteFromAnonymousAndNonEditors() throws Exception {
        String location = create(owner, "{\"title\":\"Open\",\"markdown\":\"# Hi\",\"visibility\":\"PUBLIC\"}")
                .andReturn().getResponse().getHeader("Location");
        String edit = "{\"title\":\"Hacked\",\"markdown\":\"x\",\"visibility\":\"PRIVATE\"}";

        mvc.perform(put(location).contentType(MediaType.APPLICATION_JSON).content(edit))
                .andExpect(status().isUnauthorized());
        mvc.perform(delete(location)).andExpect(status().isUnauthorized());
        for (String user : new String[] {stranger, viewer}) {
            mvc.perform(put(location).header("Authorization", user).contentType(MediaType.APPLICATION_JSON)
                    .content(edit)).andExpect(status().isForbidden());
            mvc.perform(delete(location).header("Authorization", user)).andExpect(status().isForbidden());
        }
        mvc.perform(post("/api/workspaces/5/documents").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isUnauthorized());
        mvc.perform(get(COLLECTION)).andExpect(status().isUnauthorized());
        mvc.perform(get(location)).andExpect(jsonPath("$.title").value("Open"))
                .andExpect(jsonPath("$.visibility").value("PUBLIC"));
    }

    @Test
    void invalidTokenIsRejectedEvenOnThePublicReadPath() throws Exception {
        String location = create(owner, "{\"title\":\"Open\",\"markdown\":\"\",\"visibility\":\"PUBLIC\"}")
                .andReturn().getResponse().getHeader("Location");

        mvc.perform(get(location).header("Authorization", token("7", Instant.now().minusSeconds(60), secret)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsForgedExpiredOrMissingIdentityAndExpiryTokens() throws Exception {
        for (String invalid : new String[] {
                token("7", Instant.now().plusSeconds(600), "a-different-test-only-secret-key-12345"),
                token("7", Instant.now().minusSeconds(600), secret),
                token(null, Instant.now().plusSeconds(600), secret),
                token("student@example.com", Instant.now().plusSeconds(600), secret),
                token("7", null, secret)
        }) {
            mvc.perform(get(COLLECTION).header("Authorization", invalid))
                    .andExpect(status().isUnauthorized());
        }
    }

    private org.springframework.test.web.servlet.ResultActions create(String token, String body) throws Exception {
        return mvc.perform(post(COLLECTION).header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private String token(String subject, Instant expiration, String signingKey) throws Exception {
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder().subject(subject);
        if (expiration != null) claims.expirationTime(Date.from(expiration));
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims.build());
        jwt.sign(new MACSigner(signingKey));
        return "Bearer " + jwt.serialize();
    }
}
