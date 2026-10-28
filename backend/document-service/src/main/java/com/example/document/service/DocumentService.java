package com.example.document.service;

import com.example.document.dto.DocumentDTO;
import java.util.List;

public interface DocumentService {
    DocumentDTO create(DocumentDTO dto, String authorId);
    List<DocumentDTO> getAll(String authorId);
    DocumentDTO getById(Long id, String authorId);
    DocumentDTO update(Long id, DocumentDTO dto, String authorId);
    void delete(Long id, String authorId);
}
