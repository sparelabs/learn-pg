import Fastify from 'fastify';
import cors from '@fastify/cors';
import { initDatabase } from './db/index.js';
import { dockerService } from './services/docker-service.js';
import { curriculumService } from './services/curriculum-service.js';
import { evaluationService } from './services/evaluation-service.js';
import { curriculumRoutes } from './api/routes/curriculum.js';
import { exercisesRoutes } from './api/routes/exercises.js';
import { evaluationRoutes } from './api/routes/evaluation.js';
import { progressRoutes } from './api/routes/progress.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

async function start() {
  const fastify = Fastify({
    logger: true
  });

  // Enable CORS
  await fastify.register(cors, {
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true
  });

  // Health check
  fastify.get('/health', async () => {
    const dockerRunning = await dockerService.isDockerRunning();
    const containerRunning = await dockerService.isContainerRunning();

    return {
      status: 'ok',
      docker: dockerRunning,
      postgres: containerRunning,
      timestamp: new Date().toISOString()
    };
  });

  // Register API routes
  fastify.register(curriculumRoutes, { prefix: '/api/curriculum' });
  fastify.register(exercisesRoutes, { prefix: '/api' });
  fastify.register(evaluationRoutes, { prefix: '/api' });
  fastify.register(progressRoutes, { prefix: '/api' });

  try {
    // Initialize database
    console.log('Initializing SQLite database...');
    initDatabase();
    console.log('Database initialized');

    // Check Docker status
    console.log('Checking Docker status...');
    const dockerRunning = await dockerService.isDockerRunning();
    if (!dockerRunning) {
      console.warn('Docker is not running. Some features will not work.');
    } else {
      const containerRunning = await dockerService.isContainerRunning();
      if (!containerRunning) {
        console.log('PostgreSQL container not running. Start it with: docker-compose up -d');
      } else {
        console.log('PostgreSQL container is running');
      }
    }

    // Load curriculum
    console.log('Loading curriculum...');
    await curriculumService.loadCurriculum();
    const topics = curriculumService.getAllTopics();
    console.log(`Loaded ${topics.length} topics`);

    // Load evaluation questions
    console.log('Loading evaluation questions...');
    await evaluationService.loadQuestionBank();
    const questions = evaluationService.getQuestionBank();
    console.log(`Loaded ${questions.length} evaluation questions`);

    // Start server
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server listening on http://localhost:${PORT}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
