import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { EvaluationSession, EvaluationQuestion, EvaluationResponse } from '@learn-pg/shared';
import { getDatabase } from '../db/index.js';
import { AdaptiveSelector } from '../evaluation/adaptive-selector.js';
import { progressService } from './progress-service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class EvaluationService {
  private questionBank: EvaluationQuestion[] = [];
  private activeSessions: Map<string, AdaptiveSelector> = new Map();
  private questionsPath: string;

  constructor(questionsPath?: string) {
    this.questionsPath = questionsPath || join(__dirname, '../../../../curriculum/evaluation');
  }

  async loadQuestionBank(): Promise<void> {
    if (!existsSync(this.questionsPath)) {
      console.warn(`Evaluation questions path does not exist: ${this.questionsPath}`);
      return;
    }

    const files = readdirSync(this.questionsPath).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const content = readFileSync(join(this.questionsPath, file), 'utf-8');
      const questions = JSON.parse(content);

      if (Array.isArray(questions)) {
        this.questionBank.push(...questions);
      }
    }
  }

  startEvaluation(userId: string = 'default'): EvaluationSession {
    const db = getDatabase();
    const progress = progressService.getUserProgress();
    const sessionId = `eval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const session: EvaluationSession = {
      id: sessionId,
      userId,
      startTime: new Date().toISOString(),
      startingSkillLevel: progress.skillRating,
      questionsAnswered: [],
      weakAreasIdentified: [],
      status: 'in-progress'
    };

    db.prepare(`
      INSERT INTO evaluation_sessions (
        id, user_id, start_time, starting_skill_level, status
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.userId,
      session.startTime,
      session.startingSkillLevel,
      session.status
    );

    // Create adaptive selector for this session
    const selector = new AdaptiveSelector(progress.skillRating);
    this.activeSessions.set(sessionId, selector);

    return session;
  }

  getNextQuestion(sessionId: string): EvaluationQuestion | null {
    const selector = this.activeSessions.get(sessionId);
    if (!selector) {
      throw new Error('Evaluation session not found');
    }

    // Get weak areas from user progress
    const weakAreas = progressService.getWeakAreas();
    const weakConcepts = weakAreas.map(w => w.concept);

    return selector.selectNextQuestion(this.questionBank, weakConcepts);
  }

  submitAnswer(
    sessionId: string,
    response: Omit<EvaluationResponse, 'created_at'>
  ): { isCorrect: boolean; explanation?: string } {
    const db = getDatabase();
    const selector = this.activeSessions.get(sessionId);

    if (!selector) {
      throw new Error('Evaluation session not found');
    }

    // Find the question to get correct answer
    const question = this.questionBank.find(q => q.id === response.questionId);
    if (!question) {
      throw new Error('Question not found');
    }

    // Check if answer is correct
    const isCorrect = this.checkAnswer(question, response.userAnswer);
    const fullResponse: EvaluationResponse = {
      ...response,
      isCorrect
    };

    // Record response in database
    db.prepare(`
      INSERT INTO evaluation_responses (
        session_id, question_id, question_difficulty,
        user_answer, is_correct, time_spent_seconds, hints_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      response.questionId,
      response.questionDifficulty,
      response.userAnswer,
      isCorrect ? 1 : 0,
      response.timeSpentSeconds,
      response.hintsUsed
    );

    // Update adaptive selector
    selector.recordResponse(fullResponse);

    // Get explanation based on question type
    const explanation = this.getExplanation(question);

    return { isCorrect, explanation };
  }

  completeEvaluation(sessionId: string): EvaluationSession {
    const db = getDatabase();
    const selector = this.activeSessions.get(sessionId);

    if (!selector) {
      throw new Error('Evaluation session not found');
    }

    // Get all responses for this session
    const responses = db.prepare(`
      SELECT * FROM evaluation_responses WHERE session_id = ?
    `).all(sessionId) as any[];

    const evaluationResponses: EvaluationResponse[] = responses.map(r => ({
      questionId: r.question_id,
      questionDifficulty: r.question_difficulty,
      userAnswer: r.user_answer,
      isCorrect: Boolean(r.is_correct),
      timeSpentSeconds: r.time_spent_seconds,
      hintsUsed: r.hints_used
    }));

    // Calculate final skill level
    const finalSkillLevel = selector.calculateFinalSkillLevel(evaluationResponses);

    // Identify weak areas
    const weakAreas = selector.identifyWeakAreas(evaluationResponses, this.questionBank);

    // Update session in database
    db.prepare(`
      UPDATE evaluation_sessions
      SET end_time = ?,
          ending_skill_level = ?,
          weak_areas_identified = ?,
          status = 'completed'
      WHERE id = ?
    `).run(
      new Date().toISOString(),
      finalSkillLevel,
      JSON.stringify(weakAreas),
      sessionId
    );

    // Update user progress
    progressService.updateUserProgress({
      skillRating: finalSkillLevel
    });

    // Clean up active session
    this.activeSessions.delete(sessionId);

    // Fetch complete session
    const session = db.prepare(`
      SELECT * FROM evaluation_sessions WHERE id = ?
    `).get(sessionId) as any;

    return {
      id: session.id,
      userId: session.user_id,
      startTime: session.start_time,
      endTime: session.end_time,
      startingSkillLevel: session.starting_skill_level,
      endingSkillLevel: session.ending_skill_level,
      questionsAnswered: evaluationResponses,
      weakAreasIdentified: JSON.parse(session.weak_areas_identified),
      status: session.status
    };
  }

  getEvaluationHistory(userId: string = 'default', limit: number = 10): EvaluationSession[] {
    const db = getDatabase();
    const sessions = db.prepare(`
      SELECT * FROM evaluation_sessions
      WHERE user_id = ?
      ORDER BY start_time DESC
      LIMIT ?
    `).all(userId, limit) as any[];

    return sessions.map(s => ({
      id: s.id,
      userId: s.user_id,
      startTime: s.start_time,
      endTime: s.end_time,
      startingSkillLevel: s.starting_skill_level,
      endingSkillLevel: s.ending_skill_level,
      questionsAnswered: JSON.parse(s.questions_answered || '[]'),
      weakAreasIdentified: JSON.parse(s.weak_areas_identified || '[]'),
      status: s.status
    }));
  }

  private checkAnswer(question: EvaluationQuestion, userAnswer: string): boolean {
    switch (question.type) {
      case 'multiple-choice':
      case 'explain-interpret':
      case 'performance-analysis': {
        const mcQuestion = question as any;
        return userAnswer === mcQuestion.correctOptionId;
      }

      case 'sql-write': {
        // For SQL questions, this would need actual execution
        // For now, just check if answer is not empty
        return userAnswer.trim().length > 0;
      }

      case 'scenario-based': {
        // Scenario questions need manual grading or complex logic
        return userAnswer.trim().length > 0;
      }

      default:
        return false;
    }
  }

  private getExplanation(question: EvaluationQuestion): string {
    const q = question as any;
    return q.explanation || 'No explanation available';
  }

  getQuestionBank(): EvaluationQuestion[] {
    return this.questionBank;
  }

  getQuestionsByDifficulty(difficulty: number): EvaluationQuestion[] {
    return this.questionBank.filter(q => q.difficulty === difficulty);
  }

  getQuestionsByConcept(concept: string): EvaluationQuestion[] {
    return this.questionBank.filter(q => q.concepts.includes(concept));
  }
}

export const evaluationService = new EvaluationService();
