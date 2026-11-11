package com.example.document;

import com.example.document.repository.DocumentRepository;
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

import java.time.Instant;
import java.util.Date;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DocumentOwnershipTests {
    @Autowired
    private MockMvc mvc;
    @Autowired
    private DocumentRepository repository;
    @Value("${JWT_SECRET_KEY}")
    private String secret;

    private static final String COLLECTION = "/api/workspaces/5/documents";

    @BeforeEach
    void clearDocuments() {
        repository.deleteAll();
    }

    @Test
    void signedSubjectOwnsCreatedDocumentAndCanPerformCrudWithoutAuthorInBody() throws Exception {
        String owner = token("7", Instant.now().plusSeconds(600), secret);
        String location = mvc.perform(post(COLLECTION).header("Authorization", owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Original","markdown":"# Text","authorId":"8"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.authorId").value("7"))
                .andExpect(jsonPath("$.workspaceId").value(5))
                .andExpect(jsonPath("$.visibility").value("PRIVATE"))
                .andReturn().getResponse().getHeader("Location");
        mvc.perform(get(COLLECTION).header("Authorization", owner))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].authorId").value("7"));
        mvc.perform(get(location).header("Authorization", owner))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Original"));
        mvc.perform(put(location).header("Authorization", owner).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Updated","markdown":"New content"}
                                """))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Updated"))
                .andExpect(jsonPath("$.authorId").value("7"));
        mvc.perform(delete(location).header("Authorization", owner)).andExpect(status().isNoContent());
        mvc.perform(get(location).header("Authorization", owner)).andExpect(status().isNotFound());
    }

    @Test
    void otherUserCannotListReadUpdateOrDeleteEvenWithOwnersAuthorId() throws Exception {
        String owner = token("7", Instant.now().plusSeconds(600), secret);
        String other = token("8", Instant.now().plusSeconds(600), secret);
        String location = mvc.perform(post(COLLECTION).header("Authorization", owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Private","markdown":"Secret"}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getHeader("Location");
        mvc.perform(get(COLLECTION).header("Authorization", other))
                .andExpect(status().isOk()).andExpect(content().json("[]"));
        mvc.perform(get(location).header("Authorization", other)).andExpect(status().isNotFound());
        mvc.perform(put(location).header("Authorization", other).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Stolen","markdown":"Changed","authorId":"7"}
                                """))
                .andExpect(status().isNotFound());
        mvc.perform(delete(location).header("Authorization", other)).andExpect(status().isNotFound());
        mvc.perform(get(location).header("Authorization", owner)).andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Private"))
                .andExpect(jsonPath("$.markdown").value("Secret"));
    }

    @Test
    void documentsAreListedPerWorkspaceAndCannotBeMoved() throws Exception {
        String owner = token("7", Instant.now().plusSeconds(600), secret);
        String location = mvc.perform(post(COLLECTION).header("Authorization", owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Scoped","markdown":"Text","visibility":"PUBLIC"}
                                """))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.visibility").value("PUBLIC"))
                .andReturn().getResponse().getHeader("Location");
        mvc.perform(get("/api/workspaces/6/documents").header("Authorization", owner))
                .andExpect(status().isOk()).andExpect(content().json("[]"));
        mvc.perform(put(location).header("Authorization", owner).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Scoped","markdown":"Text","workspaceId":6}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void everyCrudEndpointRequiresAuthentication() throws Exception {
        mvc.perform(get(COLLECTION)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/documents/1")).andExpect(status().isUnauthorized());
        mvc.perform(post(COLLECTION).contentType(MediaType.APPLICATION_JSON)
                .content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/documents/1").contentType(MediaType.APPLICATION_JSON)
                .content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/documents/1")).andExpect(status().isUnauthorized());
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

    private String token(String subject, Instant expiration, String signingKey) throws Exception {
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder().subject(subject);
        if (expiration != null) claims.expirationTime(Date.from(expiration));
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims.build());
        jwt.sign(new MACSigner(signingKey));
        return "Bearer " + jwt.serialize();
    }
}
