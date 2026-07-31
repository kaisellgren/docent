-- migrate:up
ALTER TABLE stored_file
  ADD COLUMN preview_object_key text UNIQUE,
  ADD COLUMN preview_status content_status NOT NULL DEFAULT 'pending',
  ADD COLUMN preview_error text;

-- migrate:down
ALTER TABLE stored_file
  DROP COLUMN IF EXISTS preview_error,
  DROP COLUMN IF EXISTS preview_status,
  DROP COLUMN IF EXISTS preview_object_key;
