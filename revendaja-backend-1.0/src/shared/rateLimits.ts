// Limites por IP nas rotas de autenticação/credencial (o plugin @fastify/rate-limit responde 429
// acima disso). Cada uma já tem sua própria trava de negócio por CONTA (OTP_MAX_ATTEMPTS,
// PASSWORD_RESET_MAX_ATTEMPTS...), mas isso não impede alguém de tentar muitas contas/e-mails
// diferentes a partir do mesmo IP — daí o limite aqui, como segunda camada. Atrás de um
// proxy/balanceador, configure TRUST_PROXY, senão todo mundo divide um único IP (e um único limite).
export const AUTH_RATE_LIMITS = {
  register: { max: 5, timeWindow: '1 hour' },
  login: { max: 10, timeWindow: '15 minutes' },
  // Só troca um refresh token válido por um access token novo (não é credencial adivinhável), mas
  // ainda assim limitado contra abuso/uso indevido de um token vazado.
  refresh: { max: 20, timeWindow: '5 minutes' },
  // Confirmar o código de 6 dígitos: é o alvo mais óbvio de força bruta (só 1 milhão de combinações).
  otpVerify: { max: 10, timeWindow: '15 minutes' },
  otpResend: { max: 10, timeWindow: '10 minutes' },
  forgotPassword: { max: 5, timeWindow: '15 minutes' },
  // Mesma lógica do otpVerify: o código de redefinição também é de 6 dígitos.
  resetPassword: { max: 10, timeWindow: '15 minutes' },
};
