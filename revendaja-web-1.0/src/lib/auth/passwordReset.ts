// A API só permite um novo código a cada 30 s e responde 200 igual quando ignora um pedido,
// então o app impõe o cooldown: guardamos quando o último código foi pedido para cada e-mail.
export const RESET_RESEND_COOLDOWN_SECONDS = 30;

let lastRequest: { email: string; at: number } | null = null;

export function markResetCodeRequested(email: string) {
  lastRequest = { email, at: Date.now() };
}

// Quando o último código deste e-mail foi pedido (null se nunca, ou se foi para outro e-mail).
export function getResetCodeRequestedAt(email: string): number | null {
  return lastRequest && lastRequest.email === email ? lastRequest.at : null;
}

export function isInResetCooldown(email: string) {
  const at = getResetCodeRequestedAt(email);
  return at !== null && Date.now() - at < RESET_RESEND_COOLDOWN_SECONDS * 1000;
}
