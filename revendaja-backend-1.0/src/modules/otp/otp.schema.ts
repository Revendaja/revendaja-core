import { z } from 'zod';

export const verifyOtpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Código deve conter exatamente 6 dígitos.'),
});

export const verifyOtpResponseSchema = z.object({
  isVerified: z.boolean(),
});

export const resendOtpResponseSchema = z.object({
  sent: z.boolean(),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
