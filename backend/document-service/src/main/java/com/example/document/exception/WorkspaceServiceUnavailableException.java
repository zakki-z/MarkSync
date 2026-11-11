package com.example.document.exception;

public class WorkspaceServiceUnavailableException extends RuntimeException {
    public WorkspaceServiceUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
