import type { FastifyInstance } from 'fastify';
import { evaluationService } from '../../services/evaluation-service.js';

export async function evaluationRoutes(fastify: FastifyInstance) {
  // Start a new evaluation session
  fastify.post('/evaluation/start', async (request, reply) => {
    const body = (request.body || {}) as { userId?: string };
    const userId = body.userId || 'default';

    try {
      const session = evaluationService.startEvaluation(userId);
      return { session };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // Get next question in evaluation
  fastify.get('/evaluation/:sessionId/next', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };

    try {
      const question = evaluationService.getNextQuestion(sessionId);

      if (!question) {
        return { question: null, message: 'No more questions available' };
      }

      // Return question without the correct answer
      const { ...questionWithoutAnswer } = question as any;
      delete questionWithoutAnswer.correctOptionId;
      delete questionWithoutAnswer.acceptableQueries;
      delete questionWithoutAnswer.solution;
      delete questionWithoutAnswer.explanation;

      return { question: questionWithoutAnswer };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // Submit answer to evaluation question
  fastify.post('/evaluation/:sessionId/answer', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { questionId, answer, timeSpentSeconds, hintsUsed = 0 } = request.body as {
      questionId: string;
      answer: string;
      timeSpentSeconds: number;
      hintsUsed?: number;
    };

    if (!questionId || !answer) {
      return reply.code(400).send({ error: 'questionId and answer are required' });
    }

    try {
      // Find question difficulty
      const questionBank = evaluationService.getQuestionBank();
      const question = questionBank.find(q => q.id === questionId);

      if (!question) {
        return reply.code(404).send({ error: 'Question not found' });
      }

      const result = evaluationService.submitAnswer(sessionId, {
        questionId,
        questionDifficulty: question.difficulty,
        userAnswer: answer,
        isCorrect: false, // Will be set by service
        timeSpentSeconds,
        hintsUsed
      });

      return result;
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // Complete evaluation session
  fastify.post('/evaluation/:sessionId/complete', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };

    try {
      const session = evaluationService.completeEvaluation(sessionId);
      return { session };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // Get evaluation history
  fastify.get('/evaluation/history', async (request, reply) => {
    const { userId = 'default', limit = 10 } = request.query as { userId?: string; limit?: number };

    try {
      const history = evaluationService.getEvaluationHistory(userId, Number(limit));
      return { history };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // Get questions by difficulty (for testing/debugging)
  fastify.get('/evaluation/questions/difficulty/:difficulty', async (request, reply) => {
    const { difficulty } = request.params as { difficulty: string };
    const questions = evaluationService.getQuestionsByDifficulty(parseInt(difficulty));
    return { questions };
  });

  // Get questions by concept
  fastify.get('/evaluation/questions/concept/:concept', async (request, reply) => {
    const { concept } = request.params as { concept: string };
    const questions = evaluationService.getQuestionsByConcept(concept);
    return { questions };
  });
}
