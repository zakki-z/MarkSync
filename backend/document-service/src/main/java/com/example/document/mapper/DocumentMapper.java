package com.example.document.mapper;

import com.example.document.dto.DocumentDTO;
import com.example.document.entity.Document;
import com.example.document.entity.DocumentVisibility;
import org.springframework.stereotype.Component;

@Component
public class DocumentMapper {
    public Document toEntity(DocumentDTO dto) {
        return Document.builder()
                .title(dto.getTitle().trim())
                .authorId(dto.getAuthorId().trim())
                .workspaceId(dto.getWorkspaceId())
                .visibility(dto.getVisibility() != null ? dto.getVisibility() : DocumentVisibility.PRIVATE)
                .markdown(dto.getMarkdown())
                .build();
    }

    public DocumentDTO toDTO(Document document) {
        return DocumentDTO.builder()
                .id(document.getId())
                .title(document.getTitle())
                .authorId(document.getAuthorId())
                .workspaceId(document.getWorkspaceId())
                .visibility(document.getVisibility())
                .markdown(document.getMarkdown())
                .createdAt(document.getCreatedAt())
                .updatedAt(document.getUpdatedAt())
                .build();
    }

    public void updateEntity(Document document, DocumentDTO dto) {
        document.setTitle(dto.getTitle().trim());
        document.setMarkdown(dto.getMarkdown());
        if (dto.getVisibility() != null) {
            document.setVisibility(dto.getVisibility());
        }
    }
}
