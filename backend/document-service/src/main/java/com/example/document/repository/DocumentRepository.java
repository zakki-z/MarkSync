package com.example.document.repository;

import com.example.document.entity.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DocumentRepository extends JpaRepository<Document, Long> {
    List<Document> findAllByWorkspaceId(Long workspaceId, Sort sort);
}
