-- migrate:up
CREATE TABLE wiki_space (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

ALTER TABLE wiki_page
  ADD COLUMN space_id uuid REFERENCES wiki_space(id),
  ADD COLUMN parent_page_id uuid REFERENCES wiki_page(id);

CREATE INDEX wiki_page_space_active_idx ON wiki_page (space_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX wiki_page_parent_active_idx ON wiki_page (parent_page_id, updated_at DESC) WHERE deleted_at IS NULL;

DO $$
DECLARE
  default_owner uuid;
  general_space uuid;
BEGIN
  SELECT id INTO default_owner FROM app_user ORDER BY created_at LIMIT 1;
  IF default_owner IS NOT NULL AND EXISTS (SELECT 1 FROM wiki_page WHERE space_id IS NULL) THEN
    INSERT INTO wiki_space (slug, name, description, created_by)
    VALUES ('general', 'General', 'Pages created before spaces were introduced.', default_owner)
    ON CONFLICT (slug) DO UPDATE SET updated_at = wiki_space.updated_at
    RETURNING id INTO general_space;

    UPDATE wiki_page SET space_id = general_space WHERE space_id IS NULL;
  END IF;
END $$;

-- migrate:down
ALTER TABLE wiki_page DROP COLUMN IF EXISTS parent_page_id;
ALTER TABLE wiki_page DROP COLUMN IF EXISTS space_id;
DROP TABLE IF EXISTS wiki_space;
