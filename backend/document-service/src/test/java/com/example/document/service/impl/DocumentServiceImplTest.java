package com.example.document.service.impl;

import com.example.document.dao.DocumentDAO;
import com.example.document.dto.DocumentDTO;
import com.example.document.entity.Document;
import com.example.document.exception.BadRequestException;
import com.example.document.exception.ResourceNotFoundException;
import com.example.document.mapper.DocumentMapper;
import com.example.document.validator.DocumentValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.InOrder;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DocumentServiceImplTest {

    @Mock
    private DocumentDAO dao;

    @Mock
    private DocumentMapper mapper;

    @Mock
    private DocumentValidator validator;

    @InjectMocks
    private DocumentServiceImpl service;

    @Test
    void create_validDocument_validatesMapsAndSaves() {
        DocumentDTO input = dto(null, "First document");
        Document entity = document(null, "First document");
        Document saved = document(1L, "First document");
        DocumentDTO output = dto(1L, "First document");

        when(mapper.toEntity(input)).thenReturn(entity);
        when(dao.save(entity)).thenReturn(saved);
        when(mapper.toDTO(saved)).thenReturn(output);

        DocumentDTO result = service.create(input);

        assertSame(output, result);
        verify(validator).validateCreate(input);
        verify(mapper).toEntity(input);
        verify(dao).save(entity);
        verify(mapper).toDTO(saved);
    }

    @Test
    void create_invalidDocument_doesNotSave() {
        DocumentDTO input = dto(null, "Invalid document");
        doThrow(new BadRequestException("Invalid document"))
                .when(validator).validateCreate(input);

        assertThrows(BadRequestException.class, () -> service.create(input));

        verifyNoInteractions(dao, mapper);
    }

    @Test
    void getAll_returnsMappedDocuments() {
        Document first = document(1L, "First");
        Document second = document(2L, "Second");
        DocumentDTO firstDto = dto(1L, "First");
        DocumentDTO secondDto = dto(2L, "Second");

        when(dao.findAll()).thenReturn(List.of(first, second));
        when(mapper.toDTO(first)).thenReturn(firstDto);
        when(mapper.toDTO(second)).thenReturn(secondDto);

        List<DocumentDTO> result = service.getAll();

        assertEquals(List.of(firstDto, secondDto), result);
        verify(dao).findAll();
        verify(mapper).toDTO(first);
        verify(mapper).toDTO(second);
    }

    @Test
    void getAll_noDocuments_returnsEmptyList() {
        when(dao.findAll()).thenReturn(List.of());

        List<DocumentDTO> result = service.getAll();

        assertTrue(result.isEmpty());
        verifyNoInteractions(mapper, validator);
    }

    @Test
    void getById_existingDocument_returnsMappedDocument() {
        Document entity = document(5L, "Existing");
        DocumentDTO expected = dto(5L, "Existing");
        when(dao.findById(5L)).thenReturn(Optional.of(entity));
        when(mapper.toDTO(entity)).thenReturn(expected);

        DocumentDTO result = service.getById(5L);

        assertSame(expected, result);
        verify(dao).findById(5L);
        verify(mapper).toDTO(entity);
    }

    @Test
    void getById_missingDocument_throwsResourceNotFound() {
        when(dao.findById(99L)).thenReturn(Optional.empty());

        ResourceNotFoundException exception = assertThrows(
                ResourceNotFoundException.class,
                () -> service.getById(99L)
        );

        assertEquals("Document not found: 99", exception.getMessage());
        verifyNoInteractions(mapper, validator);
    }

    @Test
    void update_existingDocument_validatesMapsAndFlushes() {
        Long id = 7L;
        DocumentDTO input = dto(id, "Updated");
        Document existing = document(id, "Original");
        DocumentDTO expected = dto(id, "Updated");

        when(dao.findById(id)).thenReturn(Optional.of(existing));
        when(dao.saveAndFlush(existing)).thenReturn(existing);
        when(mapper.toDTO(existing)).thenReturn(expected);

        DocumentDTO result = service.update(id, input);

        assertSame(expected, result);
        InOrder order = inOrder(validator, mapper, dao);
        order.verify(validator).validateUpdate(id, input, existing);
        order.verify(mapper).updateEntity(existing, input);
        order.verify(dao).saveAndFlush(existing);
        verify(mapper).toDTO(existing);
    }

    @Test
    void update_missingDocument_throwsResourceNotFound() {
        DocumentDTO input = dto(99L, "Updated");
        when(dao.findById(99L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> service.update(99L, input));

        verify(dao, never()).saveAndFlush(org.mockito.ArgumentMatchers.any());
        verifyNoInteractions(mapper, validator);
    }

    @Test
    void update_invalidDocument_doesNotChangeOrSave() {
        Long id = 8L;
        Document existing = document(id, "Original");
        DocumentDTO input = dto(9L, "Invalid update");
        when(dao.findById(id)).thenReturn(Optional.of(existing));
        doThrow(new BadRequestException("Document ID in body must match URL"))
                .when(validator).validateUpdate(id, input, existing);

        assertThrows(BadRequestException.class, () -> service.update(id, input));

        verifyNoInteractions(mapper);
        verify(dao, never()).saveAndFlush(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void delete_existingDocument_deletesById() {
        when(dao.existsById(3L)).thenReturn(true);

        service.delete(3L);

        verify(dao).existsById(3L);
        verify(dao).deleteById(3L);
        verifyNoInteractions(mapper, validator);
    }

    @Test
    void delete_missingDocument_throwsWithoutDeleting() {
        when(dao.existsById(99L)).thenReturn(false);

        ResourceNotFoundException exception = assertThrows(
                ResourceNotFoundException.class,
                () -> service.delete(99L)
        );

        assertEquals("Document not found: 99", exception.getMessage());
        verify(dao, never()).deleteById(99L);
    }

    private static DocumentDTO dto(Long id, String title) {
        return DocumentDTO.builder()
                .id(id)
                .title(title)
                .authorId("user-123")
                .markdown("# Sample content")
                .build();
    }

    private static Document document(Long id, String title) {
        return Document.builder()
                .id(id)
                .title(title)
                .authorId("user-123")
                .markdown("# Sample content")
                .build();
    }
}
