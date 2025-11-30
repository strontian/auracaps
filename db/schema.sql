CREATE TABLE transcripts (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP,
  account_id TEXT,
  video_id INTEGER,
  srt TEXT,
  words TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transcripts_account_id ON transcripts(account_id);
CREATE INDEX idx_transcripts_video_id ON transcripts(video_id);

CREATE TABLE videos (
  id SERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  r2_key TEXT,
  is_original BOOLEAN,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_videos_account_id ON videos(account_id);
CREATE INDEX idx_videos_created_at ON videos(created_at DESC);

CREATE TABLE caption_tasks (
  id SERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  source_id INTEGER,
  dest_id INTEGER,
  caption_config JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_caption_tasks_source_id ON caption_tasks(source_id);
CREATE INDEX idx_caption_tasks_dest_id ON caption_tasks(dest_id);

CREATE TABLE "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX "IDX_session_expire" ON "session" ("expire");

CREATE TABLE google_auth (
  email TEXT NOT NULL,
  account_id TEXT PRIMARY KEY,
  realname TEXT NOT NULL,
  timestamp TIMESTAMP
);
