export const up = (pgm) => {
  pgm.addConstraint('monitors', 'monitors_name_unique', { unique: 'name' })
  pgm.addConstraint('alert_channels', 'alert_channels_name_unique', { unique: 'name' })
}

export const down = (pgm) => {
  pgm.dropConstraint('alert_channels', 'alert_channels_name_unique')
  pgm.dropConstraint('monitors', 'monitors_name_unique')
}
