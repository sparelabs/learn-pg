import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'server-vs-client-connections',
    lessonId: '',
    type: 'sql-query',
    title: 'Count Server-Side Connections',
    prompt:
      "When a connection pooler like PGDog sits between your application and PostgreSQL, the database only sees the pooler's server connections — not the hundreds or thousands of application clients behind it.\n\nQuery `pg_stat_activity` to count the number of client backend connections. Return a single column called `server_connections`.\n\nIn a pooled environment, this number stays low and stable (matching the pool size) even as application traffic fluctuates. Without a pooler, this number would match the total number of application connections.",
    setupSql: '',
    hints: [
      "Use SELECT count(*) AS server_connections FROM pg_stat_activity",
      "Filter with WHERE backend_type = 'client backend'",
      'In a pooled setup, this shows pool size, not application client count'
    ],
    explanation:
      "This is the key insight of connection pooling: PostgreSQL sees only the pooler's server connections. If PGDog is configured with default_pool_size = 10, you'll see roughly 10 client backends in pg_stat_activity — regardless of whether 50 or 5,000 application clients are connected to PGDog. This dramatically reduces PostgreSQL's memory overhead and snapshot computation cost.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['server_connections']
          }
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'max-connections-check',
    lessonId: '',
    type: 'sql-query',
    title: 'Check the Connection Limit',
    prompt:
      "PostgreSQL has a hard limit on simultaneous connections set by the `max_connections` parameter. Use the `SHOW` command to display the current `max_connections` value.\n\nIn a pooled environment, this should be set just above the total pool size across all pooler instances (plus a buffer for superuser and monitoring connections). Without a pooler, this needs to accommodate all direct application connections.",
    setupSql: '',
    hints: [
      'Use the SHOW command to display a configuration parameter',
      'The parameter name is max_connections',
      'SHOW max_connections;'
    ],
    explanation:
      "The default max_connections is typically 100. With a connection pooler, you can keep this relatively low — for example, if PGDog has a pool_size of 20 and you run 2 instances, set max_connections to about 50 (20×2 + 10 buffer). Without a pooler, you'd need max_connections >= your total application connections, which often leads to values of 500+ that degrade performance through higher memory usage and snapshot overhead.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['max_connections']
          }
        }
      }
    },
    order: 2,
    difficulty: 1
  }
];
