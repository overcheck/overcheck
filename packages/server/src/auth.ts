import bearerAuth from '@fastify/bearer-auth'
import type { FastifyInstance } from 'fastify'

export async function registerApiKeyAuth(app: FastifyInstance, apiKey: string): Promise<void> {
  await app.register(bearerAuth, { keys: new Set([apiKey]) })
}
