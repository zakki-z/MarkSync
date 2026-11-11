'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { DocumentDTO } from '@/src/documentService';
import { PinButton } from '@/src/components/PinButton';
import { prettyDate } from '@/src/format';
import { MAX_PINS, usePins } from '@/src/hooks/usePins';

export function DocumentList({
  workspaceId,
  userId,
  documents,
}: {
  workspaceId: number;
  userId: number;
  documents: DocumentDTO[];
}) {
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const pins = usePins(`marksync:pins:documents:${userId}:${workspaceId}`);
  const filtered = useMemo(
    () =>
      documents
        .filter((doc) => doc.title.toLowerCase().includes(search.trim().toLowerCase()))
        // Array.sort is stable, so pinned documents keep the API's recency order among themselves.
        .sort((a, b) => Number(pins.isPinned(b.id)) - Number(pins.isPinned(a.id))),
    [documents, search, pins],
  );

  const togglePin = (id: number) =>
    setNotice(pins.toggle(id) ? '' : `You can pin up to ${MAX_PINS} documents. Unpin one first.`);

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
      {notice && (
        <div className="alert error" role="alert">
          {notice}
        </div>
      )}
      <div className="document-list" aria-label="Documents">
        {!filtered.length && (
          <p className="no-documents">
            {search ? 'No matching documents.' : 'No documents yet. Create your first one.'}
          </p>
        )}
        {filtered.map((doc) => (
          <div key={doc.id} className="document-row">
            <Link href={`/w/${workspaceId}/d/${doc.id}`} className="document-item">
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
            <PinButton
              label={doc.title}
              pinned={pins.isPinned(doc.id)}
              onClick={() => togglePin(doc.id)}
            />
          </div>
        ))}
      </div>
    </>
  );
}
