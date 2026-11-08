import bcrypt from 'bcryptjs';
import { AccountService } from '../account.service';
import type { AccountRepository } from '../account.repository';
import { AppError, NotFoundError, UnauthorizedError } from '../../../shared/errors/AppError';
import type { UsersRepository } from '../../users/users.repository';
import type { User } from '../../users/users.types';
import { verifyGoogleIdToken } from '../../auth/google';
import { getStripe, isBillingConfigured } from '../../billing/billing.stripe';
import { deleteUploadedImages } from '../../../shared/s3';

jest.mock('../../auth/google');
jest.mock('../../billing/billing.stripe');
jest.mock('../../../shared/s3', () => ({ deleteUploadedImages: jest.fn() }));

const mockedGoogle = verifyGoogleIdToken as jest.MockedFunction<typeof verifyGoogleIdToken>;
const mockedIsBillingConfigured = isBillingConfigured as jest.MockedFunction<
  typeof isBillingConfigured
>;
const mockedGetStripe = getStripe as jest.MockedFunction<typeof getStripe>;
const mockedDeleteImages = deleteUploadedImages as jest.MockedFunction<typeof deleteUploadedImages>;

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

async function buildUser(overrides: Partial<User> = {}): Promise<User> {
  return {
    id: USER_ID,
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

function build() {
  const users = { findById: jest.fn() } as unknown as jest.Mocked<UsersRepository>;
  const account: jest.Mocked<AccountRepository> = {
    getBillingInfo: jest.fn().mockResolvedValue({ stripeSubscriptionId: null }),
    collectImageUrls: jest.fn().mockResolvedValue([]),
    deleteUser: jest.fn().mockResolvedValue(undefined),
  };
  const stripe = {
    subscriptions: { retrieve: jest.fn(), cancel: jest.fn().mockResolvedValue({}) },
  };
  mockedIsBillingConfigured.mockReturnValue(true);
  mockedGetStripe.mockReturnValue(stripe as never);
  mockedDeleteImages.mockResolvedValue(0);
  return { users, account, stripe, service: new AccountService(users, account) };
}

describe('AccountService#deleteAccount', () => {
  beforeEach(() => jest.clearAllMocks());

  it('apaga a conta quando a senha está certa e não há assinatura', async () => {
    const { users, account, service } = build();
    users.findById.mockResolvedValue(await buildUser());

    await service.deleteAccount(USER_ID, { password: 'senha-correta' });

    expect(account.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(mockedGetStripe).not.toHaveBeenCalled();
  });

  it('recusa senha incorreta e não apaga nada', async () => {
    const { users, account, service } = build();
    users.findById.mockResolvedValue(await buildUser());

    await expect(service.deleteAccount(USER_ID, { password: 'errada' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(service.deleteAccount(USER_ID, { googleIdToken: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(account.deleteUser).not.toHaveBeenCalled();
  });

  it('404 quando a conta não existe', async () => {
    const { users, service } = build();
    users.findById.mockResolvedValue(null);

    await expect(service.deleteAccount(USER_ID, { password: 'x' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('conta só do Google: aceita o ID token da mesma conta Google', async () => {
    const { users, account, service } = build();
    users.findById.mockResolvedValue(await buildUser({ passwordHash: null, googleId: 'g-1' }));
    mockedGoogle.mockResolvedValue({ googleId: 'g-1', email: 'ana@email.com', name: 'Ana' });

    await service.deleteAccount(USER_ID, { googleIdToken: 'token' });

    expect(account.deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it('conta só do Google: recusa token de outra conta Google ou ausência de token', async () => {
    const { users, account, service } = build();
    users.findById.mockResolvedValue(await buildUser({ passwordHash: null, googleId: 'g-1' }));
    mockedGoogle.mockResolvedValue({ googleId: 'g-OUTRA', email: 'x@email.com', name: 'X' });

    await expect(service.deleteAccount(USER_ID, { googleIdToken: 'token' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(service.deleteAccount(USER_ID, { password: 'qualquer' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(account.deleteUser).not.toHaveBeenCalled();
  });

  it('cancela a assinatura na Stripe antes de apagar a conta', async () => {
    const { users, account, stripe, service } = build();
    users.findById.mockResolvedValue(await buildUser());
    account.getBillingInfo.mockResolvedValue({ stripeSubscriptionId: 'sub_1' });
    stripe.subscriptions.retrieve.mockResolvedValue({ status: 'active' });

    await service.deleteAccount(USER_ID, { password: 'senha-correta' });

    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_1');
    const cancelOrder = stripe.subscriptions.cancel.mock.invocationCallOrder[0];
    const deleteOrder = account.deleteUser.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(deleteOrder);
  });

  it('não tenta cancelar uma assinatura que já foi cancelada', async () => {
    const { users, account, stripe, service } = build();
    users.findById.mockResolvedValue(await buildUser());
    account.getBillingInfo.mockResolvedValue({ stripeSubscriptionId: 'sub_1' });
    stripe.subscriptions.retrieve.mockResolvedValue({ status: 'canceled' });

    await service.deleteAccount(USER_ID, { password: 'senha-correta' });

    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(account.deleteUser).toHaveBeenCalled();
  });

  it('assinatura que não existe mais na Stripe não impede a exclusão', async () => {
    const { users, account, stripe, service } = build();
    users.findById.mockResolvedValue(await buildUser());
    account.getBillingInfo.mockResolvedValue({ stripeSubscriptionId: 'sub_1' });
    stripe.subscriptions.retrieve.mockRejectedValue(
      Object.assign(new Error('No such subscription'), { code: 'resource_missing' }),
    );

    await service.deleteAccount(USER_ID, { password: 'senha-correta' });

    expect(account.deleteUser).toHaveBeenCalled();
  });

  it('se a Stripe falhar, aborta e NÃO apaga a conta (evita seguir cobrando sem conta)', async () => {
    const { users, account, stripe, service } = build();
    users.findById.mockResolvedValue(await buildUser());
    account.getBillingInfo.mockResolvedValue({ stripeSubscriptionId: 'sub_1' });
    stripe.subscriptions.retrieve.mockResolvedValue({ status: 'active' });
    stripe.subscriptions.cancel.mockRejectedValue(new Error('stripe fora do ar'));

    await expect(
      service.deleteAccount(USER_ID, { password: 'senha-correta' }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'SUBSCRIPTION_CANCEL_FAILED' });
    expect(account.deleteUser).not.toHaveBeenCalled();
  });

  it('com assinatura e cobrança não configurada, aborta sem apagar', async () => {
    const { users, account, service } = build();
    users.findById.mockResolvedValue(await buildUser());
    account.getBillingInfo.mockResolvedValue({ stripeSubscriptionId: 'sub_1' });
    mockedIsBillingConfigured.mockReturnValue(false);

    await expect(
      service.deleteAccount(USER_ID, { password: 'senha-correta' }),
    ).rejects.toBeInstanceOf(AppError);
    expect(account.deleteUser).not.toHaveBeenCalled();
  });

  it('apaga as imagens do bucket depois da conta e ignora falha nessa limpeza', async () => {
    const { users, account, service } = build();
    users.findById.mockResolvedValue(await buildUser());
    account.collectImageUrls.mockResolvedValue(['https://cdn.exemplo.com/logos/a.jpg']);
    mockedDeleteImages.mockRejectedValue(new Error('s3 fora do ar'));

    await expect(
      service.deleteAccount(USER_ID, { password: 'senha-correta' }),
    ).resolves.toBeUndefined();

    expect(mockedDeleteImages).toHaveBeenCalledWith(['https://cdn.exemplo.com/logos/a.jpg']);
    const deleteOrder = account.deleteUser.mock.invocationCallOrder[0];
    expect(mockedDeleteImages.mock.invocationCallOrder[0]).toBeGreaterThan(deleteOrder);
  });
});
