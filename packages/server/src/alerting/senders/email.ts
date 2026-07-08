import nodemailer, { type Transporter } from 'nodemailer'
import { buildAlertSubject, buildAlertText } from '../format.js'
import type { AlertMessage, EmailChannelConfig, SmtpConfig } from '../types.js'

export type CreateTransport = (options: {
  host: string
  port: number
  secure: boolean
  auth: { user: string; pass: string } | undefined
  connectionTimeout: number
  socketTimeout: number
}) => Pick<Transporter, 'sendMail' | 'close'>

// Takes the transport factory as a param (defaulting to the real nodemailer) rather than
// importing nodemailer.createTransport directly, so tests can inject a stub instead of
// mocking the nodemailer module — the mock/vite-node interop for this specific CJS package
// silently misses the module instance seen from this file, so DI is the reliable path.
export async function sendEmailAlert(
  smtp: SmtpConfig | undefined,
  config: Record<string, unknown>,
  message: AlertMessage,
  timeoutMs: number,
  createTransport: CreateTransport = nodemailer.createTransport,
): Promise<void> {
  if (!smtp) {
    throw new Error('email alerts require SMTP_HOST/SMTP_FROM to be configured on the server')
  }

  const { to } = config as Partial<EmailChannelConfig>
  if (typeof to !== 'string' && !Array.isArray(to)) {
    throw new Error('email channel config is missing "to"')
  }

  const transport = createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  })

  try {
    await transport.sendMail({
      from: smtp.from,
      to,
      subject: buildAlertSubject(message),
      text: buildAlertText(message),
    })
  } finally {
    transport.close()
  }
}
