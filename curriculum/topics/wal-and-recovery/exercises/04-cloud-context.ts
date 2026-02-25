import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'pitr-lsn-tracking',
    lessonId: '',
    type: 'sql-query',
    title: 'Track LSN Changes for PITR',
    prompt: 'Demonstrate the concept behind Point-in-Time Recovery by tracking WAL LSN positions before and after data changes. Run: SELECT pg_current_wal_lsn() AS lsn_before; then INSERT INTO pitr_demo VALUES (1, \'important data\'); then SELECT pg_current_wal_lsn() AS lsn_after. The WAL between these two LSNs contains the INSERT — PITR could recover to any point between them.',
    setupSql: `
      DROP TABLE IF EXISTS pitr_demo;
      CREATE TABLE pitr_demo (
        id INTEGER,
        data TEXT
      );
    `,
    hints: [
      'First: SELECT pg_current_wal_lsn() AS lsn_before',
      'Then: INSERT INTO pitr_demo VALUES (1, \'important data\')',
      'Finally: SELECT pg_current_wal_lsn() AS lsn_after',
      'The two LSNs should be different — the INSERT advanced the WAL position'
    ],
    explanation: 'Point-in-Time Recovery works by replaying WAL records from a base backup up to a specified LSN or timestamp. By tracking LSN positions before and after changes, you can understand exactly what the WAL contains. In cloud-managed databases, you specify a timestamp and the service handles the base backup + WAL replay automatically.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 }
        }
      }
    },
    order: 1,
    difficulty: 2
  }
];
