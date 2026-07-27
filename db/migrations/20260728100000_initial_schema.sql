-- migrate:up
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE content_status AS ENUM ('pending', 'processing', 'ready', 'failed');
CREATE TYPE content_kind AS ENUM ('page', 'file');
CREATE TYPE chat_role AS ENUM ('user', 'assistant');

CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_subject text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wiki_page (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  current_revision_id uuid,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE page_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES wiki_page(id),
  revision_number integer NOT NULL CHECK (revision_number > 0),
  title text NOT NULL,
  markdown text NOT NULL,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, revision_number)
);
ALTER TABLE wiki_page
  ADD CONSTRAINT wiki_page_current_revision_fk
  FOREIGN KEY (current_revision_id) REFERENCES page_revision(id);

CREATE TABLE folder (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES folder(id),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE NULLS NOT DISTINCT (parent_id, name)
);

CREATE TABLE stored_file (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid REFERENCES folder(id),
  original_filename text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text'
  )),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  object_key text NOT NULL UNIQUE,
  extraction_status content_status NOT NULL DEFAULT 'pending',
  extraction_error text,
  uploaded_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE tag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE file_tag (
  file_id uuid NOT NULL REFERENCES stored_file(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (file_id, tag_id)
);

CREATE TABLE page_file (
  page_id uuid NOT NULL REFERENCES wiki_page(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES stored_file(id),
  attached_by uuid NOT NULL REFERENCES app_user(id),
  attached_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, file_id)
);

CREATE TABLE ingestion_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_kind content_kind NOT NULL,
  page_revision_id uuid REFERENCES page_revision(id) ON DELETE CASCADE,
  file_id uuid REFERENCES stored_file(id) ON DELETE CASCADE,
  status content_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CHECK ((content_kind = 'page' AND page_revision_id IS NOT NULL AND file_id IS NULL)
      OR (content_kind = 'file' AND file_id IS NOT NULL AND page_revision_id IS NULL)),
  UNIQUE NULLS NOT DISTINCT (page_revision_id, file_id)
);

CREATE TABLE content_chunk (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_kind content_kind NOT NULL,
  page_id uuid REFERENCES wiki_page(id) ON DELETE CASCADE,
  page_revision_id uuid REFERENCES page_revision(id) ON DELETE CASCADE,
  file_id uuid REFERENCES stored_file(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  text_content text NOT NULL,
  embedding vector(768) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((content_kind = 'page' AND page_id IS NOT NULL AND page_revision_id IS NOT NULL AND file_id IS NULL)
      OR (content_kind = 'file' AND file_id IS NOT NULL AND page_id IS NULL AND page_revision_id IS NULL))
);
CREATE INDEX content_chunk_embedding_idx ON content_chunk USING hnsw (embedding vector_cosine_ops);
CREATE INDEX content_chunk_page_revision_idx ON content_chunk (page_revision_id);
CREATE INDEX content_chunk_file_idx ON content_chunk (file_id);

CREATE TABLE conversation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE chat_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  role chat_role NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE message_citation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES chat_message(id) ON DELETE CASCADE,
  content_chunk_id uuid NOT NULL REFERENCES content_chunk(id),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  excerpt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, ordinal)
);

CREATE INDEX wiki_page_active_idx ON wiki_page (updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX stored_file_active_idx ON stored_file (folder_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX conversation_owner_idx ON conversation (owner_id, updated_at DESC) WHERE deleted_at IS NULL;

-- migrate:down
DROP TABLE IF EXISTS message_citation;
DROP TABLE IF EXISTS chat_message;
DROP TABLE IF EXISTS conversation;
DROP TABLE IF EXISTS content_chunk;
DROP TABLE IF EXISTS ingestion_job;
DROP TABLE IF EXISTS page_file;
DROP TABLE IF EXISTS file_tag;
DROP TABLE IF EXISTS tag;
DROP TABLE IF EXISTS stored_file;
DROP TABLE IF EXISTS folder;
ALTER TABLE IF EXISTS wiki_page DROP CONSTRAINT IF EXISTS wiki_page_current_revision_fk;
DROP TABLE IF EXISTS page_revision;
DROP TABLE IF EXISTS wiki_page;
DROP TABLE IF EXISTS app_user;
DROP TYPE IF EXISTS chat_role;
DROP TYPE IF EXISTS content_kind;
DROP TYPE IF EXISTS content_status;
