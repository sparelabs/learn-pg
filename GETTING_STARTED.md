# Getting Started with Learn PostgreSQL

## Quick Setup

Follow these steps to get the application running:

### 1. Prerequisites Check

Ensure you have:
- **Node.js 18+**: Run `node --version`
- **Docker Desktop**: Running and accessible
- **2GB free disk space**

### 2. Installation

```bash
# Install dependencies
npm install

# Run setup (builds Docker, starts PostgreSQL)
npm run setup
```

The setup process will:
- Install all npm dependencies
- Build the custom PostgreSQL Docker image
- Start the PostgreSQL container
- Wait for the database to be ready

### 3. Start Development

```bash
# Start both backend and frontend
npm start
```

This opens:
- **Frontend**: http://localhost:5173 (React app)
- **Backend**: http://localhost:3000 (API server)

### 4. Verify Everything Works

1. Open http://localhost:5173
2. You should see the Learn PostgreSQL homepage
3. Click "Browse Topics" to see available content
4. Try the first lesson and exercise

## Project Structure

```
learn-pg/
├── packages/
│   ├── shared/          # TypeScript types (shared)
│   ├── backend/         # API server (port 3000)
│   └── frontend/        # React UI (port 5173)
├── curriculum/
│   ├── topics/          # Lessons and exercises
│   ├── evaluation/      # Assessment questions
│   └── OUTLINE.md       # Full curriculum plan
├── docker/              # PostgreSQL setup
├── scripts/             # Utility scripts
├── data/                # SQLite database (created automatically)
├── CLAUDE.md            # Architecture guide
├── README.md            # Full documentation
└── CURRICULUM_GUIDE.md  # Content authoring guide
```

## Key Commands

```bash
# Development
npm start              # Start dev servers
npm run setup          # Initial setup

# Maintenance
npm run reset-progress # Clear user data
npm run reset-db       # Reset PostgreSQL

# Building
npm run build          # Production build
npm run typecheck      # Check TypeScript
```

## Common Issues

### Docker not running
```bash
# Start Docker Desktop first, then:
docker ps
```

### Port already in use
If ports 3000 or 5173 are taken:
- Backend: Set `PORT=3001` environment variable
- Frontend: Edit `vite.config.ts`

### PostgreSQL container not starting
```bash
# Check logs
docker-compose -f docker/docker-compose.yml logs

# Rebuild
docker-compose -f docker/docker-compose.yml down -v
npm run setup
```

### Dependencies not installing
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Next Steps

1. **Explore Curriculum**: Check `curriculum/OUTLINE.md` for the full learning path
2. **Try an Exercise**: Complete the first lesson in PostgreSQL Basics
3. **Take an Evaluation**: Test your current skill level
4. **Add Content**: Read `CURRICULUM_GUIDE.md` to create new lessons
5. **Review Architecture**: See `CLAUDE.md` for technical details

## Development Workflow

### Adding New Content

1. Create topic directory in `curriculum/topics/`
2. Add `meta.json`, lesson markdown, and exercise TypeScript
3. Restart backend to load new content

### Making Code Changes

- **Backend**: Hot reloads automatically (tsx watch mode)
- **Frontend**: Hot Module Replacement via Vite
- **Shared types**: Restart both servers after changes

### Testing Exercises

1. Write exercise definition
2. Start the application
3. Navigate to the lesson
4. Test with correct and incorrect queries
5. Verify feedback is helpful

## Learning the System

### For Users
1. Start with Level 1: PostgreSQL Basics
2. Complete exercises in order
3. Take evaluations to track progress
4. Review weak areas and practice

### For Content Authors
1. Read `CURRICULUM_GUIDE.md`
2. Study existing topics as examples
3. Create test content in a new topic
4. Verify exercises work correctly

### For Developers
1. Read `CLAUDE.md` for architecture
2. Explore the shared types in `packages/shared/src/types/`
3. Review service implementations in `packages/backend/src/services/`
4. Understand the React component structure

## Support

- **Issues**: Open a GitHub issue
- **Questions**: Check existing documentation
- **Contributions**: Fork, branch, and submit PR

## What's Implemented

### Core Features ✅
- Monorepo structure with TypeScript
- Backend API with Fastify
- Frontend UI with React
- PostgreSQL Docker environment
- SQLite progress tracking
- Curriculum system (topics, lessons, exercises)
- Exercise validation (multiple strategies)
- Adaptive evaluation system
- Progress tracking and analytics

### Sample Content ✅
- Curriculum outline (all topics planned)
- PostgreSQL Basics topic
- Introduction lesson with exercises
- Sample evaluation questions

### Documentation ✅
- README with full instructions
- CLAUDE.md architectural guide
- CURRICULUM_GUIDE.md for content authors
- Setup and utility scripts

## What's Next

To complete the platform:

1. **Expand Curriculum**: Add more topics from the outline
2. **More Exercises**: Create diverse exercise types
3. **Question Bank**: Add 50-100 evaluation questions
4. **Testing**: Add automated tests
5. **Polish**: UI improvements, error handling

This foundation is ready for content development and feature expansion!
