import { z } from 'zod';

// Forma pública do usuário — nunca inclui `passwordHash`. Reaproveitada
// pelos schemas de resposta de "auth" (register, login, /me).
export const userPublicSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  // null até a usuária completar o cadastro (conta criada via Google que ainda não informou o WhatsApp).
  whatsapp: z.string().nullable(),
});

export type UserPublic = z.infer<typeof userPublicSchema>;
