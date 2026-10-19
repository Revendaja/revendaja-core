import { z } from 'zod';

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const forgotPasswordResponseSchema = z.object({
  sent: z.boolean(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, 'Código deve conter exatamente 6 dígitos.'),
  // Mesmas regras do cadastro (auth.schema.ts).
  password: z.string().min(6).max(72),
});

export const resetPasswordResponseSchema = z.object({
  reset: z.boolean(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
