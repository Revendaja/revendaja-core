// Erro devolvido pela API: { error: "CODIGO", message: "texto em pt-BR pronto para exibir" }.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// Sem resposta da API (offline, servidor fora do ar, timeout). Não é 401: nunca desloga.
export class NetworkError extends Error {
  constructor(message = 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export const VALIDATION_ERROR_MESSAGE = 'Confira os dados informados e tente novamente.';

// Texto seguro para exibir ao usuário a partir de qualquer erro.
// O `message` do 400 VALIDATION_ERROR é técnico (ex.: "body/stock Too small..."): nunca vai para a tela.
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.code === 'VALIDATION_ERROR' ? VALIDATION_ERROR_MESSAGE : error.message;
  if (error instanceof NetworkError) return error.message;
  return 'Algo deu errado. Tente novamente.';
}
