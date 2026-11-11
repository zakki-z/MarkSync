package com.example.document.service.impl;

import com.example.document.dao.DocumentDAO;
import com.example.document.dto.DocumentDTO;
import com.example.document.entity.Document;
import com.example.document.exception.ResourceNotFoundException;
import com.example.document.mapper.DocumentMapper;
import com.example.document.policy.DocumentAccessPolicy;
import com.example.document.service.DocumentService;
import com.example.document.validator.DocumentValidator;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class DocumentServiceImpl implements DocumentService {
    private final DocumentDAO dao;
    private final DocumentMapper mapper;
    private final DocumentValidator validator;
    private final DocumentAccessPolicy policy;

    public DocumentServiceImpl(DocumentDAO dao, DocumentMapper mapper, DocumentValidator validator,
                               DocumentAccessPolicy policy) {
        this.dao = dao;
        this.mapper = mapper;
        this.validator = validator;
        this.policy = policy;
    }

    @Override
    @Transactional
    public DocumentDTO create(Long workspaceId, DocumentDTO dto, String userId) {
        requireAccess(policy.canCreateIn(userId, workspaceId));
        validator.validateCreate(dto);
        dto.setAuthorId(userId);
        dto.setWorkspaceId(workspaceId);
        return mapper.toDTO(dao.save(mapper.toEntity(dto)), true);
    }

    @Override
    public List<DocumentDTO> getAll(Long workspaceId, String userId) {
        requireAccess(policy.canListIn(userId, workspaceId));
        // Edit rights come from the workspace role, so they are the same for every document in it.
        boolean canEdit = policy.canCreateIn(userId, workspaceId);
        return dao.findAllByWorkspaceId(workspaceId).stream().map(document -> mapper.toDTO(document, canEdit)).toList();
    }

    @Override
    public DocumentDTO getById(Long id, String userId) {
        Document document = findDocument(id);
        requireAccess(policy.canRead(userId, document));
        return mapper.toDTO(document, policy.canEdit(userId, document));
    }

    @Override
    @Transactional
    public DocumentDTO update(Long id, DocumentDTO dto, String userId) {
        Document document = findDocument(id);
        requireAccess(policy.canEdit(userId, document));
        validator.validateUpdate(id, dto, document);
        mapper.updateEntity(document, dto);
        return mapper.toDTO(dao.saveAndFlush(document), true);
    }

    @Override
    @Transactional
    public void delete(Long id, String userId) {
        requireAccess(policy.canEdit(userId, findDocument(id)));
        dao.deleteById(id);
    }

    private Document findDocument(Long id) {
        return dao.findById(id).orElseThrow(() -> new ResourceNotFoundException("Document not found: " + id));
    }

    /** Spring Security turns this into 401 for anonymous callers and 403 for authenticated ones. */
    private void requireAccess(boolean allowed) {
        if (!allowed) {
            throw new AccessDeniedException("Access denied");
        }
    }
}
