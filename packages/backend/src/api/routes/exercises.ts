import type { FastifyInstance } from 'fastify';
import type { MultiSessionExercise } from '@learn-pg/shared';
import { exerciseService } from '../../services/exercise-service.js';
import { progressService } from '../../services/progress-service.js';
import { curriculumService } from '../../services/curriculum-service.js';
import { sessionManager } from '../../services/session-manager.js';

export async function exercisesRoutes(fastify: FastifyInstance) {
  // Setup an exercise
  fastify.post('/exercises/:exerciseId/setup', async (request, reply) => {
    const { exerciseId } = request.params as { exerciseId: string };

    try {
      await exerciseService.setupExercise(exerciseId);
      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // Submit and validate exercise solution
  fastify.post('/exercises/:exerciseId/submit', async (request, reply) => {
    const { exerciseId } = request.params as { exerciseId: string };
    const { query } = request.body as { query: string };

    if (!query || typeof query !== 'string') {
      return reply.code(400).send({ error: 'Query is required' });
    }

    try {
      // Get previous attempts to determine attempt number
      const attempts = progressService.getExerciseAttempts(exerciseId);
      const attemptNumber = attempts.length + 1;

      // Validate the solution
      const result = await exerciseService.validateExercise(exerciseId, query);

      // Record the attempt
      progressService.recordExerciseAttempt({
        exerciseId,
        submittedQuery: query,
        isCorrect: result.isValid,
        feedback: JSON.stringify({ ...result }),
        executionTimeMs: result.executionTimeMs,
        hintsUsed: 0, // Track this from frontend
        attemptNumber
      });

      // If incorrect and multiple attempts, record as struggled
      if (!result.isValid && attemptNumber >= 2) {
        const exercise = curriculumService.getExercise(exerciseId);
        if (exercise) {
          const topicId = exercise.lessonId.split('-')[0];
          progressService.recordStruggledConcept('general', topicId, exerciseId);
        }
      }

      // If correct, update topic progress
      if (result.isValid) {
        const exercise = curriculumService.getExercise(exerciseId);
        if (exercise) {
          const lesson = curriculumService.getLesson(exercise.lessonId);
          if (lesson) {
            const topicProgress = progressService.getTopicProgress(lesson.topicId);
            const current = topicProgress[0] || {
              topicId: lesson.topicId,
              status: 'in-progress' as const,
              completedLessons: [],
              completedExercises: [],
              struggledExercises: [],
              masteryLevel: 0
            };

            if (!current.completedExercises.includes(exerciseId)) {
              current.completedExercises.push(exerciseId);
            }

            // Check if all exercises in lesson are complete
            const lessonExercises = curriculumService.getExercisesForLesson(exercise.lessonId);
            const allComplete = lessonExercises.every(ex =>
              current.completedExercises.includes(ex.id)
            );

            if (allComplete && !current.completedLessons.includes(exercise.lessonId)) {
              current.completedLessons.push(exercise.lessonId);
            }

            progressService.updateTopicProgress(lesson.topicId, current);
          }
        }
      }

      return { result };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // Get hints for an exercise
  fastify.get('/exercises/:exerciseId/hints', async (request, reply) => {
    const { exerciseId } = request.params as { exerciseId: string };
    const { count = 1 } = request.query as { count?: number };

    const exercise = curriculumService.getExercise(exerciseId);
    if (!exercise) {
      return reply.code(404).send({ error: 'Exercise not found' });
    }

    const hints = exercise.hints.slice(0, Number(count));
    return { hints };
  });

  // Get all completed exercise IDs
  fastify.get('/exercises/completed', async (request, reply) => {
    const completedIds = progressService.getCompletedExerciseIds();
    return { completedIds };
  });

  // Get exercise attempts history
  fastify.get('/exercises/:exerciseId/attempts', async (request, reply) => {
    const { exerciseId } = request.params as { exerciseId: string };
    const attempts = progressService.getExerciseAttempts(exerciseId);
    return { attempts };
  });

  // Get explanation for an exercise
  fastify.get('/exercises/:exerciseId/explanation', async (request, reply) => {
    const { exerciseId } = request.params as { exerciseId: string };
    const exercise = curriculumService.getExercise(exerciseId);

    if (!exercise) {
      return reply.code(404).send({ error: 'Exercise not found' });
    }

    return { explanation: exercise.explanation };
  });

  // --- Multi-session exercise routes ---

  // Start a multi-session exercise — creates persistent connection pair
  fastify.post('/exercises/:exerciseId/start-session', async (request, reply) => {
    const { exerciseId } = request.params as { exerciseId: string };

    try {
      const exercise = curriculumService.getExercise(exerciseId);
      if (!exercise || exercise.type !== 'multi-session') {
        return reply.code(400).send({ error: 'Not a multi-session exercise' });
      }

      // Setup the exercise environment first
      await exerciseService.setupExercise(exerciseId);

      const schema = exerciseService.getSchemaForExercise(exerciseId);
      const sessionId = await sessionManager.createSessionPair(
        exerciseId, schema, exercise.requiresSuperuser ?? false
      );

      return { sessionId };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // Execute query on a specific session (A or B)
  fastify.post('/exercises/:exerciseId/session/:sessionId/execute', async (request, reply) => {
    const { exerciseId, sessionId } = request.params as { exerciseId: string; sessionId: string };
    const { query, session, stepIndex } = request.body as {
      query: string;
      session: 'A' | 'B';
      stepIndex: number;
    };

    if (!query || typeof query !== 'string') {
      return reply.code(400).send({ error: 'Query is required' });
    }

    if (session !== 'A' && session !== 'B') {
      return reply.code(400).send({ error: 'Session must be A or B' });
    }

    try {
      const result = await sessionManager.executeOnSession(sessionId, session, query);

      // Optionally validate if the step has validation config
      const exercise = curriculumService.getExercise(exerciseId) as MultiSessionExercise | undefined;
      let validationResult = null;
      if (exercise?.steps?.[stepIndex]?.validation) {
        const stepValidation = exercise.steps[stepIndex].validation!;
        validationResult = await exerciseService.validateStepResult(stepValidation, result);
      }

      return {
        queryResults: { rows: result.rows, rowCount: result.rowCount ?? result.rows?.length ?? 0 },
        validationResult
      };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // Close session pair when exercise is done
  fastify.post('/exercises/:exerciseId/session/:sessionId/close', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };

    try {
      await sessionManager.closeSessionPair(sessionId);
      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });
}
