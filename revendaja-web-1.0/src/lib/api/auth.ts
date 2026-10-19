import { request } from './http';
import type { AuthResponse, AuthUser, LoginInput, MeResponse, RegisterInput } from './types';

// "Meus Dados": nome e/ou WhatsApp. Envie só o que mudou (pelo menos um campo).
export type UpdateProfileInput = {
  name?: string;
  whatsapp?: string;
};

export function register(input: RegisterInput) {
  return request<AuthResponse>('/auth/register', { method: 'POST', body: input });
}

export function login(input: LoginInput) {
  return request<AuthResponse>('/auth/login', { method: 'POST', body: input });
}

export function loginWithGoogle(idToken: string) {
  return request<AuthResponse>('/auth/google', { method: 'POST', body: { idToken } });
}

// 401 aqui é "código inválido" (erro de formulário), não sessão expirada: não renova.
export function verifyOtp(code: string) {
  return request<{ isVerified: boolean }>('/auth/otp/verify', {
    method: 'POST',
    body: { code },
    auth: true,
    renewOn401: false,
  });
}

export function resendOtp() {
  return request<{ sent: boolean }>('/auth/otp/resend', { method: 'POST', auth: true });
}

// Não renova em 401 (a sessão pode já ter acabado) e não espera muito: o logout local vale de qualquer jeito.
export function logout() {
  return request<{ loggedOut: boolean }>('/auth/logout', {
    method: 'POST',
    auth: true,
    renewOn401: false,
    timeoutMs: 8000,
  });
}

export function forgotPassword(email: string) {
  return request<{ sent: boolean }>('/auth/forgot-password', { method: 'POST', body: { email } });
}

// A API responde 400 PASSWORD_RESET_CODE_INVALID para qualquer falha (código errado, expirado, usado,
// tentativas esgotadas ou e-mail sem conta): de propósito, não há como distinguir.
export function resetPassword(input: { email: string; code: string; password: string }) {
  return request<{ reset: boolean }>('/auth/reset-password', { method: 'POST', body: input });
}

export function getMe() {
  return request<MeResponse>('/me', { auth: true });
}

// O e-mail não é editável por aqui. 409 = o WhatsApp já é de outra conta.
export function updateProfile(input: UpdateProfileInput) {
  return request<AuthUser>('/me', { method: 'PATCH', body: input, auth: true });
}
