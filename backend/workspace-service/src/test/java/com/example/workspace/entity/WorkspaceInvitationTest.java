package com.example.workspace.entity;

import com.example.workspace.exception.InvalidInvitationTransitionException;
import com.example.workspace.exception.InvitationExpiredException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorkspaceInvitationTest {
    private static final Instant NOW = Instant.parse("2026-01-10T12:00:00Z");

    private static WorkspaceInvitation pending() {
        return new WorkspaceInvitation(1L, "2", null, WorkspaceRole.EDITOR, "1", NOW.plus(7, ChronoUnit.DAYS));
    }

    @Test
    void startsPending() {
        assertThat(pending().getStatus()).isEqualTo(InvitationStatus.PENDING);
        assertThat(pending().isOpenAt(NOW)).isTrue();
    }

    @Test
    void aPendingInvitationCanBeAccepted() {
        WorkspaceInvitation invitation = pending();
        invitation.accept(NOW);
        assertThat(invitation.getStatus()).isEqualTo(InvitationStatus.ACCEPTED);
        assertThat(invitation.isOpenAt(NOW)).isFalse();
    }

    @Test
    void aPendingInvitationCanBeDeclined() {
        WorkspaceInvitation invitation = pending();
        invitation.decline();
        assertThat(invitation.getStatus()).isEqualTo(InvitationStatus.DECLINED);
    }

    @Test
    void aPendingInvitationCanBeRevoked() {
        WorkspaceInvitation invitation = pending();
        invitation.revoke();
        assertThat(invitation.getStatus()).isEqualTo(InvitationStatus.REVOKED);
    }

    @ParameterizedTest
    @EnumSource(value = InvitationStatus.class, names = {"ACCEPTED", "DECLINED", "REVOKED"})
    void aClosedInvitationCannotBeAcceptedDeclinedOrRevoked(InvitationStatus closed) {
        for (Consumer<WorkspaceInvitation> action : java.util.List.<Consumer<WorkspaceInvitation>>of(
                i -> i.accept(NOW), WorkspaceInvitation::decline, WorkspaceInvitation::revoke)) {
            WorkspaceInvitation invitation = pending();
            close(invitation, closed);

            assertThatThrownBy(() -> action.accept(invitation))
                    .isInstanceOf(InvalidInvitationTransitionException.class)
                    .hasMessageContaining(closed.name());
            assertThat(invitation.getStatus()).isEqualTo(closed);
        }
    }

    @Test
    void anExpiredInvitationCannotBeAccepted() {
        WorkspaceInvitation invitation = pending();

        assertThatThrownBy(() -> invitation.accept(NOW.plus(7, ChronoUnit.DAYS)))
                .isInstanceOf(InvitationExpiredException.class);
        assertThat(invitation.getStatus()).isEqualTo(InvitationStatus.PENDING);
        assertThat(invitation.isOpenAt(NOW.plus(7, ChronoUnit.DAYS))).isFalse();
    }

    @Test
    void anExpiredInvitationCanStillBeDeclinedOrRevoked() {
        WorkspaceInvitation declined = pending();
        declined.decline();
        WorkspaceInvitation revoked = pending();
        revoked.revoke();

        assertThat(declined.getStatus()).isEqualTo(InvitationStatus.DECLINED);
        assertThat(revoked.getStatus()).isEqualTo(InvitationStatus.REVOKED);
    }

    @Test
    void onlyPendingMayTransition() {
        for (InvitationStatus from : InvitationStatus.values()) {
            for (InvitationStatus to : InvitationStatus.values()) {
                assertThat(from.canTransitionTo(to))
                        .as("%s -> %s", from, to)
                        .isEqualTo(from == InvitationStatus.PENDING && to != InvitationStatus.PENDING);
            }
        }
    }

    private static void close(WorkspaceInvitation invitation, InvitationStatus status) {
        switch (status) {
            case ACCEPTED -> invitation.accept(NOW);
            case DECLINED -> invitation.decline();
            case REVOKED -> invitation.revoke();
            default -> throw new IllegalArgumentException(status.name());
        }
    }
}
