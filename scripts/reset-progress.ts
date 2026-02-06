#!/usr/bin/env tsx

import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
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
  console.log('⚠️  This will delete all user progress data\n');

  const answer = await question('Are you sure you want to reset progress? (yes/no): ');

  if (answer.toLowerCase() !== 'yes') {
    console.log('Cancelled');
    rl.close();
    return;
  }

  const dbPath = join(process.cwd(), 'data', 'progress.db');

  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
    console.log('✓ Progress database deleted');
  } else {
    console.log('ℹ No progress database found');
  }

  console.log('\n✅ Progress reset complete');
  console.log('The database will be recreated on next start\n');

  rl.close();
}

main();
