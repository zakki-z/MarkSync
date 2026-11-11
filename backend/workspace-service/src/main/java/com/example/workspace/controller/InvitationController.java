package com.example.workspace.controller;

import com.example.workspace.dto.InvitationResponse;
import com.example.workspace.dto.SendInvitationRequest;
import com.example.workspace.service.InvitationService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class InvitationController {
    private final InvitationService service;

    public InvitationController(InvitationService service) {
        this.service = service;
    }

    @PostMapping("/api/workspaces/{workspaceId}/invitations")
    public ResponseEntity<InvitationResponse> send(@PathVariable Long workspaceId,
                                                   @Valid @RequestBody SendInvitationRequest request,
                                                   @AuthenticationPrincipal Jwt jwt) {
        InvitationResponse sent = service.send(workspaceId, request, jwt.getSubject());
        return ResponseEntity.status(201).body(sent);
    }

    @GetMapping("/api/workspaces/{workspaceId}/invitations")
    public List<InvitationResponse> listForWorkspace(@PathVariable Long workspaceId,
                                                     @AuthenticationPrincipal Jwt jwt) {
        return service.listForWorkspace(workspaceId, jwt.getSubject());
    }

    @DeleteMapping("/api/workspaces/{workspaceId}/invitations/{invitationId}")
    public ResponseEntity<Void> revoke(@PathVariable Long workspaceId, @PathVariable Long invitationId,
                                       @AuthenticationPrincipal Jwt jwt) {
        service.revoke(workspaceId, invitationId, jwt.getSubject());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/invitations")
    public List<InvitationResponse> listMine(@AuthenticationPrincipal Jwt jwt) {
        return service.listMine(jwt.getSubject());
    }

    @PostMapping("/api/invitations/{invitationId}/accept")
    public InvitationResponse accept(@PathVariable Long invitationId, @AuthenticationPrincipal Jwt jwt) {
        return service.accept(invitationId, jwt.getSubject());
    }

    @PostMapping("/api/invitations/{invitationId}/decline")
    public InvitationResponse decline(@PathVariable Long invitationId, @AuthenticationPrincipal Jwt jwt) {
        return service.decline(invitationId, jwt.getSubject());
    }
}
