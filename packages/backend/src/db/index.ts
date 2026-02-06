import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function initDatabase(dbPath: string = '../../data/progress.db'): Database.Database {
  if (db) {
    return db;
  }

  // Ensure directory exists
  const fullPath = resolve(__dirname, dbPath);
  const dir = dirname(fullPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(fullPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations
  const migrations = [
    '001_initial.sql',
    '002_evaluation.sql',
    '003_struggled_concepts.sql'
  ];

  for (const migration of migrations) {
    const sql = readFileSync(join(__dirname, 'migrations', migration), 'utf-8');
    db.exec(sql);
  }

  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
