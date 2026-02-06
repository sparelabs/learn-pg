# Learn PostgreSQL

An interactive, locally-runnable web application for learning PostgreSQL through hands-on exercises with real database instances.

## Features

- **Interactive Exercises**: Write SQL queries against real PostgreSQL databases
- **Adaptive Evaluation**: Skill assessment that adjusts to your level
- **Progress Tracking**: Track completed lessons, skill rating, and learning streaks
- **Personalized Learning**: Get recommendations based on your weak areas
- **Offline-Ready**: Works locally after initial setup

## Prerequisites

- Node.js 18 or higher
- Docker Desktop
- 2GB free disk space

## Quick Start

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd learn-pg
   npm run setup
   ```

   The setup script will:
   - Install all dependencies
   - Build the PostgreSQL Docker image
   - Start the PostgreSQL container
   - Initialize the database

2. **Start the Application**
   ```bash
   npm start
   ```

   This will start both the backend (port 3000) and frontend (port 5173).

3. **Open Your Browser**
   ```
   http://localhost:5173
   ```

## Project Structure

```
learn-pg/
├── packages/
│   ├── shared/          # Shared TypeScript types
│   ├── backend/         # API server (Fastify + Node.js)
│   └── frontend/        # Web UI (React + Vite)
├── curriculum/
│   ├── topics/          # Lesson content and exercises
│   ├── evaluation/      # Evaluation question banks
│   └── OUTLINE.md       # Curriculum structure
├── docker/              # PostgreSQL configuration
├── scripts/             # Setup and utility scripts
└── data/                # SQLite database (created on first run)
```

## Available Scripts

- `npm start` - Start development servers
- `npm run setup` - Initial setup (run once)
- `npm run reset-progress` - Clear user progress
- `npm run reset-db` - Reset PostgreSQL database
- `npm run build` - Build for production
- `npm run typecheck` - Check TypeScript types

## Using the Application

### Learning Path

1. **Browse Topics**: View all available topics organized by difficulty level
2. **Read Lessons**: Learn concepts through clear, structured lessons
3. **Complete Exercises**: Practice with hands-on SQL exercises
4. **Get Feedback**: Receive instant validation and helpful suggestions
5. **Track Progress**: Monitor your skill level and completed exercises

### Skill Evaluation

- Take adaptive evaluations to assess your skill level
- Questions adjust difficulty based on your performance
- Get personalized weak area identification
- Track skill rating from 1 (Fledgling DBA) to 10 (Vacuum Philosopher)

### Progress Dashboard

- View completed exercises and time spent
- See your current skill level and streak
- Review weak areas that need improvement
- Get recommended lessons based on your performance

## Curriculum Structure

The curriculum is organized into 5 levels:

1. **Level 1**: Foundational Topics (basics, data types, simple queries)
2. **Level 2**: Advanced Query Topics (CTEs, window functions, subqueries)
3. **Level 3**: Query Planner & Optimization (EXPLAIN, statistics, optimization)
4. **Level 4**: Operational Health & Performance (monitoring, indexes, tuning)
5. **Level 5**: Advanced Topics (partitioning, replication, extensions)

## Creating Custom Content

See [CURRICULUM_GUIDE.md](CURRICULUM_GUIDE.md) for instructions on adding new topics, lessons, and exercises.

## Architecture

See [CLAUDE.md](CLAUDE.md) for a detailed architectural overview.

## API Documentation

### Curriculum Endpoints

- `GET /api/curriculum/topics` - Get all topics
- `GET /api/curriculum/topics/:topicId` - Get specific topic
- `GET /api/curriculum/lessons/:lessonId` - Get lesson content
- `GET /api/curriculum/lessons/:lessonId/exercises` - Get exercises for a lesson

### Exercise Endpoints

- `POST /api/exercises/:exerciseId/setup` - Initialize exercise environment
- `POST /api/exercises/:exerciseId/submit` - Submit SQL query for validation
- `GET /api/exercises/:exerciseId/hints` - Get hints for an exercise

### Progress Endpoints

- `GET /api/progress` - Get user progress
- `PATCH /api/progress` - Update user progress
- `GET /api/progress/weak-areas` - Get identified weak areas

### Evaluation Endpoints

- `POST /api/evaluation/start` - Start new evaluation session
- `GET /api/evaluation/:sessionId/next` - Get next question
- `POST /api/evaluation/:sessionId/answer` - Submit answer
- `POST /api/evaluation/:sessionId/complete` - Complete evaluation

## Troubleshooting

### Docker Issues

**Container won't start**:
```bash
docker-compose -f docker/docker-compose.yml logs
```

**Reset container**:
```bash
npm run reset-db
```

### Database Issues

**Progress not saving**:
Check that `data/` directory exists and is writable.

**PostgreSQL connection errors**:
Ensure Docker is running and container is healthy:
```bash
docker ps
docker exec learn-pg-postgres pg_isready -U learnpg
```

### Port Conflicts

If ports 3000 or 5173 are in use, you can change them:
- Backend: Set `PORT` environment variable
- Frontend: Edit `vite.config.ts`

## Development

### Tech Stack

- **Frontend**: React 18, TypeScript, TailwindCSS, React Query, Monaco Editor
- **Backend**: Node.js, Fastify, TypeScript
- **Databases**: SQLite (progress), PostgreSQL 16 (exercises)
- **DevOps**: Docker, Docker Compose

### Running Tests

```bash
npm test --workspaces
```

### Building for Production

```bash
npm run build
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review TROUBLESHOOTING.md for common problems

## Roadmap

- [ ] Additional curriculum topics (advanced optimization, replication)
- [ ] More exercise types (schema design, query debugging)
- [ ] Visual query plan explorer
- [ ] Learning analytics and insights
- [ ] Multi-user support
- [ ] Export/import progress
