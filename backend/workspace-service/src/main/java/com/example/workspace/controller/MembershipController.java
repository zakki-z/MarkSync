package com.example.workspace.controller;

import com.example.workspace.dto.ChangeRoleRequest;
import com.example.workspace.dto.MemberResponse;
import com.example.workspace.service.MembershipService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/workspaces/{workspaceId}")
public class MembershipController {
    private final MembershipService service;

    public MembershipController(MembershipService service) {
        this.service = service;
    }

    @GetMapping("/members")
    public List<MemberResponse> list(@PathVariable Long workspaceId, @AuthenticationPrincipal Jwt jwt) {
        return service.list(workspaceId, jwt.getSubject());
    }

    @PatchMapping("/members/{userId}")
    public MemberResponse changeRole(@PathVariable Long workspaceId, @PathVariable String userId,
                                     @Valid @RequestBody ChangeRoleRequest request,
                                     @AuthenticationPrincipal Jwt jwt) {
        return service.changeRole(workspaceId, userId, request, jwt.getSubject());
    }

    @DeleteMapping("/members/{userId}")
    public ResponseEntity<Void> remove(@PathVariable Long workspaceId, @PathVariable String userId,
                                       @AuthenticationPrincipal Jwt jwt) {
        service.remove(workspaceId, userId, jwt.getSubject());
        return ResponseEntity.noContent().build();
    }

    /** The caller leaves the workspace. */
    @DeleteMapping("/membership")
    public ResponseEntity<Void> leave(@PathVariable Long workspaceId, @AuthenticationPrincipal Jwt jwt) {
        service.leave(workspaceId, jwt.getSubject());
        return ResponseEntity.noContent().build();
    }
}
