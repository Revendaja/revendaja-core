import { isUniqueViolation } from '../../database/errors';
import { prisma } from '../../database/prisma';
import type { User } from './users.types';

interface CreateUserData {
  name: string;
  email: string;
  whatsapp: string;
  passwordHash: string;
}

export type CreateUserResult = { kind: 'created'; user: User } | { kind: 'already_exists' };

interface CreateUserFromGoogleData {
  name: string;
  email: string;
  googleId: string;
}

interface UpdateProfileData {
  name?: string;
  whatsapp?: string;
}

export type UpdateProfileResult = { kind: 'updated'; user: User } | { kind: 'already_exists' };

// Este módulo não expõe rotas públicas (o cadastro/login vivem em "auth",
// que é quem orquestra o fluxo de negócio). Ele só é dono do acesso à
// tabela de usuários — outros módulos (auth, otp, store) importam este
// repositório quando precisam ler ou atualizar um usuário.
export const usersRepository = {
  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  findByWhatsapp(whatsapp: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { whatsapp } });
  },

  findByGoogleId(googleId: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { googleId } });
  },

  // `email`/`whatsapp` já são checados antes (ver AuthService#register), mas isso é
  // check-then-insert: duas requisições concorrentes passam a checagem e só uma delas grava —
  // a outra estoura o índice único aqui. Devolve `already_exists` em vez de deixar o P2002 subir
  // como 500, mesmo padrão de `storeRepository.updateStore`/`createCategory`.
  async create(data: CreateUserData): Promise<CreateUserResult> {
    try {
      const user = await prisma.user.create({ data });
      return { kind: 'created', user };
    } catch (error) {
      if (isUniqueViolation(error)) return { kind: 'already_exists' };
      throw error;
    }
  },

  markPhoneVerified(id: string): Promise<User> {
    return prisma.user.update({ where: { id }, data: { phoneVerifiedAt: new Date() } });
  },

  // Conta que nasce pelo Google: sem senha e sem WhatsApp (pedido depois, numa tela de completar
  // cadastro). O e-mail já chega verificado pelo Google, então a conta já nasce com
  // `phoneVerifiedAt` preenchido — pula o código de verificação por e-mail do cadastro comum.
  // Mesma proteção contra corrida de `create`: duas primeiras tentativas de login simultâneas
  // podem colidir no e-mail (índice único) — devolve `already_exists` em vez de 500.
  async createFromGoogle(data: CreateUserFromGoogleData): Promise<CreateUserResult> {
    try {
      const user = await prisma.user.create({
        data: { ...data, phoneVerifiedAt: new Date() },
      });
      return { kind: 'created', user };
    } catch (error) {
      if (isUniqueViolation(error)) return { kind: 'already_exists' };
      throw error;
    }
  },

  // Vincula o Google a uma conta que já existia por e-mail/senha (login por Google com o mesmo
  // e-mail de uma conta antiga). O Google já confirma a posse do e-mail, então aproveita para
  // marcar a verificação caso a conta antiga ainda não tivesse concluído o código por e-mail.
  linkGoogleId(id: string, googleId: string, markVerified: boolean): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { googleId, ...(markVerified ? { phoneVerifiedAt: new Date() } : {}) },
    });
  },

  // "Meus Dados": nome e/ou WhatsApp (o e-mail não é editado por aqui — mudar de e-mail exigiria
  // reverificar a conta, o que essa tela não faz). Mesma proteção contra corrida de `create`: outra
  // conta pode ter pego o mesmo WhatsApp entre a checagem em AuthService#updateProfile e este
  // UPDATE — devolve `already_exists` em vez de deixar o P2002 subir como 500.
  async updateProfile(id: string, data: UpdateProfileData): Promise<UpdateProfileResult> {
    try {
      const user = await prisma.user.update({ where: { id }, data });
      return { kind: 'updated', user };
    } catch (error) {
      if (isUniqueViolation(error)) return { kind: 'already_exists' };
      throw error;
    }
  },

  updatePassword(id: string, passwordHash: string): Promise<User> {
    return prisma.user.update({ where: { id }, data: { passwordHash } });
  },
};

export type UsersRepository = typeof usersRepository;
