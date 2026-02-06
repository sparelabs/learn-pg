-- Struggled concepts tracking
CREATE TABLE IF NOT EXISTS struggled_concepts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  concept TEXT NOT NULL, -- e.g., 'joins', 'indexes', 'query-planning'
  topic_id TEXT NOT NULL,
  exercises_failed TEXT DEFAULT '[]', -- JSON array of exercise IDs
  first_struggle_date TEXT NOT NULL,
  last_struggle_date TEXT NOT NULL,
  struggle_count INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES user_progress(user_id),
  UNIQUE (user_id, concept, topic_id)
);

-- Weak areas aggregation (denormalized for fast reads)
CREATE TABLE IF NOT EXISTS weak_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  concept TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  topic_title TEXT NOT NULL,
  failure_rate REAL NOT NULL CHECK (failure_rate BETWEEN 0 AND 1),
  total_attempts INTEGER DEFAULT 0,
  recommended_lessons TEXT DEFAULT '[]', -- JSON array of lesson IDs
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user_progress(user_id),
  UNIQUE (user_id, concept, topic_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_struggled_concepts_user ON struggled_concepts(user_id);
CREATE INDEX IF NOT EXISTS idx_struggled_concepts_concept ON struggled_concepts(concept);
CREATE INDEX IF NOT EXISTS idx_weak_areas_user ON weak_areas(user_id);
CREATE INDEX IF NOT EXISTS idx_weak_areas_failure_rate ON weak_areas(failure_rate DESC);
