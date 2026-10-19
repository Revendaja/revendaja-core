import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger';
import { mailService, type MailService } from '../../shared/mail/mailService';
import { sessionService, type SessionService } from '../sessions/sessions.service';
import { usersRepository, type UsersRepository } from '../users/users.repository';
import { passwordResetRepository, type PasswordResetRepository } from './passwordReset.repository';

const CODE_SALT_ROUNDS = 10;
const PASSWORD_SALT_ROUNDS = 10;

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// Uma única resposta para TODA falha de validação do código (e-mail sem
// conta, sem código pendente, expirado, tentativas esgotadas, já usado ou
// errado). Mensagens diferentes serviriam de oráculo: por exemplo, "tentativas
// esgotadas" só existe para quem tem conta.
function invalidCodeError(): AppError {
  return new AppError(
    'Código inválido ou expirado. Solicite um novo.',
    400,
    'PASSWORD_RESET_CODE_INVALID',
  );
}

interface ResetPasswordInput {
  email: string;
  code: string;
  password: string;
}

export class PasswordResetService {
  constructor(
    private readonly repository: PasswordResetRepository = passwordResetRepository,
    private readonly users: UsersRepository = usersRepository,
    private readonly sessions: SessionService = sessionService,
    private readonly mail: MailService = mailService,
  ) {}

  // Resposta idêntica exista ou não uma conta com o e-mail (e mesmo se o
  // limite de envios foi atingido ou o e-mail falhou): nada aqui lança erro
  // "de negócio" — só sai silenciosamente e o motivo fica no log.
  async requestReset(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      logger.info('Redefinição de senha pedida para e-mail sem conta');
      return;
    }

    const lastCreated = await this.repository.findLastCreated(user.id);
    if (lastCreated) {
      const secondsSinceLast = (Date.now() - lastCreated.createdAt.getTime()) / 1000;
      if (secondsSinceLast < env.PASSWORD_RESET_COOLDOWN_SECONDS) {
        logger.info({ userId: user.id }, 'Redefinição de senha ignorada: cooldown ativo');
        return;
      }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60_000);
    const sentInLastHour = await this.repository.countCreatedSince(user.id, oneHourAgo);
    if (sentInLastHour >= env.PASSWORD_RESET_MAX_PER_HOUR) {
      logger.warn({ userId: user.id }, 'Redefinição de senha ignorada: limite por hora atingido');
      return;
    }

    // Só o código mais recente vale.
    await this.repository.revokePending(user.id);

    const code = generateCode();
    await this.repository.create({
      userId: user.id,
      codeHash: await bcrypt.hash(code, CODE_SALT_ROUNDS),
      expiresAt: new Date(Date.now() + env.PASSWORD_RESET_EXPIRATION_MINUTES * 60_000),
    });

    try {
      await this.mail.sendPasswordReset(user, code, {
        expiresInMinutes: env.PASSWORD_RESET_EXPIRATION_MINUTES,
      });
    } catch (error) {
      logger.error({ err: error, userId: user.id }, 'Falha ao enviar o código de redefinição');
    }
  }

  async resetPassword({ email, code, password }: ResetPasswordInput): Promise<void> {
    const user = await this.users.findByEmail(email);
    const pending = user ? await this.repository.findLatestPending(user.id) : null;
    if (!user || !pending) {
      throw invalidCodeError();
    }

    // A tentativa é reservada ANTES de comparar o código, num UPDATE atômico
    // que também checa validade e limite (ver `claimAttempt`). Assim, mesmo com
    // centenas de palpites em paralelo, no máximo PASSWORD_RESET_MAX_ATTEMPTS
    // deles chegam a ser comparados.
    const canTry = await this.repository.claimAttempt(pending.id, env.PASSWORD_RESET_MAX_ATTEMPTS);
    if (!canTry) {
      throw invalidCodeError();
    }

    if (!(await bcrypt.compare(code, pending.codeHash))) {
      throw invalidCodeError();
    }

    // Uso único e à prova de corrida: se outro pedido acertou o mesmo código
    // no meio-tempo, `consume` devolve false.
    if (!(await this.repository.consume(pending.id))) {
      throw invalidCodeError();
    }

    const newHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    const updatedUser = await this.users.updatePassword(user.id, newHash);

    // Qualquer outro código pendente deixa de valer, e quem estava logado com
    // a senha antiga (ou quem tinha invadido a conta) é desconectado.
    await this.repository.revokePending(user.id);
    await this.sessions.endAllForUser(user.id);

    try {
      await this.mail.sendPasswordChanged(updatedUser);
    } catch (error) {
      logger.warn({ err: error, userId: user.id }, 'Falha ao enviar o aviso de senha alterada');
    }
  }
}

export const passwordResetService = new PasswordResetService();
