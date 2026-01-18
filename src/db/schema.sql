CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  source_name TEXT NOT NULL,
  title TEXT,
  crawled_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  title,
  headings,
  content,
  url UNINDEXED
);

CREATE INDEX IF NOT EXISTS idx_pages_source ON pages(source_name);
