import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { AUTH_RATE_LIMITS } from '../../shared/rateLimits';
import { resendOtpResponseSchema, verifyOtpResponseSchema, verifyOtpSchema } from './otp.schema';
import { resendOtp, verifyOtp } from './otp.controller';

export async function otpRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    '/auth/otp/verify',
    {
      preHandler: authenticate,
      config: { rateLimit: AUTH_RATE_LIMITS.otpVerify },
      schema: {
        tags: ['auth'],
        summary: 'Confirma o código de 6 dígitos recebido por e-mail.',
        security: [{ bearerAuth: [] }],
        body: verifyOtpSchema,
        response: { 200: verifyOtpResponseSchema },
      },
    },
    verifyOtp,
  );

  server.post(
    '/auth/otp/resend',
    {
      preHandler: authenticate,
      config: { rateLimit: AUTH_RATE_LIMITS.otpResend },
      schema: {
        tags: ['auth'],
        summary: 'Reenvia o código de verificação por e-mail (com rate limit).',
        security: [{ bearerAuth: [] }],
        response: { 200: resendOtpResponseSchema },
      },
    },
    resendOtp,
  );
}
