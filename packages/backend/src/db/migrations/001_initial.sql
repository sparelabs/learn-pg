-- User progress tracking
CREATE TABLE IF NOT EXISTS user_progress (
  user_id TEXT PRIMARY KEY DEFAULT 'default',
  current_topic_id TEXT,
  current_lesson_id TEXT,
  skill_rating INTEGER DEFAULT 1 CHECK (skill_rating BETWEEN 1 AND 10),
  total_exercises_completed INTEGER DEFAULT 0,
  total_time_spent_minutes INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  last_activity_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Topic progress tracking
CREATE TABLE IF NOT EXISTS topic_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  topic_id TEXT NOT NULL,
  status TEXT CHECK (status IN ('not-started', 'in-progress', 'completed')) DEFAULT 'not-started',
  completed_lessons TEXT DEFAULT '[]', -- JSON array of lesson IDs
  completed_exercises TEXT DEFAULT '[]', -- JSON array of exercise IDs
  struggled_exercises TEXT DEFAULT '[]', -- JSON array of exercise IDs
  started_at TEXT,
  completed_at TEXT,
  mastery_level INTEGER DEFAULT 0 CHECK (mastery_level BETWEEN 0 AND 100),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user_progress(user_id),
  UNIQUE (user_id, topic_id)
);

-- Exercise attempts
CREATE TABLE IF NOT EXISTS exercise_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id TEXT NOT NULL,
  user_id TEXT DEFAULT 'default',
  submitted_query TEXT NOT NULL,
  is_correct INTEGER DEFAULT 0, -- SQLite uses INTEGER for booleans
  feedback TEXT,
  execution_time_ms INTEGER,
  hints_used INTEGER DEFAULT 0,
  attempt_number INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user_progress(user_id)
);

-- Session records
CREATE TABLE IF NOT EXISTS session_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  start_time TEXT NOT NULL,
  end_time TEXT,
  topics_viewed TEXT DEFAULT '[]', -- JSON array
  lessons_completed TEXT DEFAULT '[]', -- JSON array
  exercises_attempted TEXT DEFAULT '[]', -- JSON array
  exercises_completed TEXT DEFAULT '[]', -- JSON array
  total_time_minutes INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES user_progress(user_id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_topic_progress_user_topic ON topic_progress(user_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_exercise_attempts_exercise ON exercise_attempts(exercise_id);
CREATE INDEX IF NOT EXISTS idx_exercise_attempts_user ON exercise_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_session_records_user ON session_records(user_id);

-- Insert default user
INSERT OR IGNORE INTO user_progress (user_id) VALUES ('default');
