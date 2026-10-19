import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './AppError';
import { logger } from '../logger';

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
    return;
  }

  if (error instanceof ZodError) {
    reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Dados inválidos.',
      issues: error.flatten(),
    });
    return;
  }

  const fastifyError = error as FastifyError;
  if (fastifyError.validation) {
    reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: fastifyError.message,
    });
    return;
  }

  logger.error({ err: error, url: request.url }, 'Erro não tratado');
  reply.status(500).send({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Erro interno do servidor.',
  });
}
