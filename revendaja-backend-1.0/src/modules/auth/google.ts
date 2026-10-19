import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env';
import { AppError, UnauthorizedError } from '../../shared/errors/AppError';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
}

let client: OAuth2Client | null = null;

// Verifica a assinatura, expiração e audience do ID token direto com o Google (biblioteca
// oficial — baixa e cacheia as chaves públicas do Google sozinha). Lançar aqui em vez de confiar
// em qualquer dado que o app mande: o idToken é a única coisa que prova quem é a usuária.
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new AppError('Login com Google não está configurado.', 500, 'GOOGLE_LOGIN_NOT_CONFIGURED');
  }
  if (!client) {
    client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw new UnauthorizedError('Token do Google inválido ou expirado.');
  }

  if (!payload || !payload.sub || !payload.email) {
    throw new UnauthorizedError('Token do Google inválido ou expirado.');
  }
  // O Google só preenche claims de e-mail/nome quando a conta é verificada no próprio Google, mas
  // o `email_verified` cobre o caso raro de um provedor G Suite que desativa essa checagem.
  if (payload.email_verified === false) {
    throw new UnauthorizedError('O e-mail da conta Google não está verificado.');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email,
  };
}
