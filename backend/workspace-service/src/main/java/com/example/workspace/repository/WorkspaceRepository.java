package com.example.workspace.repository;

import com.example.workspace.entity.Workspace;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.util.Optional;

public interface WorkspaceRepository extends JpaRepository<Workspace, Long> {
    /** Serializes membership changes in one workspace so the last-owner rule cannot be raced. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Workspace> findWithLockById(Long id);
}
