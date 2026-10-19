import bcrypt from 'bcryptjs';
import { ConflictError, UnauthorizedError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger';
import { usersRepository, type UsersRepository } from '../users/users.repository';
import type { User } from '../users/users.types';
import { storeRepository, type StoreRepository } from '../store/store.repository';
import { otpService, type OtpService } from '../otp/otp.service';
import { sessionService, type SessionService } from '../sessions/sessions.service';
import { verifyGoogleIdToken } from './google';
import type { LoginInput, RegisterInput, UpdateProfileInput } from './auth.schema';

const PASSWORD_SALT_ROUNDS = 10;

function toPublicUser(user: User) {
  return { id: user.id, name: user.name, email: user.email, whatsapp: user.whatsapp };
}

export class AuthService {
  constructor(
    private readonly users: UsersRepository = usersRepository,
    private readonly stores: StoreRepository = storeRepository,
    private readonly otp: OtpService = otpService,
    private readonly sessions: SessionService = sessionService,
  ) {}

  async register(input: RegisterInput) {
    const [existingEmail, existingWhatsapp] = await Promise.all([
      this.users.findByEmail(input.email),
      this.users.findByWhatsapp(input.whatsapp),
    ]);

    if (existingEmail) {
      throw new ConflictError('Já existe uma conta com este e-mail.');
    }
    if (existingWhatsapp) {
      throw new ConflictError('Já existe uma conta com este WhatsApp.');
    }

    const passwordHash = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);
    const result = await this.users.create({
      name: input.name,
      email: input.email,
      whatsapp: input.whatsapp,
      passwordHash,
    });
    // Corrida: outra requisição criou a conta com o mesmo e-mail/whatsapp entre a checagem acima e
    // este INSERT (índice único do banco recusou) — mesmo erro amigável do caminho comum.
    if (result.kind === 'already_exists') {
      throw new ConflictError('Já existe uma conta com este e-mail ou WhatsApp.');
    }
    const user = result.user;

    // A conta já foi criada: se o e-mail falhar, não derrubamos o cadastro
    // (a usuária ficaria sem conta utilizável e sem tokens) — ela pede o
    // reenvio por /auth/otp/resend.
    try {
      await this.otp.generateAndSend(user);
    } catch (error) {
      logger.error({ err: error, userId: user.id }, 'Falha ao enviar o código de verificação');
    }

    return {
      user: toPublicUser(user),
      ...(await this.sessions.start(user.id)),
      isVerified: false,
      hasStore: false,
      needsWhatsapp: false,
    };
  }

  async login(input: LoginInput) {
    const user = await this.users.findByEmail(input.email);
    // `passwordHash` nulo = conta criada via Google que nunca definiu senha própria. Mesma
    // mensagem do e-mail/senha errados — não revela pra quem tenta adivinhar que o e-mail existe.
    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('E-mail ou senha inválidos.');
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('E-mail ou senha inválidos.');
    }

    const store = await this.stores.findByUserId(user.id);

    // Sessão única: este login derruba a sessão que a usuária tinha em outro aparelho.
    return {
      user: toPublicUser(user),
      ...(await this.sessions.start(user.id)),
      isVerified: user.phoneVerifiedAt !== null,
      hasStore: store !== null,
      needsWhatsapp: user.whatsapp === null,
    };
  }

  // Login/cadastro via Google: o ID token já prova a posse do e-mail (verificado pelo próprio
  // Google), então a conta nasce sem senha e já verificada — só falta o WhatsApp, que o app pede
  // depois (ver `needsWhatsapp`).
  async loginWithGoogle(idToken: string) {
    const profile = await verifyGoogleIdToken(idToken);

    let user = await this.users.findByGoogleId(profile.googleId);

    if (!user) {
      const existing = await this.users.findByEmail(profile.email);

      if (existing) {
        // Conta antiga de e-mail/senha com o mesmo e-mail: vincula o Google a ela em vez de
        // criar uma conta duplicada.
        user = await this.users.linkGoogleId(existing.id, profile.googleId, existing.phoneVerifiedAt === null);
      } else {
        const result = await this.users.createFromGoogle({
          name: profile.name,
          email: profile.email,
          googleId: profile.googleId,
        });
        // Corrida: duas primeiras tentativas de login com o mesmo e-mail/Google ao mesmo tempo.
        if (result.kind === 'already_exists') {
          throw new ConflictError('Já existe uma conta com este e-mail.');
        }
        user = result.user;
      }
    }

    const store = await this.stores.findByUserId(user.id);

    return {
      user: toPublicUser(user),
      ...(await this.sessions.start(user.id)),
      isVerified: user.phoneVerifiedAt !== null,
      hasStore: store !== null,
      needsWhatsapp: user.whatsapp === null,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.end(sessionId);
  }

  refresh(refreshToken: string) {
    return this.sessions.refresh(refreshToken);
  }

  async getMe(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedError('Usuário não encontrado.');
    }

    const store = await this.stores.findByUserId(userId);

    return {
      user: toPublicUser(user),
      isVerified: user.phoneVerifiedAt !== null,
      store,
    };
  }

  // "Meus Dados": nome e/ou WhatsApp. Só grava o que veio, e o que já está igual não conta como
  // mudança (idempotente, mesmo padrão de StoreService#updateStore). O e-mail não é editado por
  // aqui — mudar de e-mail exigiria reverificar a conta.
  async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedError('Usuário não encontrado.');
    }

    const changes: { name?: string; whatsapp?: string } = {};
    if (input.name !== undefined && input.name !== user.name) {
      changes.name = input.name;
    }
    if (input.whatsapp !== undefined && input.whatsapp !== user.whatsapp) {
      changes.whatsapp = input.whatsapp;
    }

    if (Object.keys(changes).length === 0) {
      return toPublicUser(user);
    }

    const result = await this.users.updateProfile(userId, changes);
    if (result.kind === 'already_exists') {
      throw new ConflictError('Já existe uma conta com este WhatsApp.');
    }
    return toPublicUser(result.user);
  }
}

export const authService = new AuthService();
