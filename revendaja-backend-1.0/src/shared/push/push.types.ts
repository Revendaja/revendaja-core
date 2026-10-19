export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushSendResult {
  token: string;
  status: 'ok' | 'error';
  // Preenchido só quando status = 'error' (ex.: "DeviceNotRegistered").
  errorType?: string;
}

// Só fala com o provedor de push (Expo) — não conhece usuário nem Prisma. Uma segunda
// implementação (ex.: outro provedor de push) bastaria satisfazer esta interface.
export interface PushProvider {
  sendBatch(tokens: string[], payload: PushPayload): Promise<PushSendResult[]>;
}
