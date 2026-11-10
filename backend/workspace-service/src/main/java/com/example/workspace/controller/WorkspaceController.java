package com.example.workspace.controller;

import com.example.workspace.dto.CreateWorkspaceRequest;
import com.example.workspace.dto.UpdateWorkspaceRequest;
import com.example.workspace.dto.WorkspaceResponse;
import com.example.workspace.service.WorkspaceService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/workspaces")
public class WorkspaceController {
    private final WorkspaceService service;

    public WorkspaceController(WorkspaceService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<WorkspaceResponse> create(@Valid @RequestBody CreateWorkspaceRequest request,
                                                    @AuthenticationPrincipal Jwt jwt) {
        WorkspaceResponse created = service.create(request, jwt.getSubject());
        return ResponseEntity.created(URI.create("/api/workspaces/" + created.id())).body(created);
    }

    @GetMapping
    public List<WorkspaceResponse> list(@AuthenticationPrincipal Jwt jwt) {
        return service.list(jwt.getSubject());
    }

    @GetMapping("/{id}")
    public WorkspaceResponse get(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return service.get(id, jwt.getSubject());
    }

    @PatchMapping("/{id}")
    public WorkspaceResponse update(@PathVariable Long id, @Valid @RequestBody UpdateWorkspaceRequest request,
                                    @AuthenticationPrincipal Jwt jwt) {
        return service.update(id, request, jwt.getSubject());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        service.delete(id, jwt.getSubject());
        return ResponseEntity.noContent().build();
    }
}
