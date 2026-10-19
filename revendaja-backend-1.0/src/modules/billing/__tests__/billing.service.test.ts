import type Stripe from 'stripe';
import { BillingService } from '../billing.service';
import type { BillingRepository } from '../billing.repository';
import type { BillingStore } from '../billing.types';
import { AppError, ConflictError } from '../../../shared/errors/AppError';

function createRepositoryMock(): jest.Mocked<BillingRepository> {
  return {
    findStoreByUserId: jest.fn(),
    findStoreById: jest.fn(),
    findStoreByCustomerId: jest.fn(),
    setCustomerId: jest.fn(),
    applySubscription: jest.fn(),
    isEventProcessed: jest.fn(),
    markEventProcessed: jest.fn(),
  };
}

function makeStore(overrides: Partial<BillingStore> = {}): BillingStore {
  return {
    id: 'store-1',
    userId: 'user-1',
    plan: 'free',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    user: { name: 'Ana', email: 'ana@example.com' },
    ...overrides,
  };
}

function makeSubscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: {},
    items: {
      data: [{ id: 'si_1', price: { id: 'price_premium' }, current_period_end: 1_800_000_000 }],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe('BillingService', () => {
  let repository: jest.Mocked<BillingRepository>;
  let stripe: {
    subscriptions: { retrieve: jest.Mock; update: jest.Mock };
    checkout: { sessions: { create: jest.Mock } };
    customers: { create: jest.Mock; retrieve: jest.Mock };
    invoices: { list: jest.Mock };
    subscriptionSchedules: {
      create: jest.Mock;
      update: jest.Mock;
      release: jest.Mock;
      retrieve: jest.Mock;
    };
    webhooks: { constructEvent: jest.Mock };
  };
  let notify: jest.Mock;
  let reconcile: jest.Mock;
  let service: BillingService;

  beforeEach(() => {
    repository = createRepositoryMock();
    stripe = {
      subscriptions: { retrieve: jest.fn(), update: jest.fn() },
      checkout: { sessions: { create: jest.fn() } },
      customers: { create: jest.fn(), retrieve: jest.fn() },
      invoices: { list: jest.fn() },
      subscriptionSchedules: {
        create: jest.fn(),
        update: jest.fn(),
        release: jest.fn(),
        retrieve: jest.fn(),
      },
      webhooks: { constructEvent: jest.fn() },
    };
    notify = jest.fn().mockResolvedValue(undefined);
    reconcile = jest.fn().mockResolvedValue(undefined);
    service = new BillingService(repository, () => stripe as unknown as Stripe, notify, reconcile);
  });

  describe('syncSubscription', () => {
    it('libera o plano do preço quando a assinatura está ativa', async () => {
      repository.findStoreByCustomerId.mockResolvedValue(makeStore());

      await service.syncSubscription(makeSubscription());

      expect(repository.applySubscription).toHaveBeenCalledWith('store-1', {
        plan: 'premium',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        subscriptionStatus: 'active',
        currentPeriodEnd: new Date(1_800_000_000 * 1000),
        cancelAtPeriodEnd: false,
      });
    });

    it('mantém o acesso em past_due (a Stripe ainda tenta cobrar)', async () => {
      repository.findStoreByCustomerId.mockResolvedValue(makeStore());

      await service.syncSubscription(makeSubscription({ status: 'past_due' }));

      expect(repository.applySubscription).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({ plan: 'premium', subscriptionStatus: 'past_due' }),
      );
    });

    it('marca cancelamento agendado e continua no plano até o fim do ciclo', async () => {
      repository.findStoreByCustomerId.mockResolvedValue(makeStore());

      await service.syncSubscription(makeSubscription({ cancel_at_period_end: true }));

      expect(repository.applySubscription).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({ plan: 'premium', cancelAtPeriodEnd: true }),
      );
    });

    it('volta para o plano Gratuito quando a assinatura é cancelada', async () => {
      repository.findStoreByCustomerId.mockResolvedValue(
        makeStore({ plan: 'premium', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' }),
      );

      await service.syncSubscription(makeSubscription({ status: 'canceled' }));

      expect(repository.applySubscription).toHaveBeenCalledWith('store-1', {
        plan: 'free',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: null,
        subscriptionStatus: 'canceled',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });
    });

    it('ignora o fim de uma assinatura antiga se a loja já assinou outra', async () => {
      repository.findStoreByCustomerId.mockResolvedValue(
        makeStore({
          plan: 'premium',
          stripeSubscriptionId: 'sub_new',
          subscriptionStatus: 'active',
        }),
      );

      await service.syncSubscription(makeSubscription({ id: 'sub_old', status: 'canceled' }));

      expect(repository.applySubscription).not.toHaveBeenCalled();
    });

    it('não altera a loja quando o preço é desconhecido', async () => {
      repository.findStoreByCustomerId.mockResolvedValue(makeStore());
      const subscription = makeSubscription({
        items: { data: [{ id: 'si_1', price: { id: 'price_outro' }, current_period_end: 1 }] },
      });

      await service.syncSubscription(subscription);

      expect(repository.applySubscription).not.toHaveBeenCalled();
    });

    it('acha a loja pelo metadata quando o cliente ainda não está salvo', async () => {
      repository.findStoreByCustomerId.mockResolvedValue(null);
      repository.findStoreById.mockResolvedValue(makeStore({ stripeCustomerId: null }));

      await service.syncSubscription(makeSubscription({ metadata: { storeId: 'store-1' } }));

      expect(repository.findStoreById).toHaveBeenCalledWith('store-1');
      expect(repository.applySubscription).toHaveBeenCalled();
    });
  });

  describe('startCheckout', () => {
    it('cria o cliente e devolve a URL do Checkout para quem nunca assinou', async () => {
      repository.findStoreByUserId.mockResolvedValue(makeStore({ stripeCustomerId: null }));
      stripe.customers.create.mockResolvedValue({ id: 'cus_new' });
      stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/x' });

      const result = await service.startCheckout('user-1', 'premium');

      expect(result).toEqual({ url: 'https://checkout.stripe.com/x', scheduledFor: null });
      expect(repository.setCustomerId).toHaveBeenCalledWith('store-1', 'cus_new');
      const params = stripe.checkout.sessions.create.mock.calls[0][0];
      expect(params).toMatchObject({
        mode: 'subscription',
        customer: 'cus_new',
        line_items: [{ price: 'price_premium', quantity: 1 }],
      });
      // Meios de pagamento dinâmicos: nunca fixar a lista.
      expect(params).not.toHaveProperty('payment_method_types');
    });

    it('troca o plano na hora quando já existe assinatura ativa', async () => {
      repository.findStoreByUserId.mockResolvedValue(
        makeStore({ plan: 'starter', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' }),
      );
      stripe.subscriptions.retrieve.mockResolvedValue(makeSubscription());
      stripe.subscriptions.update.mockResolvedValue(makeSubscription());
      repository.findStoreByCustomerId.mockResolvedValue(makeStore());

      const result = await service.startCheckout('user-1', 'premium');

      expect(result).toEqual({ url: null, scheduledFor: null });
      expect(stripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_1',
        expect.objectContaining({
          items: [{ id: 'si_1', price: 'price_premium' }],
          // Upgrade: cobra a diferença agora e não muda nada se o cartão recusar.
          proration_behavior: 'always_invoice',
          payment_behavior: 'error_if_incomplete',
        }),
      );
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('downgrade fica agendado para o fim do ciclo, sem mexer no plano agora', async () => {
      repository.findStoreByUserId.mockResolvedValue(
        makeStore({
          plan: 'business',
          stripeSubscriptionId: 'sub_1',
          subscriptionStatus: 'active',
        }),
      );
      stripe.subscriptions.retrieve.mockResolvedValue(
        makeSubscription({
          items: {
            data: [{ id: 'si_1', price: { id: 'price_business' }, current_period_end: 200 }],
          },
        }),
      );
      stripe.subscriptionSchedules.create.mockResolvedValue({
        id: 'sched_1',
        phases: [{ start_date: 100, end_date: 200 }],
      });
      stripe.subscriptionSchedules.update.mockResolvedValue({});

      const result = await service.startCheckout('user-1', 'starter');

      expect(result).toEqual({ url: null, scheduledFor: new Date(200 * 1000).toISOString() });
      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
      const params = stripe.subscriptionSchedules.update.mock.calls[0][1];
      expect(params.end_behavior).toBe('release');
      expect(params.phases[0]).toMatchObject({
        items: [{ price: 'price_business', quantity: 1 }],
        start_date: 100,
        end_date: 200,
      });
      expect(params.phases[1]).toMatchObject({
        items: [{ price: 'price_starter', quantity: 1 }],
        proration_behavior: 'none',
      });
    });

    it('upgrade com downgrade agendado primeiro desfaz o agendamento', async () => {
      repository.findStoreByUserId.mockResolvedValue(
        makeStore({ plan: 'starter', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' }),
      );
      stripe.subscriptions.retrieve.mockResolvedValue(makeSubscription({ schedule: 'sched_1' }));
      stripe.subscriptions.update.mockResolvedValue(makeSubscription());
      repository.findStoreByCustomerId.mockResolvedValue(makeStore());

      await service.startCheckout('user-1', 'premium');

      expect(stripe.subscriptionSchedules.release).toHaveBeenCalledWith('sched_1');
      expect(stripe.subscriptions.update).toHaveBeenCalled();
    });

    it('escolher o plano atual desfaz um downgrade agendado', async () => {
      repository.findStoreByUserId.mockResolvedValue(
        makeStore({ plan: 'premium', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' }),
      );
      stripe.subscriptions.retrieve.mockResolvedValue(makeSubscription({ schedule: 'sched_1' }));
      repository.findStoreByCustomerId.mockResolvedValue(makeStore());

      await expect(service.startCheckout('user-1', 'premium')).resolves.toEqual({
        url: null,
        scheduledFor: null,
      });
      expect(stripe.subscriptionSchedules.release).toHaveBeenCalledWith('sched_1');
      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    });

    it('devolve 402 se o cartão recusar a cobrança do upgrade', async () => {
      repository.findStoreByUserId.mockResolvedValue(
        makeStore({ plan: 'starter', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' }),
      );
      stripe.subscriptions.retrieve.mockResolvedValue(makeSubscription());
      stripe.subscriptions.update.mockRejectedValue(
        Object.assign(new Error('declined'), { type: 'StripeCardError' }),
      );

      await expect(service.startCheckout('user-1', 'premium')).rejects.toMatchObject({
        statusCode: 402,
        code: 'PAYMENT_FAILED',
      });
      expect(repository.applySubscription).not.toHaveBeenCalled();
    });

    it('reativa o plano atual quando o cancelamento estava agendado', async () => {
      repository.findStoreByUserId.mockResolvedValue(
        makeStore({
          plan: 'premium',
          stripeSubscriptionId: 'sub_1',
          subscriptionStatus: 'active',
          cancelAtPeriodEnd: true,
        }),
      );
      stripe.subscriptions.retrieve.mockResolvedValue(makeSubscription());
      stripe.subscriptions.update.mockResolvedValue(makeSubscription());
      repository.findStoreByCustomerId.mockResolvedValue(makeStore());

      await expect(service.startCheckout('user-1', 'premium')).resolves.toEqual({
        url: null,
        scheduledFor: null,
      });
      expect(stripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_1',
        expect.objectContaining({ cancel_at_period_end: false }),
      );
    });

    it('recusa assinar o plano em que a loja já está', async () => {
      repository.findStoreByUserId.mockResolvedValue(
        makeStore({ plan: 'premium', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' }),
      );
      stripe.subscriptions.retrieve.mockResolvedValue(makeSubscription());

      await expect(service.startCheckout('user-1', 'premium')).rejects.toBeInstanceOf(
        ConflictError,
      );
    });
  });

  describe('handleWebhook', () => {
    it('rejeita assinatura inválida com 400', async () => {
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('bad signature');
      });

      await expect(service.handleWebhook(Buffer.from('{}'), 't=1,v1=x')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_WEBHOOK_SIGNATURE',
      });
      expect(repository.markEventProcessed).not.toHaveBeenCalled();
    });

    it('rejeita requisição sem o cabeçalho de assinatura', async () => {
      await expect(service.handleWebhook(Buffer.from('{}'), undefined)).rejects.toBeInstanceOf(
        AppError,
      );
    });

    it('não reaplica um evento já processado', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_1',
        type: 'customer.subscription.updated',
      });
      repository.isEventProcessed.mockResolvedValue(true);

      await service.handleWebhook(Buffer.from('{}'), 't=1,v1=x');

      expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
      expect(repository.markEventProcessed).not.toHaveBeenCalled();
    });

    it('aplica a assinatura do evento e marca como processado', async () => {
      const subscription = makeSubscription();
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_2',
        type: 'customer.subscription.updated',
        data: { object: subscription },
      });
      repository.isEventProcessed.mockResolvedValue(false);
      stripe.subscriptions.retrieve.mockResolvedValue(subscription);
      repository.findStoreByCustomerId.mockResolvedValue(makeStore());

      await service.handleWebhook(Buffer.from('{}'), 't=1,v1=x');

      expect(repository.applySubscription).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({ plan: 'premium' }),
      );
      expect(repository.markEventProcessed).toHaveBeenCalledWith(
        'evt_2',
        'customer.subscription.updated',
      );
    });

    it('avisa a usuária quando o pagamento da assinatura falha', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_3',
        type: 'invoice.payment_failed',
        data: { object: { customer: 'cus_1' } },
      });
      repository.isEventProcessed.mockResolvedValue(false);
      repository.findStoreByCustomerId.mockResolvedValue(makeStore());

      await service.handleWebhook(Buffer.from('{}'), 't=1,v1=x');

      expect(notify).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          type: 'SYSTEM',
          title: 'Não conseguimos cobrar a sua assinatura',
        }),
      );
      expect(repository.markEventProcessed).toHaveBeenCalledWith('evt_3', 'invoice.payment_failed');
    });

    it('avisa quando a assinatura termina e a loja volta ao Gratuito', async () => {
      const canceled = makeSubscription({ status: 'canceled' });
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_4',
        type: 'customer.subscription.deleted',
        data: { object: canceled },
      });
      repository.isEventProcessed.mockResolvedValue(false);
      stripe.subscriptions.retrieve.mockResolvedValue(canceled);
      repository.findStoreByCustomerId.mockResolvedValue(
        makeStore({ plan: 'premium', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' }),
      );

      await service.handleWebhook(Buffer.from('{}'), 't=1,v1=x');

      expect(repository.applySubscription).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({ plan: 'free' }),
      );
      expect(notify).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ title: 'Assinatura encerrada' }),
      );
    });

    it('avisa que o plano foi ativado depois do Checkout', async () => {
      const subscription = makeSubscription();
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_5',
        type: 'checkout.session.completed',
        data: { object: { mode: 'subscription', subscription: 'sub_1' } },
      });
      repository.isEventProcessed.mockResolvedValue(false);
      stripe.subscriptions.retrieve.mockResolvedValue(subscription);
      repository.findStoreByCustomerId.mockResolvedValue(makeStore());

      await service.handleWebhook(Buffer.from('{}'), 't=1,v1=x');

      expect(notify).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ title: 'Plano Pro ativado' }),
      );
    });

    it('não deixa uma falha na notificação derrubar o webhook', async () => {
      notify.mockRejectedValue(new Error('redis fora'));
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_6',
        type: 'invoice.payment_failed',
        data: { object: { customer: 'cus_1' } },
      });
      repository.isEventProcessed.mockResolvedValue(false);
      repository.findStoreByCustomerId.mockResolvedValue(makeStore());

      await expect(service.handleWebhook(Buffer.from('{}'), 't=1,v1=x')).resolves.toBeUndefined();
      expect(repository.markEventProcessed).toHaveBeenCalled();
    });
  });

  describe('congelamento de produtos', () => {
    it('descongela tudo no upgrade para um plano sem limite', async () => {
      repository.findStoreByCustomerId.mockResolvedValue(makeStore());

      await service.syncSubscription(makeSubscription());

      expect(reconcile).toHaveBeenCalledWith('store-1', null);
    });

    it('aplica o limite do Gratuito quando a assinatura termina', async () => {
      repository.findStoreByCustomerId.mockResolvedValue(
        makeStore({ plan: 'premium', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' }),
      );

      await service.syncSubscription(makeSubscription({ status: 'canceled' }));

      expect(reconcile).toHaveBeenCalledWith('store-1', 30);
    });

    it('não mexe nos produtos quando a assinatura é ignorada', async () => {
      repository.findStoreByCustomerId.mockResolvedValue(
        makeStore({
          plan: 'premium',
          stripeSubscriptionId: 'sub_new',
          subscriptionStatus: 'active',
        }),
      );

      await service.syncSubscription(makeSubscription({ id: 'sub_old', status: 'canceled' }));

      expect(reconcile).not.toHaveBeenCalled();
    });
  });

  describe('getOverview', () => {
    it('mostra o downgrade agendado (plano e data)', async () => {
      repository.findStoreByUserId.mockResolvedValue(
        makeStore({
          plan: 'premium',
          stripeSubscriptionId: 'sub_1',
          subscriptionStatus: 'active',
          currentPeriodEnd: new Date(200 * 1000),
        }),
      );
      stripe.customers.retrieve.mockResolvedValue({ deleted: false, email: 'ana@example.com' });
      stripe.invoices.list.mockResolvedValue({ data: [] });
      stripe.subscriptions.retrieve.mockResolvedValue(makeSubscription({ schedule: 'sched_1' }));
      stripe.subscriptionSchedules.retrieve.mockResolvedValue({
        phases: [
          { start_date: 100, items: [{ price: 'price_premium' }] },
          { start_date: 200, items: [{ price: 'price_starter' }] },
        ],
      });

      const overview = await service.getOverview('user-1');

      expect(overview.scheduledChange).toEqual({
        plan: 'starter',
        effectiveAt: new Date(200 * 1000).toISOString(),
      });
    });
  });
});
