import { z } from 'zod';
import { userPublicSchema } from '../users/users.schema';
import { storeResponseSchema } from '../store/store.schema';

export const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  // Só dígitos, com DDI+DDD (ex.: 5511982214432).
  whatsapp: z
    .string()
    .regex(/^\d{10,15}$/, 'WhatsApp deve conter DDI+DDD+número, somente dígitos.'),
  password: z.string().min(6).max(72),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(72),
});

export const googleLoginSchema = z.object({
  // ID token do Google (JWT), não o access token — é ele que o backend verifica com o Google.
  idToken: z.string().min(1),
});

// "Meus Dados": nome e/ou WhatsApp. O e-mail não é editável por aqui (ver AuthService#updateProfile).
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    whatsapp: z
      .string()
      .regex(/^\d{10,15}$/, 'WhatsApp deve conter DDI+DDD+número, somente dígitos.')
      .optional(),
  })
  .refine((data) => data.name !== undefined || data.whatsapp !== undefined, {
    message: 'Informe name e/ou whatsapp.',
  });

export const authResponseSchema = z.object({
  user: userPublicSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
  isVerified: z.boolean(),
  hasStore: z.boolean(),
  // true quando a conta ainda não tem WhatsApp (só acontece em conta criada via Google) — o app
  // deve pedir o WhatsApp antes de seguir para o fluxo normal (verificação/criar loja).
  needsWhatsapp: z.boolean(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const refreshResponseSchema = z.object({
  accessToken: z.string(),
});

export const logoutResponseSchema = z.object({
  loggedOut: z.boolean(),
});

export const meResponseSchema = z.object({
  user: userPublicSchema,
  isVerified: z.boolean(),
  store: storeResponseSchema.nullable(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
