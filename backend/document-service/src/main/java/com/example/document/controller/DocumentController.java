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
@RequestMapping("/api/documents")
public class DocumentController {
    private final DocumentService service;

    public DocumentController(DocumentService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<DocumentDTO> create(@Valid @RequestBody DocumentDTO dto, @AuthenticationPrincipal Jwt jwt) {
        DocumentDTO created = service.create(dto, jwt.getSubject());
        return ResponseEntity.created(URI.create("/api/documents/" + created.getId())).body(created);
    }

    @GetMapping
    public ResponseEntity<List<DocumentDTO>> getAll(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(service.getAll(jwt.getSubject()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<DocumentDTO> getById(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(service.getById(id, jwt.getSubject()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<DocumentDTO> update(@PathVariable Long id, @Valid @RequestBody DocumentDTO dto, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(service.update(id, dto, jwt.getSubject()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        service.delete(id, jwt.getSubject());
        return ResponseEntity.noContent().build();
    }
}
