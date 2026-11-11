package com.example.workspace.entity;

import com.example.workspace.exception.InvalidInvitationTransitionException;
import com.example.workspace.exception.InvitationExpiredException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * An offer of membership to one user. It starts PENDING and leaves that state exactly once, through
 * {@link #accept}, {@link #decline} or {@link #revoke}; any other transition is rejected here.
 * Who may trigger a transition is decided by the service layer.
 */
@Entity
@Table(name = "workspace_invitations")
public class WorkspaceInvitation {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workspace_id", nullable = false, updatable = false)
    private Long workspaceId;

    @Column(name = "invited_user_id", nullable = false, length = 120, updatable = false)
    private String invitedUserId;

    /** The address the inviter typed, kept for display only; null when they invited by username. */
    @Column(name = "invited_email", length = 254, updatable = false)
    private String invitedEmail;

    /** EDITOR or VIEWER only; ownership cannot be granted by invitation. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10, updatable = false)
    private WorkspaceRole role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private InvitationStatus status = InvitationStatus.PENDING;

    @Column(name = "invited_by", nullable = false, length = 120, updatable = false)
    private String invitedBy;

    /**
     * True while PENDING and null afterwards. A unique constraint over (workspace, user, marker)
     * therefore allows one pending invitation and any number of closed ones, without a partial
     * index (which the H2 test database lacks).
     */
    @Column(name = "pending_marker")
    private Boolean pendingMarker = Boolean.TRUE;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected WorkspaceInvitation() {
    }

    public WorkspaceInvitation(Long workspaceId, String invitedUserId, String invitedEmail,
                               WorkspaceRole role, String invitedBy, Instant expiresAt) {
        this.workspaceId = workspaceId;
        this.invitedUserId = invitedUserId;
        this.invitedEmail = invitedEmail;
        this.role = role;
        this.invitedBy = invitedBy;
        this.expiresAt = expiresAt;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    /** An expired invitation can no longer be accepted, but it may still be declined or revoked. */
    public void accept(Instant now) {
        if (status == InvitationStatus.PENDING && !expiresAt.isAfter(now)) {
            throw new InvitationExpiredException();
        }
        transitionTo(InvitationStatus.ACCEPTED);
    }

    public void decline() {
        transitionTo(InvitationStatus.DECLINED);
    }

    public void revoke() {
        transitionTo(InvitationStatus.REVOKED);
    }

    /** True when the invitation is still PENDING and has not expired at the given instant. */
    public boolean isOpenAt(Instant now) {
        return status == InvitationStatus.PENDING && expiresAt.isAfter(now);
    }

    private void transitionTo(InvitationStatus next) {
        if (!status.canTransitionTo(next)) {
            throw new InvalidInvitationTransitionException(status, next);
        }
        status = next;
        pendingMarker = null;
    }

    public Long getId() {
        return id;
    }

    public Long getWorkspaceId() {
        return workspaceId;
    }

    public String getInvitedUserId() {
        return invitedUserId;
    }

    public String getInvitedEmail() {
        return invitedEmail;
    }

    public WorkspaceRole getRole() {
        return role;
    }

    public InvitationStatus getStatus() {
        return status;
    }

    public String getInvitedBy() {
        return invitedBy;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
