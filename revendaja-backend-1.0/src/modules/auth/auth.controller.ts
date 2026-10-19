import type { FastifyReply, FastifyRequest } from 'fastify';
import { authService } from './auth.service';
import type {
  GoogleLoginInput,
  LoginInput,
  RefreshInput,
  RegisterInput,
  UpdateProfileInput,
} from './auth.schema';

export async function register(
  request: FastifyRequest<{ Body: RegisterInput }>,
  reply: FastifyReply,
) {
  const result = await authService.register(request.body);
  return reply.status(201).send(result);
}

export async function login(request: FastifyRequest<{ Body: LoginInput }>, reply: FastifyReply) {
  const result = await authService.login(request.body);
  return reply.status(200).send(result);
}

export async function loginWithGoogle(
  request: FastifyRequest<{ Body: GoogleLoginInput }>,
  reply: FastifyReply,
) {
  const result = await authService.loginWithGoogle(request.body.idToken);
  return reply.status(200).send(result);
}

export async function refresh(
  request: FastifyRequest<{ Body: RefreshInput }>,
  reply: FastifyReply,
) {
  const result = await authService.refresh(request.body.refreshToken);
  return reply.status(200).send(result);
}

export async function logout(request: FastifyRequest, reply: FastifyReply) {
  await authService.logout(request.sessionId as string);
  return reply.status(200).send({ loggedOut: true });
}

export async function me(request: FastifyRequest, reply: FastifyReply) {
  const result = await authService.getMe(request.userId as string);
  return reply.status(200).send(result);
}

export async function updateProfile(
  request: FastifyRequest<{ Body: UpdateProfileInput }>,
  reply: FastifyReply,
) {
  const result = await authService.updateProfile(request.userId as string, request.body);
  return reply.status(200).send(result);
}
