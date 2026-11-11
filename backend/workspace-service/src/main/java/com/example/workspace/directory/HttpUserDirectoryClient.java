package com.example.workspace.directory;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Component
public class HttpUserDirectoryClient implements UserDirectoryClient {
    /** The auth service accepts at most this many ids per request. */
    private static final int BATCH_SIZE = 100;

    private final RestClient http;
    private final ServiceTokenIssuer tokens;

    public HttpUserDirectoryClient(@Value("${auth.service.url}") String baseUrl, ServiceTokenIssuer tokens) {
        this.http = RestClient.builder().baseUrl(baseUrl).build();
        this.tokens = tokens;
    }

    @Override
    public Optional<DirectoryUser> findByIdentifier(String identifier, String actingUserId) {
        try {
            AuthUser user = http.get()
                    .uri("/auth/users/lookup?q={q}", identifier)
                    .header("Authorization", bearer(actingUserId))
                    .retrieve().body(AuthUser.class);
            return Optional.of(user.toDirectoryUser());
        } catch (HttpClientErrorException.NotFound e) {
            return Optional.empty();
        } catch (RestClientException e) {
            throw unavailable(e);
        }
    }

    @Override
    public Map<String, DirectoryUser> findByIds(Collection<String> userIds, String actingUserId) {
        Map<String, DirectoryUser> found = new LinkedHashMap<>();
        List<String> ids = new ArrayList<>(userIds);
        try {
            for (int from = 0; from < ids.size(); from += BATCH_SIZE) {
                List<String> batch = ids.subList(from, Math.min(from + BATCH_SIZE, ids.size()));
                AuthUser[] users = http.get()
                        .uri(uri -> uri.path("/auth/users").queryParam("ids", batch).build())
                        .header("Authorization", bearer(actingUserId))
                        .retrieve().body(AuthUser[].class);
                for (AuthUser user : users) {
                    found.put(String.valueOf(user.id()), user.toDirectoryUser());
                }
            }
            return found;
        } catch (RestClientException e) {
            throw unavailable(e);
        }
    }

    private String bearer(String userId) {
        return "Bearer " + tokens.issueFor(userId);
    }

    private static UserDirectoryUnavailableException unavailable(RestClientException cause) {
        return new UserDirectoryUnavailableException("User directory is unavailable", cause);
    }

    private record AuthUser(long id, String username) {
        DirectoryUser toDirectoryUser() {
            return new DirectoryUser(String.valueOf(id), username);
        }
    }
}
