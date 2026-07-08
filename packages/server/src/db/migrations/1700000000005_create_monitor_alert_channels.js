export const up = (pgm) => {
  pgm.createTable('monitor_alert_channels', {
    monitor_id: {
      type: 'integer',
      notNull: true,
      references: 'monitors',
      onDelete: 'CASCADE',
    },
    alert_channel_id: {
      type: 'integer',
      notNull: true,
      references: 'alert_channels',
      onDelete: 'CASCADE',
    },
  })

  pgm.addConstraint('monitor_alert_channels', 'monitor_alert_channels_pkey', {
    primaryKey: ['monitor_id', 'alert_channel_id'],
  })
}

export const down = (pgm) => {
  pgm.dropTable('monitor_alert_channels')
}
