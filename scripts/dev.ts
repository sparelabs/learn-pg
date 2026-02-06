#!/usr/bin/env tsx

import { spawn } from 'child_process';
import { existsSync } from 'fs';

console.log('🚀 Starting Learn PostgreSQL in development mode\n');

// Check if setup has been run
if (!existsSync('./data')) {
  console.error('❌ Please run setup first: npm run setup');
  process.exit(1);
}

// Check if PostgreSQL is running
try {
  const { execSync } = await import('child_process');
  execSync('docker exec learn-pg-postgres pg_isready -U learnpg', { stdio: 'pipe' });
} catch {
  console.log('⚠️  PostgreSQL container is not running. Starting it...');
  const { execSync } = await import('child_process');
  execSync('docker-compose -f docker/docker-compose.yml up -d', { stdio: 'inherit' });
  console.log('✓ PostgreSQL started\n');
}

// Start backend
console.log('🔧 Starting backend...');
const backend = spawn('npm', ['run', 'dev', '--workspace=@learn-pg/backend'], {
  stdio: 'inherit',
  shell: true
});

// Wait a bit for backend to start
await new Promise(resolve => setTimeout(resolve, 2000));

// Start frontend
console.log('🎨 Starting frontend...');
const frontend = spawn('npm', ['run', 'dev', '--workspace=@learn-pg/frontend'], {
  stdio: 'inherit',
  shell: true
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down...');
  backend.kill();
  frontend.kill();
  process.exit(0);
});

console.log('\n✅ Development servers starting...\n');
console.log('Frontend: http://localhost:5173');
console.log('Backend:  http://localhost:3000');
console.log('\nPress Ctrl+C to stop\n');
