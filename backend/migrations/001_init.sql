CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row = one continuous stretch of time a user spent on one page.
-- ended_at IS NULL means the visit is still going on right now.
CREATE TABLE page_visits (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page         TEXT NOT NULL CHECK (page IN ('home', 'articles', 'stats')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at     TIMESTAMPTZ,
  -- the user's last activity; used as the end time if they go idle or the connection dies
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- A user can have at most ONE open visit at a time (so two tabs can't
-- count time twice). "Partial" index: it only covers rows where ended_at IS NULL.
CREATE UNIQUE INDEX one_open_visit_per_user ON page_visits (user_id) WHERE ended_at IS NULL;

-- Speeds up the stats query, which groups visits by user and page.
CREATE INDEX page_visits_user_page ON page_visits (user_id, page);
