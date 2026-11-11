'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { DocumentDTO } from '@/src/documentService';
import { prettyDate } from '@/src/format';

export function DocumentList({
  workspaceId,
  documents,
}: {
  workspaceId: number;
  documents: DocumentDTO[];
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () => documents.filter((doc) => doc.title.toLowerCase().includes(search.trim().toLowerCase())),
    [documents, search],
  );

  return (
    <>
      <label className="search-label" htmlFor="document-search">
        Documents <span>{documents.length}</span>
      </label>
      <input
        id="document-search"
        className="search-input"
        placeholder="Search documents…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="document-list" aria-label="Documents">
        {!filtered.length && (
          <p className="no-documents">
            {search ? 'No matching documents.' : 'No documents yet. Create your first one.'}
          </p>
        )}
        {filtered.map((doc) => (
          <Link key={doc.id} href={`/w/${workspaceId}/d/${doc.id}`} className="document-item">
            <span className="document-icon" aria-hidden="true">
              ▤
            </span>
            <span className="document-info">
              <strong>{doc.title}</strong>
              <small>
                {prettyDate(doc.updatedAt || doc.createdAt)}
                {doc.visibility === 'PUBLIC' ? ' · Public' : ''}
              </small>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
