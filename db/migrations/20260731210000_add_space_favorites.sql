-- migrate:up
CREATE TABLE wiki_space_favorite (
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES wiki_space(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, space_id)
);

CREATE INDEX wiki_space_favorite_user_idx ON wiki_space_favorite (user_id, created_at DESC);

-- migrate:down
DROP TABLE IF EXISTS wiki_space_favorite;
