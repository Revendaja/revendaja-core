import type Stripe from 'stripe';
import { env } from '../../config/env';
import { AppError, ConflictError, NotFoundError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger';
import { STORE_PLAN_LIMITS, STORE_PLAN_NAMES } from '../store/store.plans';
import { storeRepository } from '../store/store.repository';
import { billingRepository, type BillingRepository } from './billing.repository';
import {
  hasPlanAccess,
  isUpgrade,
  planForPriceId,
  priceIdForPlan,
  type PaidPlan,
} from './billing.plans';
import { notificationsService } from '../notifications/notifications.service';
import { getStripe, isBillingConfigured } from './billing.stripe';
import type {
  BillingInvoice,
  BillingOverview,
  BillingStore,
  SubscriptionSnapshot,
} from './billing.types';

const INVOICES_LIMIT = 12;

// `url`: levar ao Checkout. `url` null + `scheduledFor`: downgrade agendado para essa data (fim do
// ciclo). Os dois null: o plano mudou na hora (upgrade) ou um agendamento foi desfeito.
export interface CheckoutResult {
  url: string | null;
  scheduledFor: string | null;
}

// Avisa a usuária dentro do app (e por push). Injetável para testar sem fila/Redis.
export type BillingNotifier = (
  userId: string,
  input: { type: 'SYSTEM'; title: string; message: string; data?: Record<string, unknown> },
) => Promise<unknown>;

export class BillingService {
  constructor(
    private readonly repository: BillingRepository = billingRepository,
    private readonly stripeClient: () => Stripe = getStripe,
    private readonly notify: BillingNotifier = (userId, input) =>
      notificationsService.notifyUser(userId, input),
    private readonly reconcileFrozen: (
      storeId: string,
      maxProducts: number | null,
    ) => Promise<void> = (storeId, maxProducts) =>
      storeRepository.reconcileFrozenProducts(storeId, maxProducts),
  ) {}

  // Resumo da cobrança da loja. O plano e o status vêm do banco (mantido pelos webhooks); cartão e
  // faturas são lidos da Stripe na hora. Se a Stripe falhar, devolve o que tem em vez de errar a tela.
  async getOverview(userId: string): Promise<BillingOverview> {
    const store = await this.requireStore(userId);

    const overview: BillingOverview = {
      configured: isBillingConfigured(),
      plan: { id: store.plan, name: STORE_PLAN_NAMES[store.plan] },
      subscription: store.subscriptionStatus
        ? {
            status: store.subscriptionStatus,
            currentPeriodEnd: store.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: store.cancelAtPeriodEnd,
          }
        : null,
      scheduledChange: null,
      paymentMethod: null,
      billingEmail: null,
      invoices: [],
    };

    if (!overview.configured || !store.stripeCustomerId) return overview;

    try {
      const stripe = this.stripeClient();
      const [customer, invoices, subscription] = await Promise.all([
        stripe.customers.retrieve(store.stripeCustomerId, {
          expand: ['invoice_settings.default_payment_method'],
        }),
        stripe.invoices.list({ customer: store.stripeCustomerId, limit: INVOICES_LIMIT }),
        store.stripeSubscriptionId
          ? stripe.subscriptions.retrieve(store.stripeSubscriptionId, {
              expand: ['default_payment_method'],
            })
          : Promise.resolve(null),
      ]);

      overview.invoices = invoices.data
        .map(mapInvoice)
        .filter((invoice): invoice is BillingInvoice => invoice !== null);

      if (!customer.deleted) {
        overview.billingEmail = customer.email;
        // A assinatura criada pelo Checkout guarda o cartão nela; o do cliente é só o reserva.
        overview.paymentMethod =
          pickCard(subscription?.default_payment_method) ??
          pickCard(customer.invoice_settings?.default_payment_method);
      }

      // Downgrade agendado: a 2ª fase do agendamento é o plano que entra no fim do ciclo.
      const scheduleId = scheduleIdOf(subscription?.schedule);
      if (scheduleId) {
        const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
        const next = schedule.phases[1];
        const nextPlan = next ? planForPriceId(priceIdOf(next.items[0]?.price) ?? '') : undefined;
        if (next && nextPlan && typeof next.start_date === 'number') {
          overview.scheduledChange = {
            plan: nextPlan,
            effectiveAt: new Date(next.start_date * 1000).toISOString(),
          };
        }
      }
    } catch (error) {
      logger.warn({ err: error, storeId: store.id }, 'Falha ao ler cobrança na Stripe.');
    }

    return overview;
  }

  // Começa a assinatura de um plano pago (devolve a URL do Checkout). Se a loja já tem uma
  // assinatura ativa: upgrade vale na hora (cobra a diferença), downgrade fica agendado para o fim
  // do ciclo já pago, e escolher o plano atual desfaz um cancelamento/downgrade agendado.
  async startCheckout(userId: string, plan: PaidPlan): Promise<CheckoutResult> {
    const priceId = priceIdForPlan(plan);
    if (!priceId) {
      throw new AppError(
        'Este plano ainda não está disponível para assinatura.',
        503,
        'BILLING_NOT_CONFIGURED',
      );
    }

    const store = await this.requireStore(userId);
    const stripe = this.stripeClient();

    if (store.stripeSubscriptionId && hasPlanAccess(store.subscriptionStatus)) {
      return this.changeExistingSubscription(
        stripe,
        store,
        store.stripeSubscriptionId,
        plan,
        priceId,
      );
    }

    const customerId = await this.ensureCustomer(stripe, store);
    const webUrl = env.WEB_APP_URL.replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: store.id,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { storeId: store.id } },
      allow_promotion_codes: true,
      locale: 'pt-BR',
      success_url: `${webUrl}/assinatura?checkout=success`,
      cancel_url: `${webUrl}/planos?checkout=cancelled`,
    });
    if (!session.url) {
      throw new AppError('Não foi possível abrir o pagamento.', 502, 'BILLING_CHECKOUT_FAILED');
    }
    return { url: session.url, scheduledFor: null };
  }

  private async changeExistingSubscription(
    stripe: Stripe,
    store: BillingStore,
    subscriptionId: string,
    plan: PaidPlan,
    priceId: string,
  ): Promise<CheckoutResult> {
    const current = await stripe.subscriptions.retrieve(subscriptionId);
    const item = current.items.data[0];
    if (!item) throw new AppError('Assinatura sem itens.', 409, 'BILLING_SUBSCRIPTION_INVALID');
    const scheduleId = scheduleIdOf(current.schedule);

    // Mesmo plano: só faz sentido para desfazer um cancelamento ou um downgrade agendados.
    if (plan === store.plan) {
      if (!store.cancelAtPeriodEnd && !scheduleId)
        throw new ConflictError('Você já está neste plano.');
      if (scheduleId) await stripe.subscriptionSchedules.release(scheduleId);
      const resumed = store.cancelAtPeriodEnd
        ? await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false })
        : await stripe.subscriptions.retrieve(subscriptionId);
      await this.syncSubscription(resumed);
      return { url: null, scheduledFor: null };
    }

    // Um agendamento pendente "trava" a assinatura: sai dele antes de mudar de plano.
    if (scheduleId) await stripe.subscriptionSchedules.release(scheduleId);

    if (!isUpgrade(store.plan, plan)) {
      // Downgrade: a loja já pagou o ciclo atual, então mantém o plano até o fim dele. Escolher um
      // plano é decidir continuar, então um cancelamento agendado também é desfeito.
      if (store.cancelAtPeriodEnd) {
        await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
      }
      const effectiveAt = await this.scheduleDowngrade(
        stripe,
        subscriptionId,
        item.price.id,
        priceId,
      );
      return { url: null, scheduledFor: effectiveAt.toISOString() };
    }

    let updated: Stripe.Subscription;
    try {
      updated = await stripe.subscriptions.update(subscriptionId, {
        items: [{ id: item.id, price: priceId }],
        // Cobra a diferença agora (senão o plano melhor sairia de graça até a próxima fatura) e,
        // se o cartão recusar, NADA muda.
        proration_behavior: 'always_invoice',
        payment_behavior: 'error_if_incomplete',
        cancel_at_period_end: false,
        metadata: { storeId: store.id },
      });
    } catch (error) {
      if ((error as { type?: string } | null)?.type === 'StripeCardError') {
        throw new AppError(
          'Não conseguimos cobrar o seu cartão. Atualize a forma de pagamento em Assinatura e tente de novo.',
          402,
          'PAYMENT_FAILED',
        );
      }
      throw error;
    }
    // Reflete já na tela; o webhook confirma depois (o resultado é o mesmo).
    await this.syncSubscription(updated);
    return { url: null, scheduledFor: null };
  }

  // Agenda a troca para o preço novo quando o ciclo atual terminar (sem cobrança nem crédito).
  // Depois do novo ciclo a assinatura sai do agendamento e segue normalmente no plano novo.
  private async scheduleDowngrade(
    stripe: Stripe,
    subscriptionId: string,
    currentPriceId: string,
    newPriceId: string,
  ): Promise<Date> {
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscriptionId,
    });
    const phase = schedule.phases[0];
    if (!phase || typeof phase.end_date !== 'number') {
      throw new AppError(
        'Não foi possível agendar a troca de plano.',
        502,
        'BILLING_SCHEDULE_FAILED',
      );
    }
    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: 'release',
      phases: [
        {
          items: [{ price: currentPriceId, quantity: 1 }],
          start_date: phase.start_date,
          end_date: phase.end_date,
        },
        {
          items: [{ price: newPriceId, quantity: 1 }],
          duration: { interval: 'month', interval_count: 1 },
          proration_behavior: 'none',
        },
      ],
    });
    return new Date(phase.end_date * 1000);
  }

  // Portal da Stripe: trocar cartão, ver/baixar faturas e cancelar a assinatura.
  async createPortalSession(userId: string): Promise<{ url: string }> {
    const store = await this.requireStore(userId);
    if (!store.stripeCustomerId) {
      throw new ConflictError('Você ainda não tem uma assinatura para gerenciar.');
    }
    const stripe = this.stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: store.stripeCustomerId,
      return_url: `${env.WEB_APP_URL.replace(/\/$/, '')}/assinatura`,
    });
    return { url: session.url };
  }

  // Recebe o corpo CRU do webhook (a assinatura é calculada sobre os bytes originais) e aplica o
  // evento. Lança 400 se a assinatura não bate; qualquer outro erro vira 500 para a Stripe reenviar.
  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<void> {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new AppError('Webhook da Stripe não configurado.', 503, 'BILLING_NOT_CONFIGURED');
    }
    if (!signature) {
      throw new AppError('Assinatura do webhook ausente.', 400, 'INVALID_WEBHOOK_SIGNATURE');
    }

    const stripe = this.stripeClient();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new AppError('Assinatura do webhook inválida.', 400, 'INVALID_WEBHOOK_SIGNATURE');
    }

    if (await this.repository.isEventProcessed(event.id)) return;

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          const id =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;
          const subscription = await stripe.subscriptions.retrieve(id);
          await this.syncSubscription(subscription);
          if (hasPlanAccess(subscription.status)) {
            const item = subscription.items.data[0];
            const plan = item ? planForPriceId(item.price.id) : undefined;
            if (plan) {
              await this.notifyCustomer(customerIdOf(subscription.customer), {
                title: `Plano ${STORE_PLAN_NAMES[plan]} ativado`,
                message: 'Pagamento confirmado! Os recursos do seu plano já estão liberados.',
                data: { action: 'OPEN_SUBSCRIPTION' },
              });
            }
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        // A Stripe tenta cobrar de novo sozinha; enquanto isso a loja mantém o plano (past_due).
        // Avisar a tempo de trocar o cartão é o que evita perder a assinatura.
        const customerId = customerIdOf(event.data.object.customer);
        await this.notifyCustomer(customerId, {
          title: 'Não conseguimos cobrar a sua assinatura',
          message:
            'O pagamento do seu plano falhou. Atualize a forma de pagamento em Assinatura para não perder o acesso.',
          data: { action: 'OPEN_SUBSCRIPTION' },
        });
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        // Eventos podem chegar fora de ordem: relê a assinatura para aplicar o estado mais atual.
        const fromEvent = event.data.object;
        let current: Stripe.Subscription = fromEvent;
        try {
          current = await stripe.subscriptions.retrieve(fromEvent.id);
        } catch (error) {
          logger.warn(
            { err: error, subscriptionId: fromEvent.id },
            'Releitura da assinatura falhou.',
          );
        }
        await this.syncSubscription(current);
        if (event.type === 'customer.subscription.deleted') {
          await this.notifyCustomer(customerIdOf(current.customer), {
            title: 'Assinatura encerrada',
            message:
              'Sua loja voltou para o plano Gratuito. Você pode assinar de novo quando quiser.',
            data: { action: 'OPEN_SUBSCRIPTION' },
          });
        }
        break;
      }
      default:
        break;
    }

    await this.repository.markEventProcessed(event.id, event.type);
  }

  // Traduz a assinatura da Stripe no que a loja pode usar e grava. É a única porta que muda
  // `Store.plan` por cobrança.
  async syncSubscription(subscription: Stripe.Subscription): Promise<void> {
    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

    let store = await this.repository.findStoreByCustomerId(customerId);
    const metadataStoreId = subscription.metadata?.storeId;
    if (!store && metadataStoreId) store = await this.repository.findStoreById(metadataStoreId);
    if (!store) {
      logger.warn(
        { customerId, subscriptionId: subscription.id },
        'Assinatura sem loja correspondente.',
      );
      return;
    }

    const live = hasPlanAccess(subscription.status);
    // Uma assinatura antiga que acabou não pode derrubar a loja se ela já assinou outra depois.
    if (!live && store.stripeSubscriptionId && store.stripeSubscriptionId !== subscription.id)
      return;

    const item = subscription.items.data[0];
    const paidPlan = item ? planForPriceId(item.price.id) : undefined;
    if (live && !paidPlan) {
      logger.error(
        { subscriptionId: subscription.id, priceId: item?.price.id },
        'Assinatura com preço desconhecido: confira STRIPE_PRICE_* no ambiente.',
      );
      return;
    }

    const snapshot: SubscriptionSnapshot = {
      plan: live && paidPlan ? paidPlan : 'free',
      stripeCustomerId: customerId,
      stripeSubscriptionId: live ? subscription.id : null,
      subscriptionStatus: subscription.status,
      currentPeriodEnd: live && item ? new Date(item.current_period_end * 1000) : null,
      cancelAtPeriodEnd:
        live && (subscription.cancel_at_period_end || subscription.cancel_at !== null),
    };
    await this.repository.applySubscription(store.id, snapshot);
    // O plano pode ter mudado: congela o que passa do limite novo (ou descongela, num upgrade).
    await this.reconcileFrozen(store.id, STORE_PLAN_LIMITS[snapshot.plan].maxProducts);
  }

  // Best-effort: o aviso é um extra sobre algo que já foi aplicado. Se falhar, só loga — deixar o
  // erro subir faria a Stripe reenviar o evento por causa de uma notificação.
  private async notifyCustomer(
    customerId: string | null,
    input: { title: string; message: string; data?: Record<string, unknown> },
  ): Promise<void> {
    if (!customerId) return;
    try {
      const store = await this.repository.findStoreByCustomerId(customerId);
      if (!store) return;
      await this.notify(store.userId, { type: 'SYSTEM', ...input });
    } catch (error) {
      logger.error({ err: error, customerId }, 'Falha ao notificar a usuária sobre a cobrança.');
    }
  }

  private async requireStore(userId: string): Promise<BillingStore> {
    const store = await this.repository.findStoreByUserId(userId);
    if (!store) throw new NotFoundError('Loja não encontrada.');
    return store;
  }

  // Um cliente Stripe por loja. A chave de idempotência evita dois clientes se a usuária clicar
  // duas vezes antes de o primeiro terminar.
  private async ensureCustomer(stripe: Stripe, store: BillingStore): Promise<string> {
    if (store.stripeCustomerId) return store.stripeCustomerId;
    const customer = await stripe.customers.create(
      {
        email: store.user.email,
        name: store.user.name,
        metadata: { storeId: store.id, userId: store.userId },
      },
      { idempotencyKey: `revendaja-customer-${store.id}` },
    );
    await this.repository.setCustomerId(store.id, customer.id);
    return customer.id;
  }
}

function scheduleIdOf(
  schedule: string | Stripe.SubscriptionSchedule | null | undefined,
): string | null {
  if (!schedule) return null;
  return typeof schedule === 'string' ? schedule : schedule.id;
}

function priceIdOf(
  price: string | Stripe.Price | Stripe.DeletedPrice | null | undefined,
): string | null {
  if (!price) return null;
  return typeof price === 'string' ? price : price.id;
}

function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id;
}

function pickCard(
  method: string | Stripe.PaymentMethod | null | undefined,
): BillingOverview['paymentMethod'] {
  if (!method || typeof method === 'string' || !method.card) return null;
  return {
    brand: method.card.brand,
    last4: method.card.last4,
    expMonth: method.card.exp_month,
    expYear: method.card.exp_year,
  };
}

const INVOICE_STATUSES: readonly BillingInvoice['status'][] = [
  'paid',
  'open',
  'void',
  'uncollectible',
];

function mapInvoice(invoice: Stripe.Invoice): BillingInvoice | null {
  // Rascunho ainda não é uma fatura para a cliente (e qualquer status novo da Stripe é ignorado).
  const status = INVOICE_STATUSES.find((known) => known === invoice.status);
  if (!invoice.id || !status) return null;
  return {
    id: invoice.id,
    number: invoice.number,
    date: new Date(invoice.created * 1000).toISOString(),
    amount: invoice.total / 100,
    currency: invoice.currency,
    status,
    pdfUrl: invoice.invoice_pdf ?? null,
    hostedUrl: invoice.hosted_invoice_url ?? null,
  };
}

export const billingService = new BillingService();
