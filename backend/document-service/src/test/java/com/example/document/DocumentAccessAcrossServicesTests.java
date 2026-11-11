package com.example.document;

import com.example.document.repository.DocumentRepository;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The MS-03 definition of done at the document service: two accounts in the same workspace get
 * different access according to their roles. The workspace service is replaced by an HTTP server
 * that answers the real membership endpoint's JSON for each caller, so the real client and policy run.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DocumentAccessAcrossServicesTests {
    private static final long WORKSPACE = 5;
    private static final String BODY = "{\"title\":\"Notes\",\"markdown\":\"# Text\"}";

    /** What GET /api/workspaces/5/membership returns for each user; absent users are not members. */
    private static final Map<String, String> MEMBERSHIPS = Map.of(
            "1", membership("OWNER", true, true, true),
            "2", membership("EDITOR", true, false, false),
            "3", membership("VIEWER", false, false, false));

    private static HttpServer workspaceService;

    @Autowired
    private MockMvc mvc;
    @Autowired
    private DocumentRepository repository;
    @Value("${JWT_SECRET_KEY}")
    private String secret;

    @BeforeAll
    static void startWorkspaceService() throws Exception {
        workspaceService = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        workspaceService.createContext("/api/workspaces/" + WORKSPACE + "/membership", exchange -> {
            try {
                String caller = SignedJWT.parse(exchange.getRequestHeaders().getFirst("Authorization")
                        .substring("Bearer ".length())).getJWTClaimsSet().getSubject();
                String body = MEMBERSHIPS.get(caller);
                byte[] bytes = (body == null ? "{}" : body).getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(body == null ? 404 : 200, bytes.length);
                exchange.getResponseBody().write(bytes);
            } catch (Exception e) {
                exchange.sendResponseHeaders(500, -1);
            }
            exchange.close();
        });
        workspaceService.start();
    }

    @AfterAll
    static void stopWorkspaceService() {
        workspaceService.stop(0);
    }

    @DynamicPropertySource
    static void workspaceUrl(DynamicPropertyRegistry registry) throws Exception {
        if (workspaceService == null) {
            startWorkspaceService();
        }
        registry.add("workspace.service.url", () -> "http://127.0.0.1:" + workspaceService.getAddress().getPort());
    }

    @BeforeEach
    void clean() {
        repository.deleteAll();
    }

    @Test
    void ownerAndEditorCanEditTheSameDocumentThatTheViewerCanOnlyRead() throws Exception {
        String location = create(token("1")).andExpect(status().isCreated())
                .andReturn().getResponse().getHeader("Location");

        for (String user : new String[] {"1", "2", "3"}) {
            mvc.perform(get(location).header("Authorization", token(user)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.canEdit").value(!user.equals("3")));
        }
        edit(location, token("1")).andExpect(status().isOk());
        edit(location, token("2")).andExpect(status().isOk());
        edit(location, token("3")).andExpect(status().isForbidden());
        create(token("2")).andExpect(status().isCreated());
        create(token("3")).andExpect(status().isForbidden());
    }

    @Test
    void aNonMemberHasNoAccessToThePrivateWorkspace() throws Exception {
        String location = create(token("1")).andReturn().getResponse().getHeader("Location");

        mvc.perform(get(location).header("Authorization", token("4"))).andExpect(status().isForbidden());
        edit(location, token("4")).andExpect(status().isForbidden());
        mvc.perform(get("/api/workspaces/" + WORKSPACE + "/documents").header("Authorization", token("4")))
                .andExpect(status().isForbidden());
    }

    private ResultActions create(String token) throws Exception {
        return mvc.perform(post("/api/workspaces/" + WORKSPACE + "/documents").header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON).content(BODY));
    }

    private ResultActions edit(String location, String token) throws Exception {
        return mvc.perform(put(location).header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON).content(BODY));
    }

    private static String membership(String role, boolean edit, boolean members, boolean workspace) {
        return "{\"role\":\"%s\",\"canEdit\":%b,\"canManageMembers\":%b,\"canManageWorkspace\":%b}"
                .formatted(role, edit, members, workspace);
    }

    private String token(String userId) throws Exception {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject(userId)
                .expirationTime(Date.from(Instant.now().plusSeconds(600)))
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
        jwt.sign(new MACSigner(secret));
        return "Bearer " + jwt.serialize();
    }
}
