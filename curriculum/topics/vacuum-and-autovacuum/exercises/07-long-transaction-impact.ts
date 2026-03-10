import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'long-txn-blocks-vacuum',
    lessonId: '',
    type: 'sql-query',
    title: 'See How Dead Tuples Persist After VACUUM',
    prompt:
      'A table called `vacuum_test` has been created and all its rows have been updated, generating dead tuples. VACUUM has already been run. Check the dead tuple count in `pg_stat_user_tables` to confirm that VACUUM was able to clean up.\n\nIn a real production scenario, if a long-running transaction were open during the UPDATE, VACUUM would NOT be able to remove those dead tuples — they would still appear in n_dead_tup. The key insight is: VACUUM can only remove tuples that no active transaction needs to see.\n\nQuery `pg_stat_user_tables` and return `relname`, `n_dead_tup`, `n_live_tup`, and `last_vacuum` for the `vacuum_test` table.',
    setupSql: `
      DROP TABLE IF EXISTS vacuum_test;
      CREATE TABLE vacuum_test (id SERIAL PRIMARY KEY, data TEXT);
      INSERT INTO vacuum_test (data) SELECT repeat('x', 100) FROM generate_series(1, 5000);
      ANALYZE vacuum_test;
      UPDATE vacuum_test SET data = repeat('y', 100);
      VACUUM vacuum_test;
    `,
    hints: [
      'SELECT relname, n_dead_tup, n_live_tup, last_vacuum FROM pg_stat_user_tables WHERE relname = \'vacuum_test\'',
      'Since no long transaction was blocking, VACUUM should have cleaned all dead tuples (n_dead_tup ≈ 0)',
      'In contrast, with a long transaction open, n_dead_tup would still show ~5000 even after VACUUM',
    ],
    explanation:
      'Without any blocking long transactions, VACUUM successfully removed all dead tuples — n_dead_tup should be 0. In production, the most common cause of VACUUM failing to clean dead tuples is a long-running transaction (especially "idle in transaction" sessions) that holds back the VACUUM horizon. The VACUUM horizon is the oldest active transaction\'s snapshot XID — VACUUM cannot remove any tuple with xmax newer than this. A single forgotten BEGIN without COMMIT can prevent VACUUM from cleaning dead tuples across ALL tables in the database, leading to bloat, slow queries, and eventual disk space exhaustion.\n\nKey prevention strategies:\n- Set idle_in_transaction_session_timeout (e.g., 5 minutes)\n- Monitor pg_stat_activity for sessions with old xact_start\n- Keep transactions as short as possible — do external I/O outside transaction boundaries\n- Use connection poolers that detect idle-in-transaction sessions',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['relname', 'n_dead_tup', 'n_live_tup', 'last_vacuum'],
          },
        },
      },
    },
    order: 1,
    difficulty: 3,
  },
];
