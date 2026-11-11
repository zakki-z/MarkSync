package com.example.document.validator;

import com.example.document.dto.DocumentDTO;
import com.example.document.entity.Document;
import com.example.document.exception.BadRequestException;
import org.springframework.stereotype.Component;

@Component
public class DocumentValidator {
    public void validateCreate(DocumentDTO dto) {
        if (dto.getId() != null || dto.getCreatedAt() != null || dto.getUpdatedAt() != null) {
            throw new BadRequestException("Document identifiers and timestamps are assigned by the server");
        }
    }

    public void validateUpdate(Long id, DocumentDTO dto, Document current) {
        if (dto.getId() != null && !id.equals(dto.getId())) {
            throw new BadRequestException("Document ID in body must match URL");
        }
        if (dto.getWorkspaceId() != null && !current.getWorkspaceId().equals(dto.getWorkspaceId())) {
            throw new BadRequestException("Document cannot be moved to another workspace");
        }
        if (dto.getAuthorId() != null && !current.getAuthorId().equals(dto.getAuthorId().trim())) {
            throw new BadRequestException("Document author cannot be changed");
        }
    }
}
