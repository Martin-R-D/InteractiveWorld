CREATE TABLE saved_objects(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(
  id
) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  scene_json TEXT NOT NULL,
  scene_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX saved_objects_user_hash_idx ON saved_objects(
  user_id,
  scene_hash
);

CREATE INDEX saved_objects_user_date_idx ON saved_objects(
  user_id,
  created_at,
  id
);
