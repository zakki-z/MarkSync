package com.example.workspace.directory;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Talks to a throwaway HTTP server that behaves like the auth service. */
class HttpUserDirectoryClientTest {
    private HttpServer server;
    private HttpUserDirectoryClient client;
    private final List<String> requests = new ArrayList<>();
    private final List<String> authorizations = new ArrayList<>();

    @BeforeEach
    void startAuthService() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/auth/users/lookup", exchange -> {
            record(exchange);
            boolean known = exchange.getRequestURI().getRawQuery().startsWith("q=dana%2Btag");
            respond(exchange, known ? 200 : 404, known ? "{\"id\":4,\"username\":\"dana\"}" : "{\"detail\":\"User not found\"}");
        });
        server.createContext("/auth/users", exchange -> {
            record(exchange);
            String query = exchange.getRequestURI().getRawQuery();
            respond(exchange, query.contains("boom") ? 500 : 200,
                    query.contains("ids=4") ? "[{\"id\":4,\"username\":\"dana\"}]" : "[]");
        });
        server.start();
        client = new HttpUserDirectoryClient("http://127.0.0.1:" + server.getAddress().getPort(),
                new ServiceTokenIssuer("a-secret-of-at-least-thirty-two-chars"));
    }

    @AfterEach
    void stopAuthService() {
        server.stop(0);
    }

    @Test
    void findsAUserByIdentifierAsTheActingUser() {
        assertThat(client.findByIdentifier("dana+tag@example.com", "1")).contains(new DirectoryUser("4", "dana"));

        // The plus sign must be percent-encoded or the auth service would read it as a space.
        assertThat(requests.getFirst()).startsWith("/auth/users/lookup?q=dana%2Btag");
        assertThat(authorizations.getFirst()).startsWith("Bearer ey");
    }

    @Test
    void anUnknownIdentifierIsEmpty() {
        assertThat(client.findByIdentifier("nobody", "1")).isEmpty();
    }

    @Test
    void resolvesIdsInBatchesOfAtMostOneHundred() {
        List<String> ids = new ArrayList<>(List.of("4"));
        for (int i = 100; i < 250; i++) {
            ids.add(String.valueOf(i));
        }

        Map<String, DirectoryUser> found = client.findByIds(ids, "1");

        assertThat(found).containsOnlyKeys("4");
        assertThat(requests).hasSize(2);
        assertThat(requests.getFirst()).startsWith("/auth/users?ids=4&ids=100");
    }

    @Test
    void anOutageIsReportedAsUnavailable() {
        server.stop(0);

        assertThatThrownBy(() -> client.findByIdentifier("dana", "1"))
                .isInstanceOf(UserDirectoryUnavailableException.class);
        assertThatThrownBy(() -> client.findByIds(List.of("4"), "1"))
                .isInstanceOf(UserDirectoryUnavailableException.class);
    }

    private void record(com.sun.net.httpserver.HttpExchange exchange) {
        requests.add(exchange.getRequestURI().getRawPath() + "?" + exchange.getRequestURI().getRawQuery());
        authorizations.add(exchange.getRequestHeaders().getFirst("Authorization"));
    }

    private static void respond(com.sun.net.httpserver.HttpExchange exchange, int status, String body) throws java.io.IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
