CREATE TABLE users(
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE credentials(
  user_id TEXT PRIMARY KEY REFERENCES users(
  id
) ON DELETE CASCADE,
  password_hash TEXT NOT NULL
);

CREATE TABLE sessions(
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(
  id
) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions(
  user_id
);

CREATE INDEX sessions_expiry_idx ON sessions(
  expires_at
);
