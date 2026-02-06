import type { ValidationConfig } from './validators.js';

export interface Topic {
  id: string;
  title: string;
  description: string;
  level: number;
  estimatedWeeks: number;
  prerequisites: string[];
  lessons: Lesson[];
  order: number;
}

export interface Lesson {
  id: string;
  topicId: string;
  title: string;
  description: string;
  content: string; // Markdown content
  exercises: Exercise[];
  order: number;
  estimatedMinutes: number;
}

export type ExerciseType =
  | 'sql-query'
  | 'explain-analysis'
  | 'optimization'
  | 'debugging'
  | 'schema-design'
  | 'performance';

export interface Exercise {
  id: string;
  lessonId: string;
  type: ExerciseType;
  title: string;
  prompt: string;
  setupSql?: string; // SQL to set up tables/data for the exercise
  hints: string[];
  explanation: string; // Shown after completion
  validation: ValidationConfig;
  order: number;
  difficulty: number; // 1-10
}

export interface SQLQueryExercise extends Exercise {
  type: 'sql-query';
  expectedResult?: {
    rowCount?: number;
    columns?: string[];
    exactMatch?: Array<Record<string, any>>;
  };
  solutionQuery?: string;
}

export interface ExplainAnalysisExercise extends Exercise {
  type: 'explain-analysis';
  query: string;
  questions: Array<{
    question: string;
    answer: string;
    hints?: string[];
  }>;
}

export interface OptimizationExercise extends Exercise {
  type: 'optimization';
  slowQuery: string;
  performanceTarget: {
    maxExecutionTimeMs?: number;
    mustUseIndex?: boolean;
    forbiddenNodes?: string[]; // e.g., ['Seq Scan']
  };
}

export interface DebuggingExercise extends Exercise {
  type: 'debugging';
  brokenQuery: string;
  expectedBehavior: string;
  errorType: 'syntax' | 'logic' | 'performance' | 'correctness';
}

export interface SchemaDesignExercise extends Exercise {
  type: 'schema-design';
  requirements: string[];
  constraints: string[];
  expectedTables?: string[];
  expectedIndexes?: string[];
}

export interface PerformanceExercise extends Exercise {
  type: 'performance';
  scenario: string;
  metrics: {
    baseline: Record<string, number>;
    target: Record<string, number>;
  };
}
