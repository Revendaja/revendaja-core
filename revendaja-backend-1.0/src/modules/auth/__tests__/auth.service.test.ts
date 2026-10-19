import bcrypt from 'bcryptjs';
import { AuthService } from '../auth.service';
import { ConflictError, UnauthorizedError } from '../../../shared/errors/AppError';
import type { UsersRepository } from '../../users/users.repository';
import type { User } from '../../users/users.types';
import type { StoreRepository } from '../../store/store.repository';
import type { Store } from '../../store/store.types';
import type { OtpService } from '../../otp/otp.service';
import type { SessionService } from '../../sessions/sessions.service';
import { verifyGoogleIdToken } from '../google';

jest.mock('../google');
const mockedVerifyGoogleIdToken = verifyGoogleIdToken as jest.MockedFunction<typeof verifyGoogleIdToken>;

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

function createSessionServiceMock(): jest.Mocked<SessionService> {
  return {
    start: jest
      .fn()
      .mockResolvedValue({ accessToken: 'access-token', refreshToken: 'refresh-token' }),
    refresh: jest.fn(),
    end: jest.fn(),
    endAllForUser: jest.fn(),
  } as unknown as jest.Mocked<SessionService>;
}

function createStoreRepositoryMock(): jest.Mocked<StoreRepository> {
  return {
    findByUserId: jest.fn(),
    findByHandle: jest.fn(),
    create: jest.fn(),
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    updateStore: jest.fn(),
    applyDefaultMinStockToExisting: jest.fn(),
    setMonthlyGoal: jest.fn(),
    findLowStock: jest.fn(),
    countStoreProducts: jest.fn(),
    countFrozenStoreProducts: jest.fn(),
    reconcileFrozenProducts: jest.fn(),
    findStoreProductByProductId: jest.fn(),
    findStoreProductById: jest.fn(),
    listStoreProducts: jest.fn(),
    createStoreProduct: jest.fn(),
    createManualStoreProduct: jest.fn(),
    findComponentCandidates: jest.fn(),
    isComponentOfAnotherKit: jest.fn(),
    updateStoreProduct: jest.fn(),
    deleteStoreProduct: jest.fn(),
    listCategories: jest.fn(),
    createCategory: jest.fn(),
    findCategoryById: jest.fn(),
    deleteCategory: jest.fn(),
    findProductsWithMinStockConfigured: jest.fn(),
    claimLowStockNotification: jest.fn(),
    resetLowStockNotification: jest.fn(),
    findStoresWithMonthlyGoal: jest.fn(),
    findStoresDueForPromotion: jest.fn(),
    markPromotionNotified: jest.fn(),
  };
}

function createOtpServiceMock(): jest.Mocked<OtpService> {
  return {
    generateAndSend: jest.fn(),
    verify: jest.fn(),
    resend: jest.fn(),
  } as unknown as jest.Mocked<OtpService>;
}

async function buildUser(overrides: Partial<User> = {}): Promise<User> {
  return {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    name: 'Ana Souza',
    email: 'ana@email.com',
    whatsapp: '5511982214432',
    passwordHash: await bcrypt.hash('senha-correta', 4),
    googleId: null,
    phoneVerifiedAt: null,
    role: 'user',
    createdAt: new Date(),
    ...overrides,
  };
}

function buildStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 'store-1',
    userId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    storeName: 'Leal Perfumaria',
    handle: 'lealperfumaria',
    catalogLink: 'https://lealperfumaria.revendaja.com',
    isOnline: true,
    bio: null,
    plan: 'free',
    defaultMinStock: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  describe('register', () => {
    it('lança ConflictError quando o e-mail já existe', async () => {
      const users = createUsersRepositoryMock();
      users.findByEmail.mockResolvedValue(await buildUser());
      users.findByWhatsapp.mockResolvedValue(null);
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        createSessionServiceMock(),
      );

      await expect(
        service.register({
          name: 'Ana',
          email: 'ana@email.com',
          whatsapp: '5511982214432',
          password: '123456',
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('lança ConflictError quando o whatsapp já existe', async () => {
      const users = createUsersRepositoryMock();
      users.findByEmail.mockResolvedValue(null);
      users.findByWhatsapp.mockResolvedValue(await buildUser());
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        createSessionServiceMock(),
      );

      await expect(
        service.register({
          name: 'Ana',
          email: 'ana@email.com',
          whatsapp: '5511982214432',
          password: '123456',
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('corrida: outra requisição cria a MESMA conta entre a checagem e o insert: 409 ConflictError', async () => {
      const users = createUsersRepositoryMock();
      users.findByEmail.mockResolvedValue(null);
      users.findByWhatsapp.mockResolvedValue(null);
      users.create.mockResolvedValue({ kind: 'already_exists' });
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        createSessionServiceMock(),
      );

      await expect(
        service.register({
          name: 'Ana',
          email: 'ana@email.com',
          whatsapp: '5511982214432',
          password: '123456',
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('cria o usuário, envia o OTP e retorna isVerified/hasStore como false', async () => {
      const users = createUsersRepositoryMock();
      const otp = createOtpServiceMock();
      users.findByEmail.mockResolvedValue(null);
      users.findByWhatsapp.mockResolvedValue(null);
      users.create.mockImplementation((data) => buildUser(data).then((user) => ({ kind: 'created' as const, user })));
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        otp,
        createSessionServiceMock(),
      );

      const result = await service.register({
        name: 'Ana',
        email: 'ana@email.com',
        whatsapp: '5511982214432',
        password: '123456',
      });

      expect(otp.generateAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ id: result.user.id, email: 'ana@email.com' }),
      );
      expect(result.isVerified).toBe(false);
      expect(result.hasStore).toBe(false);
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('inicia a sessão da usuária recém-criada', async () => {
      const users = createUsersRepositoryMock();
      const sessions = createSessionServiceMock();
      users.findByEmail.mockResolvedValue(null);
      users.findByWhatsapp.mockResolvedValue(null);
      users.create.mockImplementation((data) => buildUser(data).then((user) => ({ kind: 'created' as const, user })));
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        sessions,
      );

      const result = await service.register({
        name: 'Ana',
        email: 'ana@email.com',
        whatsapp: '5511982214432',
        password: '123456',
      });

      expect(sessions.start).toHaveBeenCalledWith(result.user.id);
    });

    it('conclui o cadastro mesmo quando o envio do código por e-mail falha', async () => {
      const users = createUsersRepositoryMock();
      const otp = createOtpServiceMock();
      users.findByEmail.mockResolvedValue(null);
      users.findByWhatsapp.mockResolvedValue(null);
      users.create.mockImplementation((data) => buildUser(data).then((user) => ({ kind: 'created' as const, user })));
      otp.generateAndSend.mockRejectedValue(new Error('Resend fora do ar'));
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        otp,
        createSessionServiceMock(),
      );

      const result = await service.register({
        name: 'Ana',
        email: 'ana@email.com',
        whatsapp: '5511982214432',
        password: '123456',
      });

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.isVerified).toBe(false);
    });
  });

  describe('login', () => {
    it('lança UnauthorizedError quando o e-mail não existe', async () => {
      const users = createUsersRepositoryMock();
      users.findByEmail.mockResolvedValue(null);
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        createSessionServiceMock(),
      );

      await expect(
        service.login({ email: 'inexistente@email.com', password: '123456' }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('lança UnauthorizedError quando a senha está incorreta', async () => {
      const users = createUsersRepositoryMock();
      users.findByEmail.mockResolvedValue(await buildUser());
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        createSessionServiceMock(),
      );

      await expect(
        service.login({ email: 'ana@email.com', password: 'senha-errada' }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('lança UnauthorizedError quando a conta só tem login via Google (sem senha)', async () => {
      const users = createUsersRepositoryMock();
      users.findByEmail.mockResolvedValue(await buildUser({ passwordHash: null, googleId: 'google-1' }));
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        createSessionServiceMock(),
      );

      await expect(
        service.login({ email: 'ana@email.com', password: 'qualquer-senha' }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('retorna isVerified true e hasStore true quando aplicável', async () => {
      const users = createUsersRepositoryMock();
      const stores = createStoreRepositoryMock();
      users.findByEmail.mockResolvedValue(await buildUser({ phoneVerifiedAt: new Date() }));
      stores.findByUserId.mockResolvedValue(buildStore());
      const service = new AuthService(
        users,
        stores,
        createOtpServiceMock(),
        createSessionServiceMock(),
      );

      const result = await service.login({ email: 'ana@email.com', password: 'senha-correta' });

      expect(result.isVerified).toBe(true);
      expect(result.hasStore).toBe(true);
    });

    it('inicia a sessão (substituindo a anterior) só quando as credenciais estão certas', async () => {
      const users = createUsersRepositoryMock();
      const sessions = createSessionServiceMock();
      const user = await buildUser();
      users.findByEmail.mockResolvedValue(user);
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        sessions,
      );

      await expect(
        service.login({ email: 'ana@email.com', password: 'senha-errada' }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect(sessions.start).not.toHaveBeenCalled();

      const result = await service.login({ email: 'ana@email.com', password: 'senha-correta' });

      expect(sessions.start).toHaveBeenCalledWith(user.id);
      expect(result.accessToken).toBe('access-token');
    });
  });

  describe('loginWithGoogle', () => {
    beforeEach(() => {
      mockedVerifyGoogleIdToken.mockReset();
    });

    it('cria uma conta nova (sem senha/whatsapp) na primeira vez que vê esse googleId e e-mail', async () => {
      mockedVerifyGoogleIdToken.mockResolvedValue({
        googleId: 'google-1',
        email: 'nova@email.com',
        name: 'Nova Usuária',
      });
      const users = createUsersRepositoryMock();
      const stores = createStoreRepositoryMock();
      users.findByGoogleId.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(null);
      stores.findByUserId.mockResolvedValue(null);
      users.createFromGoogle.mockImplementation((data) =>
        buildUser({ ...data, whatsapp: null, passwordHash: null, phoneVerifiedAt: new Date() }).then((user) => ({
          kind: 'created' as const,
          user,
        })),
      );
      const service = new AuthService(users, stores, createOtpServiceMock(), createSessionServiceMock());

      const result = await service.loginWithGoogle('id-token');

      expect(users.createFromGoogle).toHaveBeenCalledWith({
        name: 'Nova Usuária',
        email: 'nova@email.com',
        googleId: 'google-1',
      });
      expect(result.isVerified).toBe(true);
      expect(result.hasStore).toBe(false);
      expect(result.needsWhatsapp).toBe(true);
    });

    it('vincula o Google a uma conta antiga com o mesmo e-mail em vez de duplicar', async () => {
      mockedVerifyGoogleIdToken.mockResolvedValue({
        googleId: 'google-1',
        email: 'ana@email.com',
        name: 'Ana Souza',
      });
      const users = createUsersRepositoryMock();
      const existing = await buildUser({ phoneVerifiedAt: null });
      users.findByGoogleId.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(existing);
      users.linkGoogleId.mockImplementation((id, googleId) =>
        buildUser({ id, googleId, phoneVerifiedAt: new Date() }),
      );
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        createSessionServiceMock(),
      );

      const result = await service.loginWithGoogle('id-token');

      expect(users.createFromGoogle).not.toHaveBeenCalled();
      // A conta antiga ainda não tinha verificado o e-mail: o Google já prova a posse, então marca.
      expect(users.linkGoogleId).toHaveBeenCalledWith(existing.id, 'google-1', true);
      expect(result.isVerified).toBe(true);
      expect(result.needsWhatsapp).toBe(false);
    });

    it('autentica direto quando já existe conta com esse googleId', async () => {
      mockedVerifyGoogleIdToken.mockResolvedValue({
        googleId: 'google-1',
        email: 'ana@email.com',
        name: 'Ana Souza',
      });
      const users = createUsersRepositoryMock();
      const sessions = createSessionServiceMock();
      const user = await buildUser({ googleId: 'google-1' });
      users.findByGoogleId.mockResolvedValue(user);
      const service = new AuthService(users, createStoreRepositoryMock(), createOtpServiceMock(), sessions);

      await service.loginWithGoogle('id-token');

      expect(users.findByEmail).not.toHaveBeenCalled();
      expect(sessions.start).toHaveBeenCalledWith(user.id);
    });

    it('corrida: duas primeiras tentativas criam a MESMA conta nova ao mesmo tempo: 409 ConflictError', async () => {
      mockedVerifyGoogleIdToken.mockResolvedValue({
        googleId: 'google-1',
        email: 'nova@email.com',
        name: 'Nova Usuária',
      });
      const users = createUsersRepositoryMock();
      users.findByGoogleId.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(null);
      users.createFromGoogle.mockResolvedValue({ kind: 'already_exists' });
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        createSessionServiceMock(),
      );

      await expect(service.loginWithGoogle('id-token')).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('logout', () => {
    it('encerra a sessão informada', async () => {
      const sessions = createSessionServiceMock();
      const service = new AuthService(
        createUsersRepositoryMock(),
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        sessions,
      );

      await service.logout('session-1');

      expect(sessions.end).toHaveBeenCalledWith('session-1');
    });
  });

  describe('refresh', () => {
    it('delega a troca do refresh token para a sessão e devolve o novo access token', async () => {
      const sessions = createSessionServiceMock();
      sessions.refresh.mockResolvedValue({ accessToken: 'novo-access-token' });
      const service = new AuthService(
        createUsersRepositoryMock(),
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        sessions,
      );

      const result = await service.refresh('refresh-token');

      expect(sessions.refresh).toHaveBeenCalledWith('refresh-token');
      expect(result).toEqual({ accessToken: 'novo-access-token' });
    });
  });

  describe('getMe', () => {
    it('retorna o usuário, isVerified e a loja (ou null)', async () => {
      const users = createUsersRepositoryMock();
      const stores = createStoreRepositoryMock();
      users.findById.mockResolvedValue(await buildUser({ phoneVerifiedAt: new Date() }));
      stores.findByUserId.mockResolvedValue(null);
      const service = new AuthService(
        users,
        stores,
        createOtpServiceMock(),
        createSessionServiceMock(),
      );

      const result = await service.getMe('3fa85f64-5717-4562-b3fc-2c963f66afa6');

      expect(result.isVerified).toBe(true);
      expect(result.store).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('lança UnauthorizedError quando a usuária não existe', async () => {
      const users = createUsersRepositoryMock();
      users.findById.mockResolvedValue(null);
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        createSessionServiceMock(),
      );

      await expect(service.updateProfile('user-1', { name: 'Nova' })).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it('grava só o nome quando só o nome mudou', async () => {
      const users = createUsersRepositoryMock();
      const user = await buildUser({ id: 'user-1', name: 'Ana' });
      users.findById.mockResolvedValue(user);
      users.updateProfile.mockResolvedValue({ kind: 'updated', user: { ...user, name: 'Ana Souza' } });
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        createSessionServiceMock(),
      );

      const result = await service.updateProfile('user-1', { name: 'Ana Souza' });

      expect(users.updateProfile).toHaveBeenCalledWith('user-1', { name: 'Ana Souza' });
      expect(result.name).toBe('Ana Souza');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('grava só o whatsapp quando só o whatsapp mudou', async () => {
      const users = createUsersRepositoryMock();
      const user = await buildUser({ id: 'user-1', whatsapp: '5511900000000' });
      users.findById.mockResolvedValue(user);
      users.updateProfile.mockResolvedValue({
        kind: 'updated',
        user: { ...user, whatsapp: '5511911111111' },
      });
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        createSessionServiceMock(),
      );

      const result = await service.updateProfile('user-1', { whatsapp: '5511911111111' });

      expect(users.updateProfile).toHaveBeenCalledWith('user-1', { whatsapp: '5511911111111' });
      expect(result.whatsapp).toBe('5511911111111');
    });

    it('nada mudou de verdade: não toca no banco (idempotente)', async () => {
      const users = createUsersRepositoryMock();
      const user = await buildUser({ id: 'user-1', name: 'Ana' });
      users.findById.mockResolvedValue(user);
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        createSessionServiceMock(),
      );

      const result = await service.updateProfile('user-1', { name: 'Ana' });

      expect(users.updateProfile).not.toHaveBeenCalled();
      expect(result.name).toBe('Ana');
    });

    it('corrida: outra conta já pegou o mesmo whatsapp entre a checagem e o update: 409 ConflictError', async () => {
      const users = createUsersRepositoryMock();
      const user = await buildUser({ id: 'user-1', whatsapp: '5511900000000' });
      users.findById.mockResolvedValue(user);
      users.updateProfile.mockResolvedValue({ kind: 'already_exists' });
      const service = new AuthService(
        users,
        createStoreRepositoryMock(),
        createOtpServiceMock(),
        createSessionServiceMock(),
      );

      await expect(
        service.updateProfile('user-1', { whatsapp: '5511911111111' }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });
});
