import type { FastifyReply } from 'fastify'

export function sendNotFound(reply: FastifyReply, message: string): void {
  reply.code(404).send({ statusCode: 404, error: 'Not Found', message })
}

export function sendConflict(reply: FastifyReply, message: string): void {
  reply.code(409).send({ statusCode: 409, error: 'Conflict', message })
}

export function sendBadRequest(reply: FastifyReply, message: string): void {
  reply.code(400).send({ statusCode: 400, error: 'Bad Request', message })
}
