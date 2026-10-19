import { tokenStorage } from '../auth/tokenStorage';
import { getTokenExpiryMs } from '../auth/jwt';
import { API_URL, REFRESH_LEEWAY_MS, REQUEST_TIMEOUT_MS } from './config';
import { ApiError, NetworkError } from './errors';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  // Rota autenticada: envia o Bearer e renova o accessToken automaticamente.
  auth?: boolean;
  // Em rota autenticada, um 401 normalmente dispara "renova e repete". Passe false quando o 401
  // é erro de formulário (ex.: código OTP errado) ou quando não faz sentido tentar renovar (logout).
  renewOn401?: boolean;
  timeoutMs?: number;
};

type RawResponse = { status: number; data: unknown };

const SESSION_MISSING_MESSAGE = 'Sessão encerrada. Faça login novamente.';

// ---------------------------------------------------------------------------
// Sessão encerrada: o AuthContext registra um handler que leva o usuário ao login.
// ---------------------------------------------------------------------------

type SessionEndedHandler = (message: string) => void;

let sessionEndedHandler: SessionEndedHandler | null = null;

export function setSessionEndedHandler(handler: SessionEndedHandler | null) {
  sessionEndedHandler = handler;
}

// Apaga os tokens e avisa a UI. Idempotente: várias requests concorrentes falhando juntas só disparam uma vez.
async function endSession(message: string): Promise<void> {
  if (tokenStorage.peek() === null) return;
  const cleared = tokenStorage.clear();
  sessionEndedHandler?.(message);
  await cleared;
}

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------

function toApiError(status: number, data: unknown): ApiError {
  const body = (data ?? {}) as { error?: unknown; message?: unknown };
  const code = typeof body.error === 'string' ? body.error : 'UNKNOWN_ERROR';
  const fallback =
    status >= 500 ? 'Erro no servidor. Tente novamente em instantes.' : 'Não foi possível concluir a solicitação.';
  const message = typeof body.message === 'string' && body.message ? body.message : fallback;
  return new ApiError(status, code, message);
}

async function send(
  path: string,
  { method, body, token, timeoutMs }: { method: string; body?: unknown; token?: string; timeoutMs: number }
): Promise<RawResponse> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    return { status: response.status, data };
  } catch (error) {
    // A tela só mostra a mensagem genérica; o motivo real (timeout, CORS, servidor fora do ar...)
    // fica no console pra debugar quando alguém relatar "não foi possível conectar".
    console.warn(`[http] ${method} ${path} falhou:`, error);
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }
}

function isSuccess(status: number) {
  return status >= 200 && status < 300;
}

// ---------------------------------------------------------------------------
// Renovação do accessToken (single-flight)
// ---------------------------------------------------------------------------

let refreshInFlight: Promise<string> | null = null;

// No máximo uma renovação por vez: chamadas concorrentes esperam a mesma promise.
export function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function performRefresh(): Promise<string> {
  const tokens = await tokenStorage.load();
  if (!tokens) throw new ApiError(401, 'UNAUTHORIZED', SESSION_MISSING_MESSAGE);

  // Rota pública: sem Authorization. Falha de rede propaga como NetworkError (não desloga).
  const { status, data } = await send('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: tokens.refreshToken },
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  if (status === 401) {
    // Refresh vencido, login em outro aparelho, logout ou senha redefinida: a sessão acabou.
    const error = toApiError(status, data);
    await endSession(error.message);
    throw error;
  }
  if (!isSuccess(status)) throw toApiError(status, data);

  const accessToken = (data as { accessToken?: unknown } | null)?.accessToken;
  if (typeof accessToken !== 'string' || !accessToken) throw toApiError(500, null);

  // Se a sessão mudou enquanto renovávamos (logout ou novo login), descarta o resultado.
  const latest = await tokenStorage.load();
  if (!latest || latest.refreshToken !== tokens.refreshToken) {
    throw new ApiError(401, 'UNAUTHORIZED', SESSION_MISSING_MESSAGE);
  }

  await tokenStorage.setAccessToken(accessToken);
  return accessToken;
}

// accessToken válido para enviar agora; renova antes se expira em menos de REFRESH_LEEWAY_MS (ou se
// ainda não temos um real — logo após o boot, que só carrega o refreshToken).
export async function getFreshAccessToken(): Promise<string> {
  const tokens = await tokenStorage.load();
  if (!tokens) throw new ApiError(401, 'UNAUTHORIZED', SESSION_MISSING_MESSAGE);

  const expiresAt = getTokenExpiryMs(tokens.accessToken);
  if (expiresAt === null || expiresAt - Date.now() < REFRESH_LEEWAY_MS) return refreshAccessToken();
  return tokens.accessToken;
}

// Um 401 numa rota autenticada: devolve um token novo para repetir a request.
async function recoverFromUnauthorized(usedToken: string): Promise<string> {
  const tokens = await tokenStorage.load();
  if (!tokens) throw new ApiError(401, 'UNAUTHORIZED', SESSION_MISSING_MESSAGE);
  // Outra request concorrente já renovou desde que esta foi enviada: basta repetir com o token atual.
  if (tokens.accessToken !== usedToken) return tokens.accessToken;
  return refreshAccessToken();
}

// ---------------------------------------------------------------------------
// Cliente central
// ---------------------------------------------------------------------------

export async function requestDetailed<T>(
  path: string,
  options: RequestOptions = {}
): Promise<{ status: number; data: T }> {
  const { method = 'GET', body, auth = false, renewOn401 = true, timeoutMs = REQUEST_TIMEOUT_MS } = options;

  if (!auth) {
    const response = await send(path, { method, body, timeoutMs });
    if (!isSuccess(response.status)) throw toApiError(response.status, response.data);
    return { status: response.status, data: response.data as T };
  }

  let token = await getFreshAccessToken();
  let response = await send(path, { method, body, token, timeoutMs });

  if (response.status === 401 && renewOn401) {
    // Renova uma vez e repete uma vez. Se ainda assim der 401, a sessão acabou.
    token = await recoverFromUnauthorized(token);
    response = await send(path, { method, body, token, timeoutMs });

    if (response.status === 401) {
      const error = toApiError(response.status, response.data);
      await endSession(error.message);
      throw error;
    }
  }

  if (!isSuccess(response.status)) throw toApiError(response.status, response.data);
  return { status: response.status, data: response.data as T };
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await requestDetailed<T>(path, options)).data;
}
