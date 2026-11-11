package com.example.workspace.support;

import com.example.workspace.directory.DirectoryUser;
import com.example.workspace.directory.UserDirectoryClient;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** In-memory auth service: users 1 olivia, 2 eli, 3 vera, 4 dana (dana@example.com), 5 omar. */
public class FakeUserDirectory implements UserDirectoryClient {
    private final Map<String, DirectoryUser> byId = new LinkedHashMap<>();

    public FakeUserDirectory() {
        for (String[] user : new String[][] {{"1", "olivia"}, {"2", "eli"}, {"3", "vera"}, {"4", "dana"}, {"5", "omar"}}) {
            byId.put(user[0], new DirectoryUser(user[0], user[1]));
        }
    }

    @Override
    public Optional<DirectoryUser> findByIdentifier(String identifier, String actingUserId) {
        String query = identifier.toLowerCase();
        if (query.equals("dana@example.com")) {
            return Optional.of(byId.get("4"));
        }
        return byId.values().stream().filter(user -> user.username().equals(query)).findFirst();
    }

    @Override
    public Map<String, DirectoryUser> findByIds(Collection<String> userIds, String actingUserId) {
        Map<String, DirectoryUser> found = new LinkedHashMap<>();
        userIds.stream().filter(byId::containsKey).forEach(id -> found.put(id, byId.get(id)));
        return found;
    }

    @TestConfiguration
    public static class Config {
        @Bean
        @Primary
        UserDirectoryClient fakeUserDirectory() {
            return new FakeUserDirectory();
        }
    }
}
