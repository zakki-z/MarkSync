package com.example.document.controller;

import com.example.document.dto.DocumentDTO;
import com.example.document.service.DocumentService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api")
public class DocumentController {
    private final DocumentService service;

    public DocumentController(DocumentService service) {
        this.service = service;
    }

    @PostMapping("/workspaces/{workspaceId}/documents")
    public ResponseEntity<DocumentDTO> create(@PathVariable Long workspaceId, @Valid @RequestBody DocumentDTO dto,
                                              @AuthenticationPrincipal Jwt jwt) {
        DocumentDTO created = service.create(workspaceId, dto, jwt.getSubject());
        return ResponseEntity.created(URI.create("/api/documents/" + created.getId())).body(created);
    }

    @GetMapping("/workspaces/{workspaceId}/documents")
    public ResponseEntity<List<DocumentDTO>> getAll(@PathVariable Long workspaceId, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(service.getAll(workspaceId, jwt.getSubject()));
    }

    @GetMapping("/documents/{id}")
    public ResponseEntity<DocumentDTO> getById(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        // The read endpoint is public, so the caller may be anonymous (no JWT).
        return ResponseEntity.ok(service.getById(id, jwt == null ? null : jwt.getSubject()));
    }

    @PutMapping("/documents/{id}")
    public ResponseEntity<DocumentDTO> update(@PathVariable Long id, @Valid @RequestBody DocumentDTO dto, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(service.update(id, dto, jwt.getSubject()));
    }

    @DeleteMapping("/documents/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        service.delete(id, jwt.getSubject());
        return ResponseEntity.noContent().build();
    }
}
