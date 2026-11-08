import { z } from 'zod';

// Confirma a identidade antes de apagar tudo: quem tem senha manda a senha; a conta criada só
// pelo Google (sem senha) manda um ID token novo do Google.
export const deleteAccountSchema = z
  .object({
    password: z.string().min(1).max(72).optional(),
    googleIdToken: z.string().min(1).optional(),
  })
  .refine((data) => data.password !== undefined || data.googleIdToken !== undefined, {
    message: 'Confirme com a senha ou com o login do Google.',
  });

export const deleteAccountResponseSchema = z.object({ deleted: z.literal(true) });

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
