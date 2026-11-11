-- Documents move into workspaces. The workspaces live in the workspace service's
-- own database, so workspace_id is a plain column without a foreign key.
-- It is added as nullable here, backfilled by V3__BackfillDocumentWorkspaces and
-- made NOT NULL afterwards.
ALTER TABLE documents ADD COLUMN workspace_id BIGINT;
