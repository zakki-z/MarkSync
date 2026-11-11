-- Every document now belongs to a workspace (backfilled by V3).
ALTER TABLE documents ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX idx_documents_workspace_updated ON documents (workspace_id, updated_at);
