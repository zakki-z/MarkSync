package com.example.workspace.entity;

/** PENDING is the only open state; the other three are final. */
public enum InvitationStatus {
    PENDING,
    ACCEPTED,
    DECLINED,
    REVOKED;

    public boolean canTransitionTo(InvitationStatus next) {
        return this == PENDING && next != PENDING;
    }
}
