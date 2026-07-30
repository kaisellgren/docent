-- migrate:up
ALTER TABLE folder
  ADD COLUMN space_id uuid REFERENCES wiki_space(id);

ALTER TABLE stored_file
  ADD COLUMN space_id uuid REFERENCES wiki_space(id);

CREATE INDEX folder_space_active_idx ON folder (space_id, parent_id, name) WHERE deleted_at IS NULL;
CREATE INDEX stored_file_space_active_idx ON stored_file (space_id, created_at DESC) WHERE deleted_at IS NULL;

-- migrate:down
DROP INDEX IF EXISTS stored_file_space_active_idx;
DROP INDEX IF EXISTS folder_space_active_idx;
ALTER TABLE stored_file DROP COLUMN IF EXISTS space_id;
ALTER TABLE folder DROP COLUMN IF EXISTS space_id;
