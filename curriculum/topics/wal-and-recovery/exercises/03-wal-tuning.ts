import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'sync-commit-off',
    lessonId: '',
    type: 'sql-query',
    title: 'Asynchronous Commit',
    prompt: 'Try asynchronous commit mode for faster inserts. Run: SET synchronous_commit = off; INSERT INTO wal_test SELECT i, \'data_\' || i FROM generate_series(1, 10000) i; SELECT count(*) FROM wal_test. The inserts return faster because PostgreSQL doesn\'t wait for WAL fsync on each commit.',
    setupSql: `
      DROP TABLE IF EXISTS wal_test;
      CREATE TABLE wal_test (
        id INTEGER,
        value TEXT
      );
    `,
    hints: [
      'SET synchronous_commit = off disables waiting for WAL flush',
      'Commits return as soon as WAL is in the buffer (memory)',
      'There\'s a tiny window where a crash could lose committed data'
    ],
    explanation: 'With synchronous_commit = off, PostgreSQL doesn\'t wait for WAL to be flushed to disk at commit time. This can dramatically improve INSERT-heavy workload throughput. The trade-off is a small window (typically < 10ms) where a crash could lose recently committed transactions. The database always remains consistent — you just might lose the last few commits.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['count']
          }
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'show-full-page-writes',
    lessonId: '',
    type: 'sql-query',
    title: 'Check Full Page Writes Setting',
    prompt: 'Check whether full_page_writes is enabled. When on, PostgreSQL writes complete 8KB page images to WAL after each checkpoint to protect against torn pages. Run: SHOW full_page_writes.',
    setupSql: '',
    hints: [
      'SHOW full_page_writes',
      'Default is "on" — should almost always stay on',
      'Turning it off is only safe if your filesystem guarantees atomic 8KB writes'
    ],
    explanation: 'full_page_writes protects against torn pages (partial page writes during a crash). When enabled, the first modification to any page after a checkpoint writes the full 8KB page image to WAL, providing a known-good copy for recovery. This increases WAL volume but is essential for data integrity on most filesystems.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 }
        }
      }
    },
    order: 2,
    difficulty: 1
  }
];
