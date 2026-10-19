import bcrypt from 'bcryptjs';
import { PasswordResetService } from '../passwordReset.service';
import type { PasswordResetRepository } from '../passwordReset.repository';
import type { PasswordResetCode } from '../passwordReset.types';
import type { UsersRepository } from '../../users/users.repository';
import type { User } from '../../users/users.types';
import type { SessionService } from '../../sessions/sessions.service';
import type { MailService } from '../../../shared/mail/mailService';
import { AppError } from '../../../shared/errors/AppError';

function createRepositoryMock(): jest.Mocked<PasswordResetRepository> {
  return {
    create: jest.fn(),
    findLatestPending: jest.fn(),
    findLastCreated: jest.fn(),
    countCreatedSince: jest.fn(),
    claimAttempt: jest.fn(),
    consume: jest.fn(),
    revokePending: jest.fn(),
  };
}

function createUsersMock(): jest.Mocked<UsersRepository> {
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

function createSessionsMock(): jest.Mocked<SessionService> {
  return {
    start: jest.fn(),
    refresh: jest.fn(),
    end: jest.fn(),
    endAllForUser: jest.fn(),
  } as unknown as jest.Mocked<SessionService>;
}

function createMailMock(): jest.Mocked<MailService> {
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
    passwordHash: 'old-hash',
    googleId: null,
    phoneVerifiedAt: new Date(),
    role: 'user',
    createdAt: new Date(),
    ...overrides,
  };
}

async function buildPending(
  overrides: Partial<PasswordResetCode> = {},
): Promise<PasswordResetCode> {
  return {
    id: 'reset-1',
    userId: 'user-1',
    codeHash: await bcrypt.hash('123456', 4),
    expiresAt: new Date(Date.now() + 15 * 60_000),
    attempts: 0,
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function build() {
  const repository = createRepositoryMock();
  const users = createUsersMock();
  const sessions = createSessionsMock();
  const mail = createMailMock();
  const service = new PasswordResetService(repository, users, sessions, mail);
  return { repository, users, sessions, mail, service };
}

const INPUT = { email: 'ana@email.com', code: '123456', password: 'nova-senha' };

describe('PasswordResetService', () => {
  describe('requestReset', () => {
    it('não faz nada (e não lança) quando não existe conta com o e-mail', async () => {
      const { repository, users, mail, service } = build();
      users.findByEmail.mockResolvedValue(null);

      await expect(service.requestReset('ninguem@email.com')).resolves.toBeUndefined();

      expect(repository.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('guarda só o hash do código de 6 dígitos e envia o código em claro por e-mail', async () => {
      const { repository, users, mail, service } = build();
      const user = buildUser();
      users.findByEmail.mockResolvedValue(user);
      repository.findLastCreated.mockResolvedValue(null);
      repository.countCreatedSince.mockResolvedValue(0);

      await service.requestReset('ana@email.com');

      expect(mail.sendPasswordReset).toHaveBeenCalledTimes(1);
      const [recipient, code, options] = mail.sendPasswordReset.mock.calls[0];
      expect(recipient).toBe(user);
      expect(code).toMatch(/^\d{6}$/);
      expect(options).toEqual({ expiresInMinutes: 15 });

      const created = repository.create.mock.calls[0][0];
      expect(created.userId).toBe('user-1');
      expect(created.codeHash).not.toBe(code);
      await expect(bcrypt.compare(code, created.codeHash)).resolves.toBe(true);
      expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
      expect(created.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60_000);
    });

    it('invalida os códigos anteriores antes de criar o novo (só o mais recente vale)', async () => {
      const { repository, users, service } = build();
      users.findByEmail.mockResolvedValue(buildUser());
      repository.findLastCreated.mockResolvedValue(null);
      repository.countCreatedSince.mockResolvedValue(0);

      await service.requestReset('ana@email.com');

      expect(repository.revokePending).toHaveBeenCalledWith('user-1');
      expect(repository.revokePending.mock.invocationCallOrder[0]).toBeLessThan(
        repository.create.mock.invocationCallOrder[0],
      );
    });

    it('ignora silenciosamente o pedido durante o cooldown', async () => {
      const { repository, users, mail, service } = build();
      users.findByEmail.mockResolvedValue(buildUser());
      repository.findLastCreated.mockResolvedValue(await buildPending({ createdAt: new Date() }));

      await expect(service.requestReset('ana@email.com')).resolves.toBeUndefined();

      expect(repository.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('ignora silenciosamente o pedido ao atingir o limite por hora', async () => {
      const { repository, users, mail, service } = build();
      users.findByEmail.mockResolvedValue(buildUser());
      repository.findLastCreated.mockResolvedValue(
        await buildPending({ createdAt: new Date(Date.now() - 10 * 60_000) }),
      );
      repository.countCreatedSince.mockResolvedValue(5);

      await expect(service.requestReset('ana@email.com')).resolves.toBeUndefined();

      expect(repository.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('não lança quando o envio do e-mail falha (a resposta não pode variar)', async () => {
      const { repository, users, mail, service } = build();
      users.findByEmail.mockResolvedValue(buildUser());
      repository.findLastCreated.mockResolvedValue(null);
      repository.countCreatedSince.mockResolvedValue(0);
      mail.sendPasswordReset.mockRejectedValue(new Error('Resend fora do ar'));

      await expect(service.requestReset('ana@email.com')).resolves.toBeUndefined();
    });
  });

  describe('resetPassword', () => {
    // Todas as falhas precisam ser indistinguíveis para quem chama.
    async function expectInvalid(promise: Promise<unknown>) {
      const error = await promise.then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('PASSWORD_RESET_CODE_INVALID');
      expect((error as AppError).statusCode).toBe(400);
      expect((error as AppError).message).toBe('Código inválido ou expirado. Solicite um novo.');
    }

    it('recusa e-mail sem conta, sem tentar reservar tentativa', async () => {
      const { repository, users, service } = build();
      users.findByEmail.mockResolvedValue(null);

      await expectInvalid(service.resetPassword(INPUT));

      expect(repository.claimAttempt).not.toHaveBeenCalled();
      expect(users.updatePassword).not.toHaveBeenCalled();
    });

    it('recusa quando não há código pendente', async () => {
      const { repository, users, service } = build();
      users.findByEmail.mockResolvedValue(buildUser());
      repository.findLatestPending.mockResolvedValue(null);

      await expectInvalid(service.resetPassword(INPUT));

      expect(repository.claimAttempt).not.toHaveBeenCalled();
    });

    it('recusa (sem nem comparar o código) quando a tentativa não pode ser reservada: expirado, esgotado ou já usado', async () => {
      const { repository, users, service } = build();
      users.findByEmail.mockResolvedValue(buildUser());
      repository.findLatestPending.mockResolvedValue(await buildPending());
      repository.claimAttempt.mockResolvedValue(false);

      // Mesmo com o código CERTO: sem tentativa reservada não há como acertar.
      await expectInvalid(service.resetPassword(INPUT));

      expect(repository.consume).not.toHaveBeenCalled();
      expect(users.updatePassword).not.toHaveBeenCalled();
    });

    it('reserva a tentativa com o limite configurado ANTES de comparar', async () => {
      const { repository, users, service } = build();
      users.findByEmail.mockResolvedValue(buildUser());
      repository.findLatestPending.mockResolvedValue(await buildPending());
      repository.claimAttempt.mockResolvedValue(false);

      await expectInvalid(service.resetPassword(INPUT));

      expect(repository.claimAttempt).toHaveBeenCalledWith('reset-1', 5);
    });

    it('recusa código errado (a tentativa já foi contada) e não consome o código', async () => {
      const { repository, users, service } = build();
      users.findByEmail.mockResolvedValue(buildUser());
      repository.findLatestPending.mockResolvedValue(await buildPending());
      repository.claimAttempt.mockResolvedValue(true);

      await expectInvalid(service.resetPassword({ ...INPUT, code: '000000' }));

      expect(repository.claimAttempt).toHaveBeenCalledTimes(1);
      expect(repository.consume).not.toHaveBeenCalled();
      expect(users.updatePassword).not.toHaveBeenCalled();
    });

    it('recusa quando outro pedido consumiu o código no meio-tempo (corrida)', async () => {
      const { repository, users, service } = build();
      users.findByEmail.mockResolvedValue(buildUser());
      repository.findLatestPending.mockResolvedValue(await buildPending());
      repository.claimAttempt.mockResolvedValue(true);
      repository.consume.mockResolvedValue(false);

      await expectInvalid(service.resetPassword(INPUT));

      expect(users.updatePassword).not.toHaveBeenCalled();
    });

    it('troca a senha (com hash), invalida outros códigos, derruba a sessão e avisa por e-mail', async () => {
      const { repository, users, sessions, mail, service } = build();
      const user = buildUser();
      users.findByEmail.mockResolvedValue(user);
      repository.findLatestPending.mockResolvedValue(await buildPending());
      repository.claimAttempt.mockResolvedValue(true);
      repository.consume.mockResolvedValue(true);
      users.updatePassword.mockResolvedValue(user);

      await service.resetPassword(INPUT);

      expect(repository.consume).toHaveBeenCalledWith('reset-1');
      const [userId, passwordHash] = users.updatePassword.mock.calls[0];
      expect(userId).toBe('user-1');
      expect(passwordHash).not.toBe('nova-senha');
      await expect(bcrypt.compare('nova-senha', passwordHash)).resolves.toBe(true);

      expect(repository.revokePending).toHaveBeenCalledWith('user-1');
      expect(sessions.endAllForUser).toHaveBeenCalledWith('user-1');
      expect(mail.sendPasswordChanged).toHaveBeenCalledWith(user);
    });

    it('conclui a troca mesmo se o aviso de senha alterada falhar', async () => {
      const { repository, users, mail, service } = build();
      users.findByEmail.mockResolvedValue(buildUser());
      repository.findLatestPending.mockResolvedValue(await buildPending());
      repository.claimAttempt.mockResolvedValue(true);
      repository.consume.mockResolvedValue(true);
      users.updatePassword.mockResolvedValue(buildUser());
      mail.sendPasswordChanged.mockRejectedValue(new Error('Resend fora do ar'));

      await expect(service.resetPassword(INPUT)).resolves.toBeUndefined();
    });
  });
});
