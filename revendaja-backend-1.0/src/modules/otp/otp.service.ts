import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { AppError, TooManyRequestsError, UnauthorizedError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger';
import { mailService, type MailService } from '../../shared/mail/mailService';
import { usersRepository, type UsersRepository } from '../users/users.repository';
import type { User } from '../users/users.types';
import { otpRepository, type OtpRepository } from './otp.repository';

const CODE_SALT_ROUNDS = 10;

// O código é enviado por e-mail (por enquanto), então só precisamos destes campos.
type OtpRecipient = Pick<User, 'id' | 'name' | 'email'>;

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export class OtpService {
  constructor(
    private readonly repository: OtpRepository = otpRepository,
    private readonly users: UsersRepository = usersRepository,
    private readonly mail: MailService = mailService,
  ) {}

  async generateAndSend(user: OtpRecipient, options: { isResend?: boolean } = {}): Promise<void> {
    const code = generateCode();
    const codeHash = await bcrypt.hash(code, CODE_SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + env.OTP_EXPIRATION_MINUTES * 60_000);

    await this.repository.create({ userId: user.id, codeHash, expiresAt });
    await this.mail.sendVerificationCode(user, code, {
      expiresInMinutes: env.OTP_EXPIRATION_MINUTES,
      isResend: options.isResend,
    });
  }

  async verify(userId: string, code: string): Promise<void> {
    const pending = await this.repository.findLatestPending(userId);

    if (!pending) {
      throw new AppError('Nenhum código pendente. Solicite um novo código.', 400, 'OTP_NOT_FOUND');
    }

    if (pending.expiresAt.getTime() < Date.now()) {
      throw new AppError('Código expirado. Solicite um novo código.', 400, 'OTP_EXPIRED');
    }

    // Reserva a tentativa de forma atômica ANTES de comparar o código (ver `claimAttempt`): assim,
    // mesmo com vários palpites em paralelo, no máximo OTP_MAX_ATTEMPTS deles chegam a ser
    // comparados — ler `pending.attempts` sozinho (como era antes) deixa passar mais que isso.
    const canTry = await this.repository.claimAttempt(pending.id, env.OTP_MAX_ATTEMPTS);
    if (!canTry) {
      throw new AppError(
        'Número máximo de tentativas excedido. Solicite um novo código.',
        400,
        'OTP_MAX_ATTEMPTS_REACHED',
      );
    }

    const isValid = await bcrypt.compare(code, pending.codeHash);
    if (!isValid) {
      throw new UnauthorizedError('Código inválido.');
    }

    await this.repository.markConsumed(pending.id);
    const user = await this.users.markPhoneVerified(userId);

    // A conta já está verificada neste ponto: uma falha no e-mail de
    // boas-vindas não pode transformar a verificação em erro para a usuária.
    try {
      await this.mail.sendWelcome(user);
    } catch (error) {
      logger.warn({ err: error, userId }, 'Falha ao enviar o e-mail de boas-vindas');
    }
  }

  async resend(user: OtpRecipient): Promise<void> {
    const userId = user.id;
    const lastCreated = await this.repository.findLastCreated(userId);

    if (lastCreated) {
      const secondsSinceLast = (Date.now() - lastCreated.createdAt.getTime()) / 1000;
      if (secondsSinceLast < env.OTP_RESEND_COOLDOWN_SECONDS) {
        const waitSeconds = Math.ceil(env.OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLast);
        throw new TooManyRequestsError(
          `Aguarde ${waitSeconds}s antes de solicitar um novo código.`,
        );
      }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60_000);
    const sentInLastHour = await this.repository.countCreatedSince(userId, oneHourAgo);
    if (sentInLastHour >= env.OTP_RESEND_MAX_PER_HOUR) {
      throw new TooManyRequestsError('Limite de reenvios atingido. Tente novamente mais tarde.');
    }

    await this.repository.expirePending(userId);
    await this.generateAndSend(user, { isResend: true });
  }
}

export const otpService = new OtpService();
