export const up = (pgm) => {
  pgm.addColumns('status_pages', {
    logo_url: { type: 'text' },
    accent_color: { type: 'text', notNull: true, default: 'oklch(0.55 0.16 250)' },
  })

  pgm.addColumns('status_page_monitors', {
    group_name: { type: 'text' },
  })

  pgm.createTable('incidents', {
    id: 'id',
    status_page_id: {
      type: 'integer',
      notNull: true,
      references: 'status_pages',
      onDelete: 'CASCADE',
    },
    title: { type: 'text', notNull: true },
    status: {
      type: 'text',
      notNull: true,
      check: "status IN ('investigating', 'identified', 'monitoring', 'resolved')",
    },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })

  pgm.createTable('incident_updates', {
    id: 'id',
    incident_id: {
      type: 'integer',
      notNull: true,
      references: 'incidents',
      onDelete: 'CASCADE',
    },
    body: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })

  pgm.createTable('incident_monitors', {
    incident_id: {
      type: 'integer',
      notNull: true,
      references: 'incidents',
      onDelete: 'CASCADE',
    },
    monitor_id: {
      type: 'integer',
      notNull: true,
      references: 'monitors',
      onDelete: 'CASCADE',
    },
  })

  pgm.addConstraint('incident_monitors', 'incident_monitors_pkey', {
    primaryKey: ['incident_id', 'monitor_id'],
  })

  pgm.createIndex('incidents', 'status_page_id')
  pgm.createIndex('incident_updates', 'incident_id')
  pgm.createIndex('incident_monitors', 'incident_id')
}

export const down = (pgm) => {
  pgm.dropTable('incident_monitors')
  pgm.dropTable('incident_updates')
  pgm.dropTable('incidents')
  pgm.dropColumns('status_page_monitors', ['group_name'])
  pgm.dropColumns('status_pages', ['logo_url', 'accent_color'])
}
