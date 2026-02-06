-- Evaluation sessions
CREATE TABLE IF NOT EXISTS evaluation_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  start_time TEXT NOT NULL,
  end_time TEXT,
  starting_skill_level INTEGER NOT NULL CHECK (starting_skill_level BETWEEN 1 AND 10),
  ending_skill_level INTEGER CHECK (ending_skill_level BETWEEN 1 AND 10),
  questions_answered TEXT DEFAULT '[]', -- JSON array of question IDs
  weak_areas_identified TEXT DEFAULT '[]', -- JSON array of concept names
  status TEXT CHECK (status IN ('in-progress', 'completed', 'abandoned')) DEFAULT 'in-progress',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user_progress(user_id)
);

-- Evaluation responses
CREATE TABLE IF NOT EXISTS evaluation_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_difficulty INTEGER NOT NULL CHECK (question_difficulty BETWEEN 1 AND 10),
  user_answer TEXT NOT NULL,
  is_correct INTEGER NOT NULL, -- SQLite boolean
  time_spent_seconds INTEGER NOT NULL,
  hints_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES evaluation_sessions(id)
);

-- Question metadata (for tracking question performance)
CREATE TABLE IF NOT EXISTS question_metadata (
  question_id TEXT PRIMARY KEY,
  times_asked INTEGER DEFAULT 0,
  times_correct INTEGER DEFAULT 0,
  average_time_seconds REAL DEFAULT 0,
  irt_discrimination REAL, -- Item Response Theory parameter
  irt_difficulty REAL, -- Item Response Theory parameter
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_evaluation_sessions_user ON evaluation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_responses_session ON evaluation_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_responses_question ON evaluation_responses(question_id);
