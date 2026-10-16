CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('lost', 'found')),
  item TEXT NOT NULL,
  location TEXT NOT NULL,
  storage TEXT NOT NULL DEFAULT '',
  simple_description TEXT NOT NULL,
  detailed_description TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL,
  photo TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS post_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  content TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS post_comments_post_created_idx
  ON post_comments (post_id, created_at);
