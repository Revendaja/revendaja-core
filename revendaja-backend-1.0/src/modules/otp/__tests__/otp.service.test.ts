import bcrypt from 'bcryptjs';
import { OtpService } from '../otp.service';
import { AppError, TooManyRequestsError, UnauthorizedError } from '../../../shared/errors/AppError';
import type { OtpRepository } from '../otp.repository';
import type { OtpCode } from '../otp.types';
import type { UsersRepository } from '../../users/users.repository';
import type { User } from '../../users/users.types';
import type { MailService } from '../../../shared/mail/mailService';

function createOtpRepositoryMock(): jest.Mocked<OtpRepository> {
  return {
    create: jest.fn(),
    findLatestPending: jest.fn(),
    findLastCreated: jest.fn(),
    countCreatedSince: jest.fn(),
    claimAttempt: jest.fn().mockResolvedValue(true),
    markConsumed: jest.fn(),
    expirePending: jest.fn(),
  };
}

function createUsersRepositoryMock(): jest.Mocked<UsersRepository> {
  return {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findByWhatsapp: jest.fn(),
    findByGoogleId: jest.fn(),
    create: jest.fn(),
    createFromGoogle: jest.fn(),
    linkGoogleId: jest.fn(),
    markPhoneVerified: jest.fn(),
    updateProfile: jest.fn(),
    updatePassword: jest.fn(),
  };
}

function createMailServiceMock(): jest.Mocked<MailService> {
  return {
    sendWelcome: jest.fn(),
    sendVerificationCode: jest.fn(),
    sendPasswordReset: jest.fn(),
    sendPasswordChanged: jest.fn(),
  } as unknown as jest.Mocked<MailService>;
}

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    name: 'Ana Souza',
    email: 'ana@email.com',
    whatsapp: '5511982214432',
    passwordHash: 'hash',
    googleId: null,
    phoneVerifiedAt: null,
    role: 'user',
    createdAt: new Date(),
    ...overrides,
  };
}

async function buildPending(overrides: Partial<OtpCode> = {}): Promise<OtpCode> {
  return {
    id: 'otp-1',
    userId: 'user-1',
    codeHash: await bcrypt.hash('123456', 4),
    expiresAt: new Date(Date.now() + 10 * 60_000),
    attempts: 0,
    consumedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('OtpService', () => {
  describe('generateAndSend', () => {
    it('salva o código com hash e envia por e-mail', async () => {
      const otpRepository = createOtpRepositoryMock();
      const usersRepository = createUsersRepositoryMock();
      const mail = createMailServiceMock();
      otpRepository.create.mockImplementation((data) =>
        buildPending({ userId: data.userId, codeHash: data.codeHash, expiresAt: data.expiresAt }),
      );
      const service = new OtpService(otpRepository, usersRepository, mail);
      const user = buildUser();

      await service.generateAndSend(user);

      expect(otpRepository.create).toHaveBeenCalledTimes(1);
      const createArgs = otpRepository.create.mock.calls[0][0];
      expect(createArgs.userId).toBe('user-1');
      expect(createArgs.codeHash).not.toMatch(/^\d{6}$/);

      expect(mail.sendVerificationCode).toHaveBeenCalledTimes(1);
      const [recipient, code, options] = mail.sendVerificationCode.mock.calls[0];
      expect(recipient).toBe(user);
      expect(code).toMatch(/^\d{6}$/);
      expect(options).toEqual({ expiresInMinutes: 10, isResend: undefined });
    });
  });

  describe('verify', () => {
    it('lança erro quando não há código pendente', async () => {
      const otpRepository = createOtpRepositoryMock();
      const usersRepository = createUsersRepositoryMock();
      otpRepository.findLatestPending.mockResolvedValue(null);
      const service = new OtpService(otpRepository, usersRepository, createMailServiceMock());

      await expect(service.verify('user-1', '123456')).rejects.toBeInstanceOf(AppError);
    });

    it('lança erro quando o código está expirado', async () => {
      const otpRepository = createOtpRepositoryMock();
      const usersRepository = createUsersRepositoryMock();
      otpRepository.findLatestPending.mockResolvedValue(
        await buildPending({ expiresAt: new Date(Date.now() - 1000) }),
      );
      const service = new OtpService(otpRepository, usersRepository, createMailServiceMock());

      await expect(service.verify('user-1', '123456')).rejects.toBeInstanceOf(AppError);
    });

    it('lança erro quando o número máximo de tentativas foi excedido (claim atômico recusa)', async () => {
      const otpRepository = createOtpRepositoryMock();
      const usersRepository = createUsersRepositoryMock();
      const pending = await buildPending();
      otpRepository.findLatestPending.mockResolvedValue(pending);
      otpRepository.claimAttempt.mockResolvedValue(false);
      const service = new OtpService(otpRepository, usersRepository, createMailServiceMock());

      await expect(service.verify('user-1', '123456')).rejects.toMatchObject({
        code: 'OTP_MAX_ATTEMPTS_REACHED',
      });
      expect(otpRepository.claimAttempt).toHaveBeenCalledWith(pending.id, expect.any(Number));
    });

    it('reserva a tentativa de forma atômica ANTES de comparar, e lança UnauthorizedError quando o código está errado', async () => {
      const otpRepository = createOtpRepositoryMock();
      const usersRepository = createUsersRepositoryMock();
      const mail = createMailServiceMock();
      const pending = await buildPending();
      otpRepository.findLatestPending.mockResolvedValue(pending);
      const service = new OtpService(otpRepository, usersRepository, mail);

      await expect(service.verify('user-1', '000000')).rejects.toBeInstanceOf(UnauthorizedError);
      expect(otpRepository.claimAttempt).toHaveBeenCalledWith(pending.id, expect.any(Number));
      expect(mail.sendWelcome).not.toHaveBeenCalled();
    });

    it('marca como consumido, verifica o usuário e envia o e-mail de boas-vindas', async () => {
      const otpRepository = createOtpRepositoryMock();
      const usersRepository = createUsersRepositoryMock();
      const mail = createMailServiceMock();
      const pending = await buildPending();
      const verifiedUser = buildUser({ phoneVerifiedAt: new Date() });
      otpRepository.findLatestPending.mockResolvedValue(pending);
      usersRepository.markPhoneVerified.mockResolvedValue(verifiedUser);
      const service = new OtpService(otpRepository, usersRepository, mail);

      await service.verify('user-1', '123456');

      expect(otpRepository.markConsumed).toHaveBeenCalledWith(pending.id);
      expect(usersRepository.markPhoneVerified).toHaveBeenCalledWith('user-1');
      expect(mail.sendWelcome).toHaveBeenCalledWith(verifiedUser);
    });

    it('não falha a verificação quando o e-mail de boas-vindas não pode ser enviado', async () => {
      const otpRepository = createOtpRepositoryMock();
      const usersRepository = createUsersRepositoryMock();
      const mail = createMailServiceMock();
      otpRepository.findLatestPending.mockResolvedValue(await buildPending());
      usersRepository.markPhoneVerified.mockResolvedValue(buildUser());
      mail.sendWelcome.mockRejectedValue(new Error('Resend fora do ar'));
      const service = new OtpService(otpRepository, usersRepository, mail);

      await expect(service.verify('user-1', '123456')).resolves.toBeUndefined();
    });
  });

  describe('resend', () => {
    it('lança TooManyRequestsError durante o cooldown', async () => {
      const otpRepository = createOtpRepositoryMock();
      const usersRepository = createUsersRepositoryMock();
      otpRepository.findLastCreated.mockResolvedValue(
        await buildPending({ createdAt: new Date() }),
      );
      const service = new OtpService(otpRepository, usersRepository, createMailServiceMock());

      await expect(service.resend(buildUser())).rejects.toBeInstanceOf(TooManyRequestsError);
    });

    it('lança TooManyRequestsError ao atingir o limite por hora', async () => {
      const otpRepository = createOtpRepositoryMock();
      const usersRepository = createUsersRepositoryMock();
      otpRepository.findLastCreated.mockResolvedValue(
        await buildPending({ createdAt: new Date(Date.now() - 60 * 60_000) }),
      );
      otpRepository.countCreatedSince.mockResolvedValue(5);
      const service = new OtpService(otpRepository, usersRepository, createMailServiceMock());

      await expect(service.resend(buildUser())).rejects.toBeInstanceOf(TooManyRequestsError);
    });

    it('expira o código pendente e envia um novo por e-mail quando dentro do limite', async () => {
      const otpRepository = createOtpRepositoryMock();
      const usersRepository = createUsersRepositoryMock();
      const mail = createMailServiceMock();
      otpRepository.findLastCreated.mockResolvedValue(
        await buildPending({ createdAt: new Date(Date.now() - 60 * 60_000) }),
      );
      otpRepository.countCreatedSince.mockResolvedValue(0);
      otpRepository.create.mockImplementation((data) =>
        buildPending({ userId: data.userId, codeHash: data.codeHash, expiresAt: data.expiresAt }),
      );
      const service = new OtpService(otpRepository, usersRepository, mail);

      await service.resend(buildUser());

      expect(otpRepository.expirePending).toHaveBeenCalledWith('user-1');
      expect(otpRepository.create).toHaveBeenCalledTimes(1);
      expect(mail.sendVerificationCode).toHaveBeenCalledTimes(1);
      expect(mail.sendVerificationCode.mock.calls[0][2]).toEqual({
        expiresInMinutes: 10,
        isResend: true,
      });
    });
  });
});
