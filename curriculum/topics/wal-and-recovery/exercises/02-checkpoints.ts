import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'show-checkpoint-settings',
    lessonId: '',
    type: 'sql-query',
    title: 'View Checkpoint Configuration',
    prompt: 'Check the current checkpoint timeout setting. This controls how frequently PostgreSQL performs automatic checkpoints. Run: SHOW checkpoint_timeout.',
    setupSql: '',
    hints: [
      'SHOW checkpoint_timeout',
      'Default is 5min (5 minutes)',
      'Higher values mean fewer checkpoints but longer recovery time'
    ],
    explanation: 'checkpoint_timeout sets the maximum time between automatic checkpoints. The default of 5 minutes means PostgreSQL checkpoints at least every 5 minutes. For write-heavy workloads, increasing this (e.g., to 15min or 30min) reduces I/O overhead but increases crash recovery time.',
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
    difficulty: 1
  },
  {
    id: 'bgwriter-stats',
    lessonId: '',
    type: 'sql-query',
    title: 'Monitor Checkpoint Activity',
    prompt: 'Query pg_stat_bgwriter to see checkpoint statistics. Select checkpoints_timed (triggered by timeout), checkpoints_req (triggered by WAL volume), buffers_checkpoint (pages written during checkpoints), and buffers_backend (pages written by backends — ideally low).',
    setupSql: '',
    hints: [
      'SELECT checkpoints_timed, checkpoints_req, buffers_checkpoint, buffers_backend FROM pg_stat_bgwriter',
      'checkpoints_timed vs checkpoints_req ratio shows if WAL volume is forcing checkpoints',
      'buffers_backend > 0 means backends had to write dirty pages themselves'
    ],
    explanation: 'pg_stat_bgwriter tracks checkpoint and background writer activity. If checkpoints_req is much higher than checkpoints_timed, your system is generating WAL faster than checkpoint_timeout allows — consider increasing max_wal_size. If buffers_backend is high, the background writer can\'t keep up, causing latency spikes.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['checkpoints_timed', 'checkpoints_req']
          }
        }
      }
    },
    order: 2,
    difficulty: 2
  },
  {
    id: 'manual-checkpoint',
    lessonId: '',
    type: 'sql-query',
    requiresSuperuser: true,
    title: 'Trigger a Manual Checkpoint',
    prompt: 'Force a manual checkpoint with the CHECKPOINT command. This flushes all dirty pages to disk and advances the recovery start point. Run: CHECKPOINT.',
    setupSql: '',
    hints: [
      'Simply run: CHECKPOINT',
      'This is a superuser command',
      'It returns no rows (DDL-like command)'
    ],
    explanation: 'The CHECKPOINT command forces an immediate checkpoint, flushing all dirty pages from shared buffers to disk. This is useful before planned maintenance (like shutting down the server) or before measuring performance (to start with a clean buffer state). In normal operation, checkpoints happen automatically.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 0 }
        }
      }
    },
    order: 3,
    difficulty: 2
  }
];
