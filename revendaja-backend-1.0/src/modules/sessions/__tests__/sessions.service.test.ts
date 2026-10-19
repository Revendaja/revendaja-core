import jwt from 'jsonwebtoken';
import { SessionService } from '../sessions.service';
import type { SessionsRepository } from '../sessions.repository';
import type { Session } from '../sessions.types';
import { UnauthorizedError } from '../../../shared/errors/AppError';

function createSessionsRepositoryMock(): jest.Mocked<SessionsRepository> {
  return {
    findById: jest.fn(),
    replaceForUser: jest.fn(),
    deleteById: jest.fn(),
    deleteByUserId: jest.fn(),
  };
}

describe('SessionService', () => {
  describe('start', () => {
    it('grava a sessão da usuária e emite tokens que carregam o id dessa sessão (sid)', async () => {
      const repository = createSessionsRepositoryMock();
      const service = new SessionService(repository);

      const { accessToken, refreshToken } = await service.start('user-1');

      expect(repository.replaceForUser).toHaveBeenCalledTimes(1);
      const [userId, sessionId] = repository.replaceForUser.mock.calls[0];
      expect(userId).toBe('user-1');

      const access = jwt.verify(accessToken, process.env.JWT_SECRET as string) as jwt.JwtPayload;
      const refresh = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET as string,
      ) as jwt.JwtPayload;
      expect(access.sub).toBe('user-1');
      expect(access.sid).toBe(sessionId);
      expect(refresh.sub).toBe('user-1');
      expect(refresh.sid).toBe(sessionId);
    });

    it('a sessão expira junto com o refresh token', async () => {
      const repository = createSessionsRepositoryMock();
      const service = new SessionService(repository);

      const { refreshToken } = await service.start('user-1');

      const expiresAt = repository.replaceForUser.mock.calls[0][2];
      const { exp } = jwt.decode(refreshToken) as { exp: number };
      expect(expiresAt.getTime()).toBe(exp * 1000);
      // JWT_REFRESH_EXPIRES_IN = 30d nos testes.
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60_000);
    });

    it('cada login gera um id de sessão novo (é o que derruba os tokens do login anterior)', async () => {
      const repository = createSessionsRepositoryMock();
      const service = new SessionService(repository);

      await service.start('user-1');
      await service.start('user-1');

      const firstId = repository.replaceForUser.mock.calls[0][1];
      const secondId = repository.replaceForUser.mock.calls[1][1];
      expect(firstId).not.toBe(secondId);
    });
  });

  describe('refresh', () => {
    function buildSession(overrides: Partial<Session> = {}): Session {
      return {
        id: 'session-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60 * 60_000),
        createdAt: new Date(),
        ...overrides,
      };
    }

    function signRefresh(payload: object, options: jwt.SignOptions = { expiresIn: '30d' }) {
      return jwt.sign(payload, process.env.JWT_REFRESH_SECRET as string, options);
    }

    it('emite um novo access token da MESMA sessão e não cria outra sessão', async () => {
      const repository = createSessionsRepositoryMock();
      repository.findById.mockResolvedValue(buildSession());
      const service = new SessionService(repository);

      const { accessToken } = await service.refresh(
        signRefresh({ sub: 'user-1', sid: 'session-1' }),
      );

      const payload = jwt.verify(accessToken, process.env.JWT_SECRET as string) as jwt.JwtPayload;
      expect(payload.sub).toBe('user-1');
      expect(payload.sid).toBe('session-1');
      expect(repository.findById).toHaveBeenCalledWith('session-1');
      expect(repository.replaceForUser).not.toHaveBeenCalled();
    });

    it('é idempotente: repetir o mesmo refresh token continua funcionando', async () => {
      const repository = createSessionsRepositoryMock();
      repository.findById.mockResolvedValue(buildSession());
      const service = new SessionService(repository);
      const refreshToken = signRefresh({ sub: 'user-1', sid: 'session-1' });

      await service.refresh(refreshToken);
      await expect(service.refresh(refreshToken)).resolves.toEqual({
        accessToken: expect.any(String),
      });
    });

    it('recusa um access token usado no lugar do refresh token', async () => {
      const repository = createSessionsRepositoryMock();
      const service = new SessionService(repository);
      const { accessToken } = await service.start('user-1');

      await expect(service.refresh(accessToken)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it('recusa token malformado', async () => {
      const service = new SessionService(createSessionsRepositoryMock());

      await expect(service.refresh('nao-e-um-jwt')).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('recusa refresh token expirado', async () => {
      const repository = createSessionsRepositoryMock();
      repository.findById.mockResolvedValue(buildSession());
      const service = new SessionService(repository);

      await expect(
        service.refresh(signRefresh({ sub: 'user-1', sid: 'session-1' }, { expiresIn: -10 })),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('recusa refresh token sem sid (emitido antes de existirem sessões)', async () => {
      const repository = createSessionsRepositoryMock();
      const service = new SessionService(repository);

      await expect(service.refresh(signRefresh({ sub: 'user-1' }))).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it('recusa quando a sessão foi substituída ou apagada (login em outro aparelho, logout)', async () => {
      const repository = createSessionsRepositoryMock();
      repository.findById.mockResolvedValue(null);
      const service = new SessionService(repository);

      await expect(
        service.refresh(signRefresh({ sub: 'user-1', sid: 'session-1' })),
      ).rejects.toThrow(/sessão encerrada/i);
    });

    it('recusa quando a sessão pertence a outra usuária', async () => {
      const repository = createSessionsRepositoryMock();
      repository.findById.mockResolvedValue(buildSession({ userId: 'outra-usuaria' }));
      const service = new SessionService(repository);

      await expect(
        service.refresh(signRefresh({ sub: 'user-1', sid: 'session-1' })),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('recusa quando a sessão já expirou no banco', async () => {
      const repository = createSessionsRepositoryMock();
      repository.findById.mockResolvedValue(
        buildSession({ expiresAt: new Date(Date.now() - 1000) }),
      );
      const service = new SessionService(repository);

      await expect(
        service.refresh(signRefresh({ sub: 'user-1', sid: 'session-1' })),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  it('end apaga a sessão pelo id', async () => {
    const repository = createSessionsRepositoryMock();

    await new SessionService(repository).end('session-1');

    expect(repository.deleteById).toHaveBeenCalledWith('session-1');
  });

  it('endAllForUser apaga a sessão da usuária', async () => {
    const repository = createSessionsRepositoryMock();

    await new SessionService(repository).endAllForUser('user-1');

    expect(repository.deleteByUserId).toHaveBeenCalledWith('user-1');
  });
});
