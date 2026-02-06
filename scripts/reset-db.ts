#!/usr/bin/env tsx

import { execSync } from 'child_process';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query: string): Promise<string> => {
  return new Promise(resolve => {
    rl.question(query, resolve);
  });
};

async function main() {
  console.log('⚠️  This will reset the PostgreSQL database to a clean state\n');
  console.log('All exercise data and schemas will be deleted\n');

  const answer = await question('Are you sure? (yes/no): ');

  if (answer.toLowerCase() !== 'yes') {
    console.log('Cancelled');
    rl.close();
    return;
  }

  console.log('\n🗑️  Stopping and removing PostgreSQL container...');
  try {
    execSync('docker-compose -f docker/docker-compose.yml down -v', { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to stop container');
  }

  console.log('\n🚀 Starting fresh PostgreSQL container...');
  try {
    execSync('docker-compose -f docker/docker-compose.yml up -d', { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to start container');
    rl.close();
    process.exit(1);
  }

  console.log('\n⏳ Waiting for PostgreSQL to be ready...');
  let attempts = 0;
  while (attempts < 30) {
    try {
      execSync('docker exec learn-pg-postgres pg_isready -U learnpg', { stdio: 'pipe' });
      console.log('✓ PostgreSQL is ready');
      break;
    } catch {
      attempts++;
      process.stdout.write('.');
      execSync('sleep 1', { stdio: 'pipe' });
    }
  }

  console.log('\n\n✅ Database reset complete\n');
  rl.close();
}

main();
