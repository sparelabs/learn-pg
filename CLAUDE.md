# Learn PostgreSQL - Architecture Guide

This document provides a high-level architectural overview of the Learn PostgreSQL platform for future Claude instances working on this codebase.

## System Overview

**Purpose**: An interactive, locally-runnable web application for teaching PostgreSQL concepts through hands-on exercises with real PostgreSQL instances.

**Target Users**: Developers who want to learn PostgreSQL through practical, interactive exercises rather than passive reading.

**Core Value**: Hands-on learning with actual PostgreSQL query execution, dynamic evaluation of skills, and personalized learning paths based on performance.

## Architecture Overview

The application uses a three-tier architecture:

1. **Frontend**: React-based web UI for browsing curriculum, completing exercises, and taking evaluations
2. **Backend**: Node.js/Fastify API server that coordinates between the curriculum, user progress, and PostgreSQL
3. **Databases**:
   - SQLite for user progress and state (embedded, zero-config)
   - Dockerized PostgreSQL for interactive exercise execution

**Monorepo Structure**:
```
packages/
  shared/      - TypeScript types shared between frontend and backend
  backend/     - API server and services
  frontend/    - React UI
curriculum/    - Markdown lessons and TypeScript exercise definitions
docker/        - PostgreSQL configuration
scripts/       - Setup and utility scripts
```

## Key Subsystems

### Curriculum System

**Organization**: Content is organized hierarchically as Topics → Lessons → Exercises

**Storage**:
- Lessons are Markdown files with frontmatter metadata
- Exercise definitions are TypeScript modules exporting exercise configurations
- Topics have JSON metadata files describing prerequisites and difficulty

**Loading**: The curriculum service reads the filesystem at startup to build an in-memory representation of all available content.

**Topic Dependencies**: Topics can specify prerequisites, allowing the system to suggest a learning order and prevent users from jumping too far ahead.

### Exercise System

**Execution Flow**:
1. Each exercise has setup SQL that creates necessary tables/data
2. User submits a SQL query
3. Backend executes query against isolated Docker PostgreSQL instance
4. Results are validated against exercise validation rules
5. Feedback is generated based on correctness

**Validation Strategies**:
- **Result Matching**: Compare query output (row count, columns, values) against expected results
- **Query Plan Analysis**: Use EXPLAIN to verify the query uses appropriate indexes/scan methods
- **Performance**: Ensure query completes within time thresholds
- **Schema Validation**: Verify created tables, indexes, constraints match requirements

**Safety**: Queries run in isolated schemas with timeouts and resource limits to prevent runaway queries.

**Isolation**: Each exercise can run in its own schema, which is reset between attempts.

### Evaluation System

**Purpose**: Adaptive skill assessment that adjusts question difficulty based on performance.

**Question Bank**: Multiple-choice, SQL writing, EXPLAIN interpretation, performance analysis, and scenario-based questions organized by difficulty (1-10) and concept.

**Adaptive Algorithm**:
- Starts at user's current skill level
- After consecutive correct answers, increases difficulty
- After consecutive incorrect answers, decreases difficulty
- Targets weak areas identified from past performance
- Uses Elo-like rating calculation with time bonuses

**Skill Levels**: 10 thematic skill levels from "Fledgling DBA" to "Vacuum Philosopher", each with an emoji indicator.

**Weak Area Detection**: Tracks concepts where users struggle (< 50% accuracy) and surfaces them for review.

### Progress Tracking

**SQLite Schema**:
- User progress (skill rating, streak, time spent)
- Topic progress (completed lessons/exercises, mastery level)
- Exercise attempts (query submitted, correctness, feedback)
- Evaluation sessions (questions answered, skill changes)
- Struggled concepts (areas needing improvement)
- Weak areas (aggregated failure rates)

**Persistence**: All progress persists across sessions via SQLite database file.

**Session Tracking**: Records what users viewed/completed in each session for analytics.

## Data Flow

### User Journey Through a Lesson

1. User browses topics and selects one
2. User opens a lesson and reads the content
3. User starts an exercise
4. Backend sets up exercise environment (creates tables/data in PostgreSQL)
5. User writes SQL query
6. Frontend sends query to backend
7. Backend executes query in PostgreSQL
8. Backend validates result against exercise rules
9. Backend generates feedback
10. Frontend displays feedback to user
11. If correct, progress is updated in SQLite

### Exercise Execution Flow

```
Submit Query → Validate Input → Setup Exercise → Execute Against PostgreSQL →
Validate Results → Generate Feedback → Record Attempt → Update Progress → Return to User
```

### Evaluation Flow

```
Start Evaluation → Adaptive Selection (based on skill/weak areas) →
Present Question → User Answers → Check Correctness → Adjust Difficulty →
Record Response → Update Question Metadata → Select Next Question →
... → Complete Evaluation → Calculate Final Skill → Identify Weak Areas → Update User Progress
```

## Technology Choices & Rationale

**Why Dual Databases?**
- SQLite: Perfect for user state (simple, embedded, single file for backup)
- PostgreSQL: Necessary for teaching PostgreSQL (can't fake it)

**Why Docker?**
- Isolation from host system
- Easy reset between exercises
- Version control and reproducibility
- Safety (containerized execution)

**Why React?**
- Best ecosystem for code editors (Monaco)
- Rich component library for data visualization
- Strong TypeScript support

**Why Markdown for Lessons?**
- Easy for content authors to write
- Version control friendly
- Widely supported formatting
- Can be rendered consistently

## Extension Points

### Adding New Topics/Lessons

1. Create directory under `curriculum/topics/`
2. Add `meta.json` with topic metadata
3. Create `lessons/` subdirectory with Markdown files
4. Add frontmatter to each lesson file
5. Create corresponding exercise files in `exercises/`

### Creating New Exercise Types

1. Define new type in shared types (`curriculum.ts`)
2. Add validation logic in `exercise-service.ts`
3. Implement validation strategy if needed
4. Update frontend to handle new exercise type display

### Adding Validation Strategies

1. Define validation rules interface in `validators.ts`
2. Implement validation logic in `exercise-service.ts`
3. Add feedback generation for new validation type

### Extending the Question Bank

1. Create JSON file in `curriculum/evaluation/`
2. Follow question type interfaces from `evaluation.ts`
3. Include metadata for IRT parameters
4. Tag with appropriate concepts for weak area targeting

## Design Patterns

**Shared Types**: TypeScript interfaces defined once in `shared` package, used by both frontend and backend for type safety.

**Service-Based Backend**: Each major concern (curriculum, exercises, evaluation, progress) has its own service module.

**React Query for Server State**: Frontend uses TanStack Query for all API communication, providing caching and optimistic updates.

**Exercise Validation Pipeline**: Validation follows a strategy pattern with different validators for different validation types.

## Important Conventions

**File Naming**:
- Topic directories: `NN-topic-name` (e.g., `01-basics`)
- Lesson files: `NN-lesson-name.md` (e.g., `01-introduction.md`)
- Exercise files: Match lesson filename but `.ts` extension

**ID Format**:
- Topic ID: directory name without number (e.g., `basics`)
- Lesson ID: `topicId-lessonFileName` (e.g., `basics-01-introduction`)
- Exercise ID: `lessonId-exerciseId` (e.g., `basics-01-introduction-version-check`)

**Database Tables**: Snake case (e.g., `user_progress`, `exercise_attempts`)

**API Routes**: RESTful structure under `/api/` prefix (e.g., `/api/curriculum/topics`, `/api/exercises/:id/submit`)

## Development Workflow

**Setup**: Run `npm run setup` to install dependencies, build Docker image, and start PostgreSQL.

**Development**: Run `npm start` to launch both frontend and backend in watch mode.

**Reset**: Use `npm run reset-progress` to clear user data or `npm run reset-db` to reset PostgreSQL.

## Key Design Principles

1. **Real PostgreSQL**: Never fake PostgreSQL behavior - always execute against actual instances
2. **Immediate Feedback**: Users get instant feedback on exercise submissions
3. **Progressive Disclosure**: Start simple, gradually introduce complexity
4. **Adaptive Learning**: System adjusts to user's skill level
5. **Offline First**: After initial setup, works without internet connection
6. **Type Safety**: Shared types ensure frontend/backend stay in sync
