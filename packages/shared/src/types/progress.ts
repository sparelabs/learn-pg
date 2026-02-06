export interface UserProgress {
  userId: string;
  currentTopicId?: string;
  currentLessonId?: string;
  topicProgress: TopicProgress[];
  skillRating: number; // 1-10
  totalExercisesCompleted: number;
  totalTimeSpentMinutes: number;
  streak: number; // Days
  lastActivityDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface TopicProgress {
  topicId: string;
  status: 'not-started' | 'in-progress' | 'completed';
  completedLessons: string[];
  completedExercises: string[];
  struggledExercises: string[]; // Exercises with multiple failed attempts
  startedAt?: string;
  completedAt?: string;
  masteryLevel: number; // 0-100
}

export interface ExerciseAttempt {
  id: string;
  exerciseId: string;
  userId: string;
  submittedQuery: string;
  isCorrect: boolean;
  feedback: string;
  executionTimeMs?: number;
  hintsUsed: number;
  attemptNumber: number; // 1st, 2nd, 3rd attempt
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  startTime: string;
  endTime?: string;
  topicsViewed: string[];
  lessonsCompleted: string[];
  exercisesAttempted: string[];
  exercisesCompleted: string[];
  totalTimeMinutes: number;
}

export interface StruggledConcept {
  userId: string;
  concept: string; // e.g., 'joins', 'indexes', 'query-planning'
  topicId: string;
  exercisesFailed: string[];
  firstStruggleDate: string;
  lastStruggleDate: string;
  struggleCount: number;
}

export interface WeakArea {
  concept: string;
  topicId: string;
  topicTitle: string;
  failureRate: number; // 0-1
  totalAttempts: number;
  recommendedLessons: string[];
}
