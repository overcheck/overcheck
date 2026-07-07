export const up = (pgm) => {
  pgm.createTable('monitors', {
    id: 'id',
    name: { type: 'text', notNull: true },
    type: { type: 'text', notNull: true, check: "type IN ('http', 'tcp', 'ping', 'keyword')" },
    enabled: { type: 'boolean', notNull: true, default: true },
    interval_seconds: { type: 'integer', notNull: true, check: 'interval_seconds >= 10' },
    timeout_ms: { type: 'integer', notNull: true, default: 5000 },
    retries: { type: 'integer', notNull: true, default: 0, check: 'retries >= 0' },
    degraded_after_ms: { type: 'integer', notNull: true, default: 2000 },
    http_url: { type: 'text' },
    http_method: { type: 'text', notNull: true, default: 'GET' },
    http_expected_status: { type: 'integer', notNull: true, default: 200 },
    http_body_contains: { type: 'text' },
    host: { type: 'text' },
    port: { type: 'integer' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })

  pgm.createTable('check_results', {
    id: { type: 'bigserial', primaryKey: true },
    monitor_id: {
      type: 'integer',
      notNull: true,
      references: 'monitors',
      onDelete: 'CASCADE',
    },
    status: { type: 'text', notNull: true, check: "status IN ('up', 'degraded', 'down')" },
    response_time_ms: { type: 'integer' },
    error_message: { type: 'text' },
    checked_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })

  pgm.createIndex('check_results', ['monitor_id', { name: 'checked_at', sort: 'DESC' }], {
    name: 'idx_check_results_monitor_checked_at',
  })
  pgm.createIndex('check_results', 'checked_at', { name: 'idx_check_results_checked_at' })
}

export const down = (pgm) => {
  pgm.dropTable('check_results')
  pgm.dropTable('monitors')
}
