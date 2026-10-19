export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado.') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Recurso já existe.') {
    super(message, 409, 'CONFLICT');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autorizado.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado.') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Muitas requisições. Tente novamente mais tarde.') {
    super(message, 429, 'TOO_MANY_REQUESTS');
  }
}

// Limite do plano atual (quantidade de produtos ou recurso não liberado nesse plano).
export class PlanLimitError extends AppError {
  constructor(message: string) {
    super(message, 403, 'PLAN_LIMIT_REACHED');
  }
}
