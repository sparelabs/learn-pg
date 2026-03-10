import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'identify-read-queries',
    lessonId: '',
    type: 'sql-query',
    title: 'Identify Read vs Write Queries',
    prompt:
      "PGDog routes queries based on SQL parsing: SELECTs go to replicas, writes go to the primary. But not all SELECTs are reads!\n\nA useful way to understand your workload's read/write ratio is to check `pg_is_in_recovery()`, which returns `false` on a primary and `true` on a replica.\n\nRun the following query to determine this server's role:\n```sql\nSELECT\n  CASE\n    WHEN pg_is_in_recovery() THEN 'replica'\n    ELSE 'primary'\n  END AS server_role;\n```\n\nIn a read/write splitting setup, PGDog would route this SELECT to a replica. But `SELECT ... FOR UPDATE`, `INSERT`, `UPDATE`, `DELETE`, and SELECTs calling volatile functions always go to the primary.",
    setupSql: '',
    hints: [
      'Use pg_is_in_recovery() to check if the server is a primary or replica',
      'A CASE expression converts the boolean to a readable label',
      'This server is likely a primary (returns false) since we can write to it'
    ],
    explanation:
      "pg_is_in_recovery() is the standard way to check if a PostgreSQL server is operating as a primary (read-write) or a replica (read-only). In a PGDog setup with read/write splitting, pure SELECT queries get routed to replicas, while any query that modifies data goes to the primary. This simple check is useful in application code to verify which server you're connected to, and in monitoring to confirm routing is working correctly.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['server_role']
          }
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'check-replication-status',
    lessonId: '',
    type: 'sql-query',
    title: 'Check Replication Settings',
    prompt:
      "Read/write splitting depends on streaming replication being properly configured. Check the key replication-related settings by querying `pg_settings`.\n\nReturn the `name`, `setting`, and `short_desc` columns for these parameters:\n- `wal_level` (must be 'replica' or 'logical' for replication)\n- `max_wal_senders` (maximum replication connections)\n- `max_replication_slots` (maximum replication slots)\n\nEven on a standalone server (no replicas), these settings tell you whether replication *could* be enabled.",
    setupSql: '',
    hints: [
      "Query pg_settings with WHERE name IN ('wal_level', 'max_wal_senders', 'max_replication_slots')",
      'Select name, setting, and short_desc columns',
      'wal_level must be at least replica for streaming replication to work'
    ],
    explanation:
      "These three settings control replication capability. wal_level = 'replica' (or 'logical') means the WAL contains enough information for replicas to replay changes. max_wal_senders limits how many replicas can connect simultaneously. max_replication_slots limits replication slots, which ensure the primary retains WAL data until all replicas have received it. For read/write splitting with PGDog, you need at least one replica connected via streaming replication, which requires wal_level >= 'replica' and max_wal_senders >= 1.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 3 },
          columns: {
            required: ['name', 'setting', 'short_desc']
          }
        }
      }
    },
    order: 2,
    difficulty: 2
  }
];
