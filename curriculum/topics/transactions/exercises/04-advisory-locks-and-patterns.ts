import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'advisory-lock-basic',
    lessonId: '',
    type: 'sql-query',
    title: 'Acquire and View Advisory Lock',
    prompt: 'Acquire an advisory lock, verify it appears in pg_locks, then release it. Run: SELECT pg_advisory_lock(42); SELECT locktype, objid, mode, granted FROM pg_locks WHERE locktype = \'advisory\'; SELECT pg_advisory_unlock(42);',
    setupSql: '',
    hints: [
      'pg_advisory_lock(42) acquires a session-level lock with key 42',
      'pg_locks WHERE locktype = \'advisory\' shows advisory locks',
      'pg_advisory_unlock(42) releases the lock'
    ],
    explanation: 'Advisory locks appear in pg_locks just like regular locks. The objid column shows the lock key (42 in this case). Advisory locks are held by the session (connection), not by a specific transaction. They\'re invisible to MVCC — they only affect other sessions trying to acquire the same advisory lock.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['locktype', 'mode', 'granted']
          }
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'try-advisory-lock',
    lessonId: '',
    type: 'sql-query',
    title: 'Non-Blocking Advisory Lock',
    prompt: 'Use the non-blocking variant pg_try_advisory_lock() which returns true if the lock was acquired, false if it\'s already held by another session. Run: SELECT pg_try_advisory_lock(42) AS acquired; then SELECT pg_advisory_unlock(42);',
    setupSql: '',
    hints: [
      'pg_try_advisory_lock returns true (acquired) or false (already held)',
      'Since no other session holds lock 42, it should return true',
      'Always unlock when done: pg_advisory_unlock(42)'
    ],
    explanation: 'pg_try_advisory_lock is the non-blocking variant — it returns immediately with true or false instead of waiting. This is the pattern for singleton job execution: try to acquire the lock, and if false, another instance is already running so exit gracefully. In this case it returns true because no other session holds lock 42.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['acquired']
          }
        }
      }
    },
    order: 2,
    difficulty: 2
  }
];
