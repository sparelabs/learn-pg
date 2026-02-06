export interface EvaluationSession {
  id: string;
  userId: string;
  startTime: string;
  endTime?: string;
  startingSkillLevel: number;
  endingSkillLevel?: number;
  questionsAnswered: EvaluationResponse[];
  weakAreasIdentified: string[];
  status: 'in-progress' | 'completed' | 'abandoned';
}

export interface EvaluationResponse {
  questionId: string;
  questionDifficulty: number; // 1-10
  userAnswer: string;
  isCorrect: boolean;
  timeSpentSeconds: number;
  hintsUsed: number;
}

export type QuestionType =
  | 'multiple-choice'
  | 'sql-write'
  | 'explain-interpret'
  | 'performance-analysis'
  | 'scenario-based';

export interface EvaluationQuestion {
  id: string;
  type: QuestionType;
  difficulty: number; // 1-10
  topic: string;
  concepts: string[]; // Tagged concepts (e.g., ['indexes', 'query-planning'])
  prompt: string;
  setupSql?: string;
  metadata: QuestionMetadata;
}

export interface MultipleChoiceQuestion extends EvaluationQuestion {
  type: 'multiple-choice';
  options: Array<{
    id: string;
    text: string;
  }>;
  correctOptionId: string;
  explanation: string;
}

export interface SQLWriteQuestion extends EvaluationQuestion {
  type: 'sql-write';
  expectedResult: {
    rowCount?: number;
    columns?: string[];
    exactMatch?: Array<Record<string, any>>;
  };
  acceptableQueries?: string[]; // Multiple correct approaches
  explanation: string;
}

export interface ExplainInterpretQuestion extends EvaluationQuestion {
  type: 'explain-interpret';
  query: string;
  explainOutput: string;
  question: string; // e.g., "Why is this query slow?"
  options: Array<{
    id: string;
    text: string;
  }>;
  correctOptionId: string;
  explanation: string;
}

export interface PerformanceAnalysisQuestion extends EvaluationQuestion {
  type: 'performance-analysis';
  scenario: string;
  metrics: Record<string, number>;
  question: string;
  options: Array<{
    id: string;
    text: string;
  }>;
  correctOptionId: string;
  explanation: string;
}

export interface ScenarioBasedQuestion extends EvaluationQuestion {
  type: 'scenario-based';
  scenario: string;
  tasks: Array<{
    id: string;
    description: string;
    expectedAction: string;
  }>;
  solution: string;
  explanation: string;
}

export interface QuestionMetadata {
  timesAsked: number;
  timesCorrect: number;
  averageTimeSeconds: number;
  irtDiscrimination?: number; // IRT parameter
  irtDifficulty?: number; // IRT parameter
}

export const SKILL_LEVELS = [
  { level: 1, name: "Fledgling DBA", emoji: "🐣" },
  { level: 2, name: "Database Apprentice", emoji: "📚" },
  { level: 3, name: "Query Craftsperson", emoji: "🔨" },
  { level: 4, name: "Index Artisan", emoji: "🎨" },
  { level: 5, name: "Performance Tuner", emoji: "⚡" },
  { level: 6, name: "Optimization Wizard", emoji: "🧙" },
  { level: 7, name: "Query Whisperer", emoji: "🎭" },
  { level: 8, name: "PostgreSQL Sage", emoji: "🦉" },
  { level: 9, name: "EXPLAIN Virtuoso", emoji: "🎼" },
  { level: 10, name: "Vacuum Philosopher", emoji: "🌌" },
] as const;

export type SkillLevel = typeof SKILL_LEVELS[number];
