package com.example.document.workspace;

import com.example.document.exception.WorkspaceServiceUnavailableException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Component
public class HttpWorkspaceClient implements WorkspaceClient {
    static final String PERSONAL_WORKSPACE_NAME = "Personal";

    private final RestClient http;
    private final ServiceTokenIssuer tokens;

    public HttpWorkspaceClient(@Value("${workspace.service.url}") String baseUrl, ServiceTokenIssuer tokens) {
        this.http = RestClient.builder().baseUrl(baseUrl).build();
        this.tokens = tokens;
    }

    @Override
    public Long findOrCreatePersonalWorkspace(String ownerId) {
        try {
            String bearer = "Bearer " + tokens.issueFor(ownerId);
            List<WorkspaceSummary> owned = http.get().uri("/api/workspaces")
                    .header("Authorization", bearer)
                    .retrieve().body(new ParameterizedTypeReference<>() {});
            return owned.stream()
                    .filter(w -> ownerId.equals(w.ownerId()) && PERSONAL_WORKSPACE_NAME.equals(w.name()))
                    .map(WorkspaceSummary::id)
                    .findFirst()
                    .orElseGet(() -> http.post().uri("/api/workspaces")
                            .header("Authorization", bearer)
                            .body(Map.of("name", PERSONAL_WORKSPACE_NAME))
                            .retrieve().body(WorkspaceSummary.class).id());
        } catch (RestClientException e) {
            throw new WorkspaceServiceUnavailableException("Workspace service is unavailable", e);
        }
    }

    @Override
    public Optional<WorkspaceRole> roleOf(String userId, Long workspaceId) {
        try {
            Membership membership = http.get().uri("/api/workspaces/{id}/membership", workspaceId)
                    .header("Authorization", "Bearer " + tokens.issueFor(userId))
                    .retrieve().body(Membership.class);
            return Optional.of(membership.role());
        } catch (HttpClientErrorException.NotFound e) {
            return Optional.empty();
        } catch (RestClientException e) {
            throw new WorkspaceServiceUnavailableException("Workspace service is unavailable", e);
        }
    }

    private record Membership(WorkspaceRole role) {
    }

    private record WorkspaceSummary(Long id, String name, String ownerId) {
    }
}
