package com.example.workspace.repository;

import com.example.workspace.entity.WorkspaceMember;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WorkspaceMemberRepository extends JpaRepository<WorkspaceMember, Long> {
    List<WorkspaceMember> findAllByWorkspaceId(Long workspaceId);

    List<WorkspaceMember> findAllByUserId(String userId);

    Optional<WorkspaceMember> findByWorkspaceIdAndUserId(Long workspaceId, String userId);
}
