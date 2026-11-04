import 'fastify';
import type { User } from '../modules/users/users.types';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    sessionId?: string;
    // A usuária dona da sessão, já carregada por `authenticate` (evita buscá-la de novo).
    authUser?: User;
  }
}
