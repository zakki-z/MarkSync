package com.example.document.policy;

import com.example.document.entity.Document;

/**
 * The single source of truth for who may do what with documents. Every user id may be null, which
 * stands for an anonymous visitor. Callers must not duplicate these rules.
 */
public interface DocumentAccessPolicy {
    boolean canRead(String userId, Document document);

    boolean canEdit(String userId, Document document);

    boolean canListIn(String userId, Long workspaceId);

    boolean canCreateIn(String userId, Long workspaceId);
}
