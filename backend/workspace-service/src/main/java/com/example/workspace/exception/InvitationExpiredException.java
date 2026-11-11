package com.example.workspace.exception;

public class InvitationExpiredException extends ConflictException {
    public InvitationExpiredException() {
        super("This invitation has expired");
    }
}
