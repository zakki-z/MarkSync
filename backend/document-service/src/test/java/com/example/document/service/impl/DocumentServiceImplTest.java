package com.example.document.service.impl;

import com.example.document.dao.DocumentDAO;
import com.example.document.dto.DocumentDTO;
import com.example.document.entity.Document;
import com.example.document.exception.BadRequestException;
import com.example.document.exception.ResourceNotFoundException;
import com.example.document.mapper.DocumentMapper;
import com.example.document.policy.DocumentAccessPolicy;
import com.example.document.validator.DocumentValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DocumentServiceImplTest {
    private static final String USER = "123";
    private static final Long WORKSPACE = 4L;

    @Mock
    private DocumentDAO dao;
    @Mock
    private DocumentMapper mapper;
    @Mock
    private DocumentValidator validator;
    @Mock
    private DocumentAccessPolicy policy;

    @InjectMocks
    private DocumentServiceImpl service;

    @Test
    void create_allowed_validatesAssignsWorkspaceAndSaves() {
        DocumentDTO input = dto(null);
        Document entity = document(null);
        Document saved = document(1L);
        DocumentDTO output = dto(1L);
        when(policy.canCreateIn(USER, WORKSPACE)).thenReturn(true);
        when(mapper.toEntity(input)).thenReturn(entity);
        when(dao.save(entity)).thenReturn(saved);
        when(mapper.toDTO(saved, true)).thenReturn(output);

        assertSame(output, service.create(WORKSPACE, input, USER));

        assertEquals(USER, input.getAuthorId());
        assertEquals(WORKSPACE, input.getWorkspaceId());
        verify(validator).validateCreate(input);
    }

    @Test
    void create_denied_doesNotValidateOrSave() {
        when(policy.canCreateIn(USER, WORKSPACE)).thenReturn(false);

        assertThrows(AccessDeniedException.class, () -> service.create(WORKSPACE, dto(null), USER));

        verifyNoInteractions(dao, mapper, validator);
    }

    @Test
    void create_invalidDocument_doesNotSave() {
        DocumentDTO input = dto(null);
        when(policy.canCreateIn(USER, WORKSPACE)).thenReturn(true);
        doThrow(new BadRequestException("Invalid document")).when(validator).validateCreate(input);

        assertThrows(BadRequestException.class, () -> service.create(WORKSPACE, input, USER));

        verifyNoInteractions(dao, mapper);
    }

    @Test
    void getAll_member_returnsMappedDocumentsWithWorkspaceEditRights() {
        Document first = document(1L);
        Document second = document(2L);
        when(policy.canListIn(USER, WORKSPACE)).thenReturn(true);
        when(policy.canCreateIn(USER, WORKSPACE)).thenReturn(false);
        when(dao.findAllByWorkspaceId(WORKSPACE)).thenReturn(List.of(first, second));
        when(mapper.toDTO(first, false)).thenReturn(dto(1L));
        when(mapper.toDTO(second, false)).thenReturn(dto(2L));

        assertEquals(List.of(dto(1L).getId(), dto(2L).getId()),
                service.getAll(WORKSPACE, USER).stream().map(DocumentDTO::getId).toList());
    }

    @Test
    void getAll_denied_doesNotQuery() {
        when(policy.canListIn(null, WORKSPACE)).thenReturn(false);

        assertThrows(AccessDeniedException.class, () -> service.getAll(WORKSPACE, null));

        verifyNoInteractions(dao, mapper);
    }

    @Test
    void getById_readable_returnsDocumentWithEditRights() {
        Document entity = document(5L);
        DocumentDTO expected = dto(5L);
        when(dao.findById(5L)).thenReturn(Optional.of(entity));
        when(policy.canRead(USER, entity)).thenReturn(true);
        when(policy.canEdit(USER, entity)).thenReturn(false);
        when(mapper.toDTO(entity, false)).thenReturn(expected);

        assertSame(expected, service.getById(5L, USER));
    }

    @Test
    void getById_notReadable_throwsAccessDenied() {
        Document entity = document(5L);
        when(dao.findById(5L)).thenReturn(Optional.of(entity));
        when(policy.canRead(null, entity)).thenReturn(false);

        assertThrows(AccessDeniedException.class, () -> service.getById(5L, null));

        verifyNoInteractions(mapper);
    }

    @Test
    void getById_missing_throwsResourceNotFound() {
        when(dao.findById(99L)).thenReturn(Optional.empty());

        ResourceNotFoundException exception =
                assertThrows(ResourceNotFoundException.class, () -> service.getById(99L, USER));

        assertEquals("Document not found: 99", exception.getMessage());
        verifyNoInteractions(policy, mapper);
    }

    @Test
    void update_editable_validatesMapsAndFlushes() {
        Document existing = document(7L);
        DocumentDTO input = dto(7L);
        DocumentDTO expected = dto(7L);
        when(dao.findById(7L)).thenReturn(Optional.of(existing));
        when(policy.canEdit(USER, existing)).thenReturn(true);
        when(dao.saveAndFlush(existing)).thenReturn(existing);
        when(mapper.toDTO(existing, true)).thenReturn(expected);

        assertSame(expected, service.update(7L, input, USER));

        verify(validator).validateUpdate(7L, input, existing);
        verify(mapper).updateEntity(existing, input);
    }

    @Test
    void update_notEditable_doesNotChangeOrSave() {
        Document existing = document(7L);
        when(dao.findById(7L)).thenReturn(Optional.of(existing));
        when(policy.canEdit(USER, existing)).thenReturn(false);

        assertThrows(AccessDeniedException.class, () -> service.update(7L, dto(7L), USER));

        verifyNoInteractions(mapper, validator);
        verify(dao, never()).saveAndFlush(any());
    }

    @Test
    void delete_editable_deletesById() {
        Document existing = document(3L);
        when(dao.findById(3L)).thenReturn(Optional.of(existing));
        when(policy.canEdit(USER, existing)).thenReturn(true);

        service.delete(3L, USER);

        verify(dao).deleteById(3L);
    }

    @Test
    void delete_notEditable_doesNotDelete() {
        Document existing = document(3L);
        when(dao.findById(3L)).thenReturn(Optional.of(existing));
        when(policy.canEdit(USER, existing)).thenReturn(false);

        assertThrows(AccessDeniedException.class, () -> service.delete(3L, USER));

        verify(dao, never()).deleteById(any());
    }

    private static DocumentDTO dto(Long id) {
        return DocumentDTO.builder().id(id).title("Title").authorId(USER).markdown("# Text").build();
    }

    private static Document document(Long id) {
        return Document.builder().id(id).title("Title").authorId(USER).workspaceId(WORKSPACE).markdown("# Text").build();
    }
}
