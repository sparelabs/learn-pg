import { getDatabase } from '../db/index.js';
import type {
  UserProgress,
  TopicProgress,
  ExerciseAttempt,
  SessionRecord,
  StruggledConcept,
  WeakArea
} from '@learn-pg/shared';

export class ProgressService {
  private userId = 'default';

  getUserProgress(): UserProgress {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM user_progress WHERE user_id = ?
    `).get(this.userId) as any;

    if (!row) {
      return this.createDefaultUser();
    }

    const topicProgress = this.getTopicProgress();

    return {
      userId: row.user_id,
      currentTopicId: row.current_topic_id,
      currentLessonId: row.current_lesson_id,
      topicProgress,
      skillRating: row.skill_rating,
      totalExercisesCompleted: row.total_exercises_completed,
      totalTimeSpentMinutes: row.total_time_spent_minutes,
      streak: row.streak,
      lastActivityDate: row.last_activity_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  updateUserProgress(updates: Partial<UserProgress>): void {
    const db = getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.currentTopicId !== undefined) {
      fields.push('current_topic_id = ?');
      values.push(updates.currentTopicId);
    }

    if (updates.currentLessonId !== undefined) {
      fields.push('current_lesson_id = ?');
      values.push(updates.currentLessonId);
    }

    if (updates.skillRating !== undefined) {
      fields.push('skill_rating = ?');
      values.push(updates.skillRating);
    }

    if (updates.totalExercisesCompleted !== undefined) {
      fields.push('total_exercises_completed = ?');
      values.push(updates.totalExercisesCompleted);
    }

    if (updates.totalTimeSpentMinutes !== undefined) {
      fields.push('total_time_spent_minutes = ?');
      values.push(updates.totalTimeSpentMinutes);
    }

    if (updates.streak !== undefined) {
      fields.push('streak = ?');
      values.push(updates.streak);
    }

    fields.push('last_activity_date = ?');
    values.push(new Date().toISOString());

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(this.userId);

    db.prepare(`
      UPDATE user_progress
      SET ${fields.join(', ')}
      WHERE user_id = ?
    `).run(...values);
  }

  getTopicProgress(topicId?: string): TopicProgress[] {
    const db = getDatabase();
    const query = topicId
      ? 'SELECT * FROM topic_progress WHERE user_id = ? AND topic_id = ?'
      : 'SELECT * FROM topic_progress WHERE user_id = ?';

    const params = topicId ? [this.userId, topicId] : [this.userId];
    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(row => ({
      topicId: row.topic_id,
      status: row.status,
      completedLessons: JSON.parse(row.completed_lessons),
      completedExercises: JSON.parse(row.completed_exercises),
      struggledExercises: JSON.parse(row.struggled_exercises),
      startedAt: row.started_at,
      completedAt: row.completed_at,
      masteryLevel: row.mastery_level
    }));
  }

  updateTopicProgress(topicId: string, updates: Partial<TopicProgress>): void {
    const db = getDatabase();

    // Check if record exists
    const existing = db.prepare(`
      SELECT id FROM topic_progress WHERE user_id = ? AND topic_id = ?
    `).get(this.userId, topicId);

    if (!existing) {
      // Insert new record
      db.prepare(`
        INSERT INTO topic_progress (user_id, topic_id, status, started_at)
        VALUES (?, ?, ?, ?)
      `).run(this.userId, topicId, updates.status || 'in-progress', new Date().toISOString());
    }

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);

      if (updates.status === 'completed' && !updates.completedAt) {
        fields.push('completed_at = ?');
        values.push(new Date().toISOString());
      }
    }

    if (updates.completedLessons) {
      fields.push('completed_lessons = ?');
      values.push(JSON.stringify(updates.completedLessons));
    }

    if (updates.completedExercises) {
      fields.push('completed_exercises = ?');
      values.push(JSON.stringify(updates.completedExercises));
    }

    if (updates.struggledExercises) {
      fields.push('struggled_exercises = ?');
      values.push(JSON.stringify(updates.struggledExercises));
    }

    if (updates.masteryLevel !== undefined) {
      fields.push('mastery_level = ?');
      values.push(updates.masteryLevel);
    }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(this.userId, topicId);

      db.prepare(`
        UPDATE topic_progress
        SET ${fields.join(', ')}
        WHERE user_id = ? AND topic_id = ?
      `).run(...values);
    }
  }

  recordExerciseAttempt(attempt: Omit<ExerciseAttempt, 'id' | 'userId' | 'createdAt'>): void {
    const db = getDatabase();

    db.prepare(`
      INSERT INTO exercise_attempts (
        exercise_id, user_id, submitted_query, is_correct,
        feedback, execution_time_ms, hints_used, attempt_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attempt.exerciseId,
      this.userId,
      attempt.submittedQuery,
      attempt.isCorrect ? 1 : 0,
      attempt.feedback,
      attempt.executionTimeMs || null,
      attempt.hintsUsed,
      attempt.attemptNumber
    );

    // Update total exercises completed if correct
    if (attempt.isCorrect) {
      db.prepare(`
        UPDATE user_progress
        SET total_exercises_completed = total_exercises_completed + 1,
            updated_at = ?
        WHERE user_id = ?
      `).run(new Date().toISOString(), this.userId);
    }
  }

  getCompletedExerciseIds(): string[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT DISTINCT exercise_id FROM exercise_attempts
      WHERE user_id = ? AND is_correct = 1
    `).all(this.userId) as any[];
    return rows.map(row => row.exercise_id);
  }

  getExerciseAttempts(exerciseId: string): ExerciseAttempt[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM exercise_attempts
      WHERE user_id = ? AND exercise_id = ?
      ORDER BY created_at DESC
    `).all(this.userId, exerciseId) as any[];

    return rows.map(row => ({
      id: row.id.toString(),
      exerciseId: row.exercise_id,
      userId: row.user_id,
      submittedQuery: row.submitted_query,
      isCorrect: Boolean(row.is_correct),
      feedback: row.feedback,
      executionTimeMs: row.execution_time_ms,
      hintsUsed: row.hints_used,
      attemptNumber: row.attempt_number,
      createdAt: row.created_at
    }));
  }

  startSession(): string {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO session_records (user_id, start_time)
      VALUES (?, ?)
    `).run(this.userId, new Date().toISOString());

    return result.lastInsertRowid.toString();
  }

  endSession(sessionId: string, updates: Partial<SessionRecord>): void {
    const db = getDatabase();
    const fields: string[] = ['end_time = ?'];
    const values: any[] = [new Date().toISOString()];

    if (updates.topicsViewed) {
      fields.push('topics_viewed = ?');
      values.push(JSON.stringify(updates.topicsViewed));
    }

    if (updates.lessonsCompleted) {
      fields.push('lessons_completed = ?');
      values.push(JSON.stringify(updates.lessonsCompleted));
    }

    if (updates.exercisesAttempted) {
      fields.push('exercises_attempted = ?');
      values.push(JSON.stringify(updates.exercisesAttempted));
    }

    if (updates.exercisesCompleted) {
      fields.push('exercises_completed = ?');
      values.push(JSON.stringify(updates.exercisesCompleted));
    }

    if (updates.totalTimeMinutes) {
      fields.push('total_time_minutes = ?');
      values.push(updates.totalTimeMinutes);
    }

    values.push(sessionId);

    db.prepare(`
      UPDATE session_records
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...values);
  }

  recordStruggledConcept(concept: string, topicId: string, exerciseId: string): void {
    const db = getDatabase();

    const existing = db.prepare(`
      SELECT id, exercises_failed, struggle_count
      FROM struggled_concepts
      WHERE user_id = ? AND concept = ? AND topic_id = ?
    `).get(this.userId, concept, topicId) as any;

    if (existing) {
      const exercisesFailed = JSON.parse(existing.exercises_failed);
      if (!exercisesFailed.includes(exerciseId)) {
        exercisesFailed.push(exerciseId);
      }

      db.prepare(`
        UPDATE struggled_concepts
        SET exercises_failed = ?,
            last_struggle_date = ?,
            struggle_count = struggle_count + 1
        WHERE id = ?
      `).run(
        JSON.stringify(exercisesFailed),
        new Date().toISOString(),
        existing.id
      );
    } else {
      db.prepare(`
        INSERT INTO struggled_concepts (
          user_id, concept, topic_id, exercises_failed,
          first_struggle_date, last_struggle_date, struggle_count
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(
        this.userId,
        concept,
        topicId,
        JSON.stringify([exerciseId]),
        new Date().toISOString(),
        new Date().toISOString()
      );
    }
  }

  getWeakAreas(): WeakArea[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM weak_areas
      WHERE user_id = ?
      ORDER BY failure_rate DESC
      LIMIT 10
    `).all(this.userId) as any[];

    return rows.map(row => ({
      concept: row.concept,
      topicId: row.topic_id,
      topicTitle: row.topic_title,
      failureRate: row.failure_rate,
      totalAttempts: row.total_attempts,
      recommendedLessons: JSON.parse(row.recommended_lessons)
    }));
  }

  updateWeakAreas(topicId: string, topicTitle: string): void {
    const db = getDatabase();

    // Calculate failure rates from exercise attempts
    const struggles = db.prepare(`
      SELECT concept, COUNT(*) as struggle_count
      FROM struggled_concepts
      WHERE user_id = ? AND topic_id = ?
      GROUP BY concept
    `).all(this.userId, topicId) as any[];

    for (const struggle of struggles) {
      const totalAttempts = db.prepare(`
        SELECT COUNT(*) as count
        FROM exercise_attempts
        WHERE user_id = ? AND exercise_id LIKE ?
      `).get(this.userId, `${topicId}%`) as any;

      const failureRate = totalAttempts.count > 0
        ? struggle.struggle_count / totalAttempts.count
        : 0;

      db.prepare(`
        INSERT OR REPLACE INTO weak_areas (
          user_id, concept, topic_id, topic_title,
          failure_rate, total_attempts, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        this.userId,
        struggle.concept,
        topicId,
        topicTitle,
        failureRate,
        totalAttempts.count,
        new Date().toISOString()
      );
    }
  }

  private createDefaultUser(): UserProgress {
    return {
      userId: this.userId,
      topicProgress: [],
      skillRating: 1,
      totalExercisesCompleted: 0,
      totalTimeSpentMinutes: 0,
      streak: 0,
      lastActivityDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  updateStreak(): void {
    const db = getDatabase();
    const progress = this.getUserProgress();
    const lastActivity = progress.lastActivityDate ? new Date(progress.lastActivityDate) : null;
    const now = new Date();

    let newStreak = progress.streak;

    if (lastActivity) {
      const daysDiff = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff === 1) {
        // Continue streak
        newStreak += 1;
      } else if (daysDiff > 1) {
        // Break streak
        newStreak = 1;
      }
      // Same day: don't change streak
    } else {
      // First activity
      newStreak = 1;
    }

    this.updateUserProgress({ streak: newStreak });
  }
}

export const progressService = new ProgressService();
