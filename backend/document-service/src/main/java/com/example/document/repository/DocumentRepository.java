package com.example.document.repository;

import com.example.document.entity.Document;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.data.domain.Sort;

import java.util.List;
import java.util.Optional;

@Repository
public interface DocumentRepository extends JpaRepository<Document, Long> {
    List<Document> findAllByAuthorId(String authorId, Sort sort);
    Optional<Document> findByIdAndAuthorId(Long id, String authorId);
}
