-- Chantier 12 (D36) : projection des DM du mesh swarph et de l'état de la connexion.
CREATE TABLE mesh_inbox (
  id INTEGER PRIMARY KEY,
  thread_id TEXT,
  from_node TEXT NOT NULL,
  to_node TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reply_to INTEGER,
  obligation_id TEXT,
  seen_at TEXT,
  event_id TEXT NOT NULL
);
CREATE INDEX mesh_inbox_created ON mesh_inbox (created_at DESC);
CREATE TABLE mesh_state (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
