package com.example.workspace.exception;

import com.example.workspace.entity.InvitationStatus;

public class InvalidInvitationTransitionException extends ConflictException {
    public InvalidInvitationTransitionException(InvitationStatus from, InvitationStatus to) {
        super("An invitation that is " + from + " cannot become " + to);
    }
}
