package com.example.document.service;

import com.example.document.dto.DocumentDTO;
import java.util.List;

public interface DocumentService {
    DocumentDTO create(DocumentDTO dto);
    List<DocumentDTO> getAll();
    DocumentDTO getById(Long id);
    DocumentDTO update(Long id, DocumentDTO dto);
    void delete(Long id);
}
