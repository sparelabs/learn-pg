import type { FastifyInstance } from 'fastify';
import { progressService } from '../../services/progress-service.js';

export async function progressRoutes(fastify: FastifyInstance) {
  // Get user progress
  fastify.get('/progress', async (request, reply) => {
    const progress = progressService.getUserProgress();
    return { progress };
  });

  // Update user progress
  fastify.patch('/progress', async (request, reply) => {
    const updates = request.body as any;

    try {
      progressService.updateUserProgress(updates);
      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // Get topic progress
  fastify.get('/progress/topics/:topicId?', async (request, reply) => {
    const { topicId } = request.params as { topicId?: string };
    const topicProgress = progressService.getTopicProgress(topicId);
    return { topicProgress };
  });

  // Update topic progress
  fastify.patch('/progress/topics/:topicId', async (request, reply) => {
    const { topicId } = request.params as { topicId: string };
    const updates = request.body as any;

    try {
      progressService.updateTopicProgress(topicId, updates);
      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // Get weak areas
  fastify.get('/progress/weak-areas', async (request, reply) => {
    const weakAreas = progressService.getWeakAreas();
    return { weakAreas };
  });

  // Start a session
  fastify.post('/progress/session/start', async (request, reply) => {
    const sessionId = progressService.startSession();
    return { sessionId };
  });

  // End a session
  fastify.post('/progress/session/:sessionId/end', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const updates = request.body as any;

    try {
      progressService.endSession(sessionId, updates);
      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // Update streak
  fastify.post('/progress/streak', async (request, reply) => {
    progressService.updateStreak();
    return { success: true };
  });

  // Get exercise attempts
  fastify.get('/progress/exercises/:exerciseId/attempts', async (request, reply) => {
    const { exerciseId } = request.params as { exerciseId: string };
    const attempts = progressService.getExerciseAttempts(exerciseId);
    return { attempts };
  });
}
