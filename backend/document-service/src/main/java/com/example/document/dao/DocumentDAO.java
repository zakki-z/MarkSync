package com.example.document.dao;

import com.example.document.entity.Document;
import com.example.document.repository.DocumentRepository;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

@Component
public class DocumentDAO {
    private final DocumentRepository repository;

    public DocumentDAO(DocumentRepository repository) {
        this.repository = repository;
    }

    public Document save(Document document) {
        return repository.save(document);
    }

    public Document saveAndFlush(Document document) {
        return repository.saveAndFlush(document);
    }

    public List<Document> findAll() {
        return repository.findAll(Sort.by(Sort.Direction.DESC, "updatedAt"));
    }

    public Optional<Document> findById(Long id) {
        return repository.findById(id);
    }

    public boolean existsById(Long id) {
        return repository.existsById(id);
    }

    public void deleteById(Long id) {
        repository.deleteById(id);
    }
}
