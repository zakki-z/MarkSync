package com.example.workspace.directory;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;

/**
 * Port to the auth service, which owns users. Only ids are stored here; names are looked up when
 * needed. Calls act on behalf of the signed-in user because the auth service requires a token.
 */
public interface UserDirectoryClient {
    /** Finds the one account whose username or email exactly matches the identifier. */
    Optional<DirectoryUser> findByIdentifier(String identifier, String actingUserId);

    /** Resolves user ids to accounts; ids that no longer exist are absent from the result. */
    Map<String, DirectoryUser> findByIds(Collection<String> userIds, String actingUserId);
}
