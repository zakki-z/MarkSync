ALTER TABLE documents ADD COLUMN visibility VARCHAR(10) NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE documents ADD CONSTRAINT ck_documents_visibility CHECK (visibility IN ('PRIVATE', 'PUBLIC'));
