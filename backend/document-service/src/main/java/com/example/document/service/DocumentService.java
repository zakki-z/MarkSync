package com.example.document.service;

import com.example.document.dto.DocumentDTO;
import java.util.List;

/** Every method takes the caller's user id, or null for an anonymous visitor. */
public interface DocumentService {
    DocumentDTO create(Long workspaceId, DocumentDTO dto, String userId);
    List<DocumentDTO> getAll(Long workspaceId, String userId);
    DocumentDTO getById(Long id, String userId);
    DocumentDTO update(Long id, DocumentDTO dto, String userId);
    void delete(Long id, String userId);
}
