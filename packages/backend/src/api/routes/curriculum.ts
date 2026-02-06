import type { FastifyInstance } from 'fastify';
import { curriculumService } from '../../services/curriculum-service.js';

export async function curriculumRoutes(fastify: FastifyInstance) {
  // Get all topics
  fastify.get('/topics', async (request, reply) => {
    const topics = curriculumService.getAllTopics();
    return { topics };
  });

  // Get single topic
  fastify.get('/topics/:topicId', async (request, reply) => {
    const { topicId } = request.params as { topicId: string };
    const topic = curriculumService.getTopic(topicId);

    if (!topic) {
      return reply.code(404).send({ error: 'Topic not found' });
    }

    return { topic };
  });

  // Get topics by level
  fastify.get('/topics/level/:level', async (request, reply) => {
    const { level } = request.params as { level: string };
    const topics = curriculumService.getTopicsByLevel(parseInt(level));
    return { topics };
  });

  // Search topics
  fastify.get('/topics/search/:query', async (request, reply) => {
    const { query } = request.params as { query: string };
    const topics = curriculumService.searchTopics(query);
    return { topics };
  });

  // Get lessons for a topic
  fastify.get('/topics/:topicId/lessons', async (request, reply) => {
    const { topicId } = request.params as { topicId: string };
    const lessons = curriculumService.getLessonsForTopic(topicId);
    return { lessons };
  });

  // Get single lesson
  fastify.get('/lessons/:lessonId', async (request, reply) => {
    const { lessonId } = request.params as { lessonId: string };
    const lesson = curriculumService.getLesson(lessonId);

    if (!lesson) {
      return reply.code(404).send({ error: 'Lesson not found' });
    }

    return { lesson };
  });

  // Get exercises for a lesson
  fastify.get('/lessons/:lessonId/exercises', async (request, reply) => {
    const { lessonId } = request.params as { lessonId: string };
    const exercises = curriculumService.getExercisesForLesson(lessonId);
    return { exercises };
  });

  // Get single exercise
  fastify.get('/exercises/:exerciseId', async (request, reply) => {
    const { exerciseId } = request.params as { exerciseId: string };
    const exercise = curriculumService.getExercise(exerciseId);

    if (!exercise) {
      return reply.code(404).send({ error: 'Exercise not found' });
    }

    return { exercise };
  });

  // Get prerequisite chain for a topic
  fastify.get('/topics/:topicId/prerequisites', async (request, reply) => {
    const { topicId } = request.params as { topicId: string };
    const chain = curriculumService.getPrerequisiteChain(topicId);
    return { prerequisites: chain };
  });
}
