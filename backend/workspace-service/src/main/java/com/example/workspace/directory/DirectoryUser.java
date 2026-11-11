package com.example.workspace.directory;

/** The minimal view of an account that the auth service shares: never an email or other profile data. */
public record DirectoryUser(String id, String username) {
}
