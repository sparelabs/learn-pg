#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

console.log('🚀 Learn PostgreSQL Setup\n');

// Check Node version
console.log('📦 Checking Node.js version...');
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
if (majorVersion < 18) {
  console.error('❌ Node.js 18 or higher is required');
  process.exit(1);
}
console.log(`✓ Node.js ${nodeVersion}\n`);

// Check Docker
console.log('🐳 Checking Docker...');
try {
  execSync('docker --version', { stdio: 'pipe' });
  console.log('✓ Docker is installed\n');
} catch {
  console.error('❌ Docker is not installed or not in PATH');
  console.error('Please install Docker Desktop from https://docker.com');
  process.exit(1);
}

// Check if Docker is running
try {
  execSync('docker ps', { stdio: 'pipe' });
  console.log('✓ Docker is running\n');
} catch {
  console.error('❌ Docker is not running');
  console.error('Please start Docker Desktop');
  process.exit(1);
}

// Install dependencies
console.log('📥 Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log('✓ Dependencies installed\n');
} catch (error) {
  console.error('❌ Failed to install dependencies');
  process.exit(1);
}

// Create data directory
console.log('📁 Creating data directories...');
const dataDir = join(process.cwd(), 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}
console.log('✓ Data directory created\n');

// Build Docker image
console.log('🏗️  Building PostgreSQL Docker image...');
try {
  execSync('docker compose -f docker/docker-compose.yml build', { stdio: 'inherit' });
  console.log('✓ Docker image built\n');
} catch (error) {
  console.error('❌ Failed to build Docker image');
  process.exit(1);
}

// Start PostgreSQL container
console.log('🚀 Starting PostgreSQL container...');
try {
  execSync('docker compose -f docker/docker-compose.yml up -d', { stdio: 'inherit' });
  console.log('✓ PostgreSQL container started\n');
} catch (error) {
  console.error('❌ Failed to start PostgreSQL container');
  process.exit(1);
}

// Wait for PostgreSQL to be ready
console.log('⏳ Waiting for PostgreSQL to be ready...');
let attempts = 0;
const maxAttempts = 30;
while (attempts < maxAttempts) {
  try {
    execSync(
      'docker exec learn-pg-postgres pg_isready -U learnpg',
      { stdio: 'pipe' }
    );
    console.log('✓ PostgreSQL is ready\n');
    break;
  } catch {
    attempts++;
    if (attempts >= maxAttempts) {
      console.error('❌ PostgreSQL failed to start in time');
      process.exit(1);
    }
    process.stdout.write('.');
    execSync('sleep 1', { stdio: 'pipe' });
  }
}

console.log('\n✅ Setup complete!\n');
console.log('To start the application, run:');
console.log('  npm start\n');
console.log('The application will be available at:');
console.log('  Frontend: http://localhost:5173');
console.log('  Backend:  http://localhost:3000\n');
