import type { EvaluationQuestion, EvaluationResponse } from '@learn-pg/shared';
import { getDatabase } from '../db/index.js';

export interface AdaptiveConfig {
  initialDifficulty: number;
  consecutiveCorrectToIncrease: number;
  consecutiveIncorrectToDecrease: number;
  difficultyStep: number;
  targetWeakAreas: boolean;
}

export class AdaptiveSelector {
  private config: AdaptiveConfig = {
    initialDifficulty: 5,
    consecutiveCorrectToIncrease: 1,  // Increase after each correct answer
    consecutiveIncorrectToDecrease: 2,
    difficultyStep: 2,  // Jump by 2 levels for faster adaptation
    targetWeakAreas: true
  };

  private consecutiveCorrect = 0;
  private consecutiveIncorrect = 0;
  private currentDifficulty: number;
  private askedQuestions = new Set<string>();

  constructor(startingSkillLevel: number, config?: Partial<AdaptiveConfig>) {
    this.currentDifficulty = startingSkillLevel;
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  selectNextQuestion(
    questionBank: EvaluationQuestion[],
    weakConcepts: string[] = []
  ): EvaluationQuestion | null {
    // Filter out already asked questions
    const availableQuestions = questionBank.filter(q => !this.askedQuestions.has(q.id));

    if (availableQuestions.length === 0) {
      return null;
    }

    // Target weak areas if enabled
    let candidates = availableQuestions;
    if (this.config.targetWeakAreas && weakConcepts.length > 0) {
      const weakAreaQuestions = availableQuestions.filter(q =>
        q.concepts.some((c: string) => weakConcepts.includes(c))
      );

      // Use weak area questions 60% of the time
      if (weakAreaQuestions.length > 0 && Math.random() < 0.6) {
        candidates = weakAreaQuestions;
      }
    }

    // Filter by difficulty (within ±1 of current difficulty)
    const targetDiff = this.currentDifficulty;
    const difficultyCandidates = candidates.filter(q =>
      Math.abs(q.difficulty - targetDiff) <= 1
    );

    const finalCandidates = difficultyCandidates.length > 0 ? difficultyCandidates : candidates;

    // Shuffle candidates for better randomization
    const shuffled = [...finalCandidates].sort(() => Math.random() - 0.5);

    // Select random question from shuffled candidates
    const selected = shuffled[Math.floor(Math.random() * shuffled.length)];
    this.askedQuestions.add(selected.id);

    return selected;
  }

  recordResponse(response: EvaluationResponse): void {
    if (response.isCorrect) {
      this.consecutiveCorrect++;
      this.consecutiveIncorrect = 0;

      // Increase difficulty after N correct answers
      if (this.consecutiveCorrect >= this.config.consecutiveCorrectToIncrease) {
        this.currentDifficulty = Math.min(10, this.currentDifficulty + this.config.difficultyStep);
        this.consecutiveCorrect = 0;
      }
    } else {
      this.consecutiveIncorrect++;
      this.consecutiveCorrect = 0;

      // Decrease difficulty after N incorrect answers
      if (this.consecutiveIncorrect >= this.config.consecutiveIncorrectToDecrease) {
        this.currentDifficulty = Math.max(1, this.currentDifficulty - this.config.difficultyStep);
        this.consecutiveIncorrect = 0;
      }
    }

    // Update question metadata
    this.updateQuestionMetadata(response);
  }

  getCurrentDifficulty(): number {
    return this.currentDifficulty;
  }

  calculateFinalSkillLevel(responses: EvaluationResponse[]): number {
    if (responses.length === 0) {
      return this.currentDifficulty;
    }

    // Calculate accuracy and average difficulty
    const correctCount = responses.filter(r => r.isCorrect).length;
    const accuracy = correctCount / responses.length;
    const avgDifficulty = responses.reduce((sum, r) => sum + r.questionDifficulty, 0) / responses.length;

    // Perfect score should reach high levels
    if (accuracy === 1.0) {
      // Perfect score: base on highest difficulty attempted + bonus
      const maxDifficulty = Math.max(...responses.map(r => r.questionDifficulty));
      return Math.min(10, Math.round(maxDifficulty + 2));
    }

    // Use current difficulty as base, adjusted by performance
    let rating = this.currentDifficulty * 100;

    for (const response of responses) {
      const expectedScore = this.expectedScore(rating, response.questionDifficulty * 100);
      const actualScore = response.isCorrect ? 1 : 0;

      // Time bonus (faster answers get more points)
      const timeBonus = Math.max(0, 1 - (response.timeSpentSeconds / 300));
      const adjustedActual = actualScore * (1 + timeBonus * 0.2);

      // K-factor - higher for more impact per question
      const kFactor = 50;
      rating += kFactor * (adjustedActual - expectedScore);
    }

    const finalLevel = Math.round(Math.max(1, Math.min(10, rating / 100)));
    return finalLevel;
  }

  identifyWeakAreas(
    responses: EvaluationResponse[],
    questionBank: EvaluationQuestion[]
  ): string[] {
    const conceptScores: Map<string, { correct: number; total: number }> = new Map();

    for (const response of responses) {
      const question = questionBank.find(q => q.id === response.questionId);
      if (!question) continue;

      for (const concept of question.concepts) {
        const current = conceptScores.get(concept) || { correct: 0, total: 0 };
        current.total++;
        if (response.isCorrect) {
          current.correct++;
        }
        conceptScores.set(concept, current);
      }
    }

    // Identify concepts with <50% accuracy
    const weakConcepts: Array<{ concept: string; rate: number }> = [];
    for (const [concept, scores] of conceptScores) {
      if (scores.total >= 2) {
        const accuracy = scores.correct / scores.total;
        if (accuracy < 0.5) {
          weakConcepts.push({ concept, rate: accuracy });
        }
      }
    }

    // Sort by worst performance
    weakConcepts.sort((a, b) => a.rate - b.rate);

    return weakConcepts.map(w => w.concept);
  }

  private expectedScore(rating: number, questionDifficulty: number): number {
    // Elo expected score formula
    return 1 / (1 + Math.pow(10, (questionDifficulty - rating) / 400));
  }

  private updateQuestionMetadata(response: EvaluationResponse): void {
    const db = getDatabase();

    const existing = db.prepare(`
      SELECT * FROM question_metadata WHERE question_id = ?
    `).get(response.questionId) as any;

    if (existing) {
      const timesCorrect = existing.times_correct + (response.isCorrect ? 1 : 0);
      const timesAsked = existing.times_asked + 1;
      const avgTime = (existing.average_time_seconds * existing.times_asked + response.timeSpentSeconds) / timesAsked;

      db.prepare(`
        UPDATE question_metadata
        SET times_asked = ?,
            times_correct = ?,
            average_time_seconds = ?,
            updated_at = ?
        WHERE question_id = ?
      `).run(timesAsked, timesCorrect, avgTime, new Date().toISOString(), response.questionId);
    } else {
      db.prepare(`
        INSERT INTO question_metadata (
          question_id, times_asked, times_correct, average_time_seconds
        ) VALUES (?, 1, ?, ?)
      `).run(response.questionId, response.isCorrect ? 1 : 0, response.timeSpentSeconds);
    }
  }
}
