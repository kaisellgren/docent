-- migrate:up
ALTER TABLE wiki_space
  ADD COLUMN icon text NOT NULL DEFAULT 'book-open';

ALTER TABLE wiki_space
  ADD CONSTRAINT wiki_space_icon_check
  CHECK (icon IN ('book-open', 'code-2', 'compass', 'database', 'megaphone', 'palette', 'shield-check', 'users'));

-- migrate:down
ALTER TABLE wiki_space DROP CONSTRAINT IF EXISTS wiki_space_icon_check;
ALTER TABLE wiki_space DROP COLUMN IF EXISTS icon;
