package com.example.document.service.impl;

import com.example.document.dao.DocumentDAO;
import com.example.document.dto.DocumentDTO;
import com.example.document.entity.Document;
import com.example.document.exception.ResourceNotFoundException;
import com.example.document.mapper.DocumentMapper;
import com.example.document.service.DocumentService;
import com.example.document.validator.DocumentValidator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class DocumentServiceImpl implements DocumentService {
    private final DocumentDAO dao;
    private final DocumentMapper mapper;
    private final DocumentValidator validator;

    public DocumentServiceImpl(DocumentDAO dao, DocumentMapper mapper, DocumentValidator validator) {
        this.dao = dao;
        this.mapper = mapper;
        this.validator = validator;
    }

    @Override
    @Transactional
    public DocumentDTO create(DocumentDTO dto, String authorId) {
        validator.validateCreate(dto);
        dto.setAuthorId(authorId);
        return mapper.toDTO(dao.save(mapper.toEntity(dto)));
    }

    @Override
    public List<DocumentDTO> getAll(String authorId) {
        return dao.findAllByAuthorId(authorId).stream().map(mapper::toDTO).toList();
    }

    @Override
    public DocumentDTO getById(Long id, String authorId) {
        return mapper.toDTO(findDocument(id, authorId));
    }

    @Override
    @Transactional
    public DocumentDTO update(Long id, DocumentDTO dto, String authorId) {
        Document document = findDocument(id, authorId);
        validator.validateUpdate(id, dto, document);
        mapper.updateEntity(document, dto);
        return mapper.toDTO(dao.saveAndFlush(document));
    }

    @Override
    @Transactional
    public void delete(Long id, String authorId) {
        findDocument(id, authorId);
        dao.deleteById(id);
    }

    private Document findDocument(Long id, String authorId) {
        return dao.findByIdAndAuthorId(id, authorId).orElseThrow(() ->
                new ResourceNotFoundException("Document not found: " + id));
    }
}
