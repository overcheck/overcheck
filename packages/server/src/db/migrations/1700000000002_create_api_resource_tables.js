export const up = (pgm) => {
  pgm.createTable('alert_channels', {
    id: 'id',
    name: { type: 'text', notNull: true },
    type: { type: 'text', notNull: true, check: "type IN ('slack', 'webhook', 'email')" },
    config: { type: 'jsonb', notNull: true },
    enabled: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })

  pgm.createTable('status_pages', {
    id: 'id',
    name: { type: 'text', notNull: true },
    slug: { type: 'text', notNull: true, unique: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })

  pgm.createTable('status_page_monitors', {
    status_page_id: {
      type: 'integer',
      notNull: true,
      references: 'status_pages',
      onDelete: 'CASCADE',
    },
    monitor_id: {
      type: 'integer',
      notNull: true,
      references: 'monitors',
      onDelete: 'CASCADE',
    },
    sort_order: { type: 'integer', notNull: true, default: 0 },
  })

  pgm.addConstraint('status_page_monitors', 'status_page_monitors_pkey', {
    primaryKey: ['status_page_id', 'monitor_id'],
  })
}

export const down = (pgm) => {
  pgm.dropTable('status_page_monitors')
  pgm.dropTable('status_pages')
  pgm.dropTable('alert_channels')
}
