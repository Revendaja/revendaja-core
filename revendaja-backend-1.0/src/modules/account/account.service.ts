import bcrypt from 'bcryptjs';
import type Stripe from 'stripe';
import { AppError, NotFoundError, UnauthorizedError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger';
import { deleteUploadedImages } from '../../shared/s3';
import { verifyGoogleIdToken } from '../auth/google';
import { getStripe, isBillingConfigured } from '../billing/billing.stripe';
import { usersRepository, type UsersRepository } from '../users/users.repository';
import type { User } from '../users/users.types';
import { accountRepository, type AccountRepository } from './account.repository';
import type { DeleteAccountInput } from './account.schema';

const CANCEL_FAILED_MESSAGE =
  'Não conseguimos cancelar sua assinatura agora. Tente novamente em instantes.';

export class AccountService {
  constructor(
    private readonly users: UsersRepository = usersRepository,
    private readonly account: AccountRepository = accountRepository,
  ) {}

  // Exclusão definitiva da conta e de tudo que é dela (LGPD / exigência da Google Play).
  // Ordem pensada para nunca deixar a usuária sem conta e ainda cobrada:
  //   1. confirma a identidade; 2. cancela a assinatura na Stripe (se falhar, aborta e nada é
  //   apagado); 3. apaga a conta (cascata no banco); 4. limpa as imagens do bucket (melhor esforço:
  //   a conta já foi, então uma falha aqui só vai para o log).
  async deleteAccount(userId: string, input: DeleteAccountInput): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('Conta não encontrada.');

    await this.confirmIdentity(user, input);

    const [billing, imageUrls] = await Promise.all([
      this.account.getBillingInfo(userId),
      this.account.collectImageUrls(userId),
    ]);

    if (billing?.stripeSubscriptionId) {
      await this.cancelSubscription(billing.stripeSubscriptionId);
    }

    await this.account.deleteUser(userId);
    logger.info({ userId }, 'Conta excluída a pedido da usuária.');

    try {
      const removed = await deleteUploadedImages(imageUrls);
      logger.info({ userId, removed }, 'Imagens da conta excluída removidas do bucket.');
    } catch (error) {
      logger.error(
        { err: error, userId, count: imageUrls.length },
        'Falha ao apagar imagens do bucket.',
      );
    }
  }

  private async confirmIdentity(user: User, input: DeleteAccountInput): Promise<void> {
    if (user.passwordHash) {
      if (!input.password || !(await bcrypt.compare(input.password, user.passwordHash))) {
        throw new UnauthorizedError('Senha incorreta.');
      }
      return;
    }
    // Conta só do Google: o ID token novo prova que quem pede ainda controla a conta Google.
    if (!user.googleId || !input.googleIdToken) {
      throw new UnauthorizedError('Confirme com o login do Google.');
    }
    const profile = await verifyGoogleIdToken(input.googleIdToken);
    if (profile.googleId !== user.googleId) {
      throw new UnauthorizedError('A conta Google não corresponde a esta conta.');
    }
  }

  private async cancelSubscription(subscriptionId: string): Promise<void> {
    if (!isBillingConfigured()) {
      throw new AppError(CANCEL_FAILED_MESSAGE, 503, 'BILLING_NOT_CONFIGURED');
    }
    const stripe = getStripe();
    try {
      const current = await stripe.subscriptions.retrieve(subscriptionId);
      if (current.status === 'canceled' || current.status === 'incomplete_expired') return;
      await stripe.subscriptions.cancel(subscriptionId);
    } catch (error) {
      if ((error as Stripe.errors.StripeError | undefined)?.code === 'resource_missing') return;
      logger.error({ err: error, subscriptionId }, 'Falha ao cancelar a assinatura na exclusão.');
      throw new AppError(CANCEL_FAILED_MESSAGE, 502, 'SUBSCRIPTION_CANCEL_FAILED');
    }
  }
}

export const accountService = new AccountService();
