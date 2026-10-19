import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test/utils';
import { billingOverview, planUsage } from '@/test/billingFixtures';
import { ApiError } from '@/lib/api/errors';
import SubscriptionPage from './page';

const mocks = vi.hoisted(() => ({
  getBilling: vi.fn(),
  startCheckout: vi.fn(),
  createPortalSession: vi.fn(),
  getStorePlan: vi.fn(),
  redirectTo: vi.fn(),
  search: { current: '' },
}));

vi.mock('@/lib/api/billing', () => ({
  getBilling: () => mocks.getBilling(),
  startCheckout: (plan: string) => mocks.startCheckout(plan),
  createPortalSession: () => mocks.createPortalSession(),
}));
vi.mock('@/lib/api/stores', () => ({ getStorePlan: () => mocks.getStorePlan() }));
vi.mock('@/lib/utils/navigation', () => ({ redirectTo: (url: string) => mocks.redirectTo(url) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.search.current) }));
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Ana Souza', email: 'ana@exemplo.com', whatsapp: '5511982214432' },
    store: { id: 's1', storeName: 'Ana Beauty' },
  }),
}));

async function renderLoaded(planName = 'Pro') {
  renderWithQuery(<SubscriptionPage />);
  await screen.findByText(planName, { selector: 'p' });
}

describe('Assinatura', () => {
  beforeEach(() => {
    mocks.search.current = '';
    mocks.getStorePlan.mockResolvedValue(planUsage(10, 'premium'));
  });

  describe('plano pago', () => {
    beforeEach(() => {
      mocks.getBilling.mockResolvedValue(
        billingOverview({
          invoices: [
            { id: 'in_1', number: 'ABC-0002', date: '2026-10-12T12:00:00.000Z', amount: 49.99, currency: 'brl', status: 'paid', pdfUrl: 'https://stripe.test/in_1.pdf', hostedUrl: 'https://stripe.test/in_1' },
            { id: 'in_2', number: 'ABC-0001', date: '2026-09-12T12:00:00.000Z', amount: 49.99, currency: 'brl', status: 'open', pdfUrl: null, hostedUrl: 'https://stripe.test/in_2' },
          ],
        }),
      );
    });

    it('mostra plano, status, preço e a data da próxima renovação', async () => {
      await renderLoaded();

      expect(screen.getByText('Ativo')).toBeInTheDocument();
      expect(screen.getByText('R$ 49,99 por mês · cobrado mensalmente')).toBeInTheDocument();
      expect(screen.getByText(/Renova em/)).toHaveTextContent('12 de novembro de 2026');
    });

    it('mostra o cartão (final e validade) e os dados de cobrança', async () => {
      await renderLoaded();

      expect(await screen.findByText(/•••• 4242/)).toBeInTheDocument();
      expect(screen.getByText(/Visa · Vence em 03\/2030/)).toBeInTheDocument();
      expect(screen.getByText('Ana Souza')).toBeInTheDocument();
      expect(screen.getByText('Ana Beauty')).toBeInTheDocument();
      expect(screen.getByText('ana@exemplo.com')).toBeInTheDocument();
    });

    it('lista as faturas com status e link (PDF quando existe, senão "Ver")', async () => {
      await renderLoaded();

      const rows = await screen.findAllByRole('row');
      // 1 linha de cabeçalho + 2 faturas.
      expect(rows).toHaveLength(3);
      expect(within(rows[1]).getByText('ABC-0002')).toBeInTheDocument();
      expect(within(rows[1]).getByText('Pago')).toBeInTheDocument();
      expect(within(rows[1]).getByRole('link', { name: 'PDF' })).toHaveAttribute('href', 'https://stripe.test/in_1.pdf');
      expect(within(rows[2]).getByText('Em aberto')).toBeInTheDocument();
      expect(within(rows[2]).getByRole('link', { name: 'Ver' })).toHaveAttribute('href', 'https://stripe.test/in_2');
    });

    it('os botões de troca levam para a página de planos', async () => {
      await renderLoaded();

      expect(screen.getByRole('link', { name: 'Trocar plano' })).toHaveAttribute('href', '/planos');
      expect(screen.getByRole('link', { name: 'Fazer upgrade' })).toHaveAttribute('href', '/planos');
    });
  });

  describe('cancelar plano', () => {
    beforeEach(() => {
      mocks.getBilling.mockResolvedValue(billingOverview());
    });

    it('avisa que o acesso continua até o fim do ciclo e abre o portal da Stripe', async () => {
      mocks.createPortalSession.mockResolvedValue({ url: 'https://billing.stripe.com/session/x' });
      await renderLoaded();

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar plano' }));

      const dialog = screen.getByRole('dialog', { name: 'Cancelar a assinatura?' });
      expect(dialog).toHaveTextContent('Você mantém o plano Pro até o fim do ciclo já pago (12 de novembro de 2026)');
      expect(mocks.createPortalSession).not.toHaveBeenCalled();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Continuar para o cancelamento' }));

      await vi.waitFor(() => expect(mocks.redirectTo).toHaveBeenCalledWith('https://billing.stripe.com/session/x'));
    });

    it('avisa do congelamento quando a loja tem mais produtos que o limite do Gratuito (45 → 30)', async () => {
      mocks.getStorePlan.mockResolvedValue(planUsage(45, 'premium'));
      await renderLoaded();
      await vi.waitFor(() => expect(mocks.getStorePlan).toHaveBeenCalled());

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar plano' }));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('O plano Gratuito permite 30 produtos e você tem 45');
      expect(dialog).toHaveTextContent('Os 15 mais recentes ficam congelados');
    });

    it('sem produtos acima do limite, não mostra o aviso de congelamento', async () => {
      await renderLoaded();
      await vi.waitFor(() => expect(mocks.getStorePlan).toHaveBeenCalled());

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar plano' }));

      expect(screen.getByRole('dialog')).not.toHaveTextContent('congelados');
    });

    it('voltar na janela não abre o portal', async () => {
      await renderLoaded();

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar plano' }));
      await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mocks.createPortalSession).not.toHaveBeenCalled();
    });

    it('mostra o erro se o portal não abrir', async () => {
      mocks.createPortalSession.mockRejectedValue(new ApiError(409, 'CONFLICT', 'Você ainda não tem uma assinatura para gerenciar.'));
      await renderLoaded();

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar plano' }));
      await userEvent.click(screen.getByRole('button', { name: 'Continuar para o cancelamento' }));

      expect(await screen.findByText('Você ainda não tem uma assinatura para gerenciar.')).toBeInTheDocument();
      expect(mocks.redirectTo).not.toHaveBeenCalled();
    });
  });

  describe('cancelamento agendado', () => {
    it('mostra até quando o plano vale e reativa sem pedir confirmação', async () => {
      mocks.getBilling.mockResolvedValue(
        billingOverview({
          subscription: { status: 'active', currentPeriodEnd: '2026-11-12T12:00:00.000Z', cancelAtPeriodEnd: true },
        }),
      );
      mocks.startCheckout.mockResolvedValue({ url: null, scheduledFor: null });
      await renderLoaded();

      expect(screen.getByText(/Cancelamento agendado: você mantém o plano até/)).toHaveTextContent('12 de novembro de 2026');
      expect(screen.getByText('Cancela no fim do ciclo')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Reativar plano' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mocks.startCheckout).toHaveBeenCalledWith('premium');
    });
  });

  describe('troca agendada', () => {
    it('mostra a data e o plano de destino, e "Desfazer" mantém o plano atual', async () => {
      mocks.getBilling.mockResolvedValue(
        billingOverview({ scheduledChange: { plan: 'starter', effectiveAt: '2026-11-12T12:00:00.000Z' } }),
      );
      mocks.startCheckout.mockResolvedValue({ url: null, scheduledFor: null });
      await renderLoaded();

      expect(screen.getByText(/Troca agendada: em/)).toHaveTextContent('12 de novembro de 2026');
      expect(screen.getByText(/plano passa para o Inicial/)).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));

      expect(mocks.startCheckout).toHaveBeenCalledWith('premium');
    });
  });

  describe('pagamento pendente', () => {
    it('mostra o selo de pagamento pendente (a loja mantém o plano enquanto a Stripe tenta de novo)', async () => {
      mocks.getBilling.mockResolvedValue(
        billingOverview({
          subscription: { status: 'past_due', currentPeriodEnd: '2026-11-12T12:00:00.000Z', cancelAtPeriodEnd: false },
        }),
      );

      await renderLoaded();

      expect(screen.getByText('Pagamento pendente')).toBeInTheDocument();
      expect(screen.queryByText('Ativo')).not.toBeInTheDocument();
    });
  });

  describe('plano gratuito', () => {
    beforeEach(() => {
      mocks.getBilling.mockResolvedValue(billingOverview({ planId: 'free' }));
      mocks.getStorePlan.mockResolvedValue(planUsage(10, 'free'));
    });

    it('mostra "sem cobrança" e esconde cartão, renovação e cancelamento', async () => {
      await renderLoaded('Gratuito');

      expect(screen.getByText('Plano gratuito · sem cobrança')).toBeInTheDocument();
      expect(screen.getByText(/Assine um plano pago/)).toBeInTheDocument();
      expect(screen.queryByText('Forma de pagamento')).not.toBeInTheDocument();
      expect(screen.queryByText(/Renova em/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancelar plano' })).not.toBeInTheDocument();
      expect(screen.queryByText('Faturas')).not.toBeInTheDocument();
    });

    it('mostra faturas antigas de quem já assinou e cancelou', async () => {
      mocks.getBilling.mockResolvedValue(
        billingOverview({
          planId: 'free',
          invoices: [
            { id: 'in_1', number: 'ABC-0001', date: '2026-09-12T12:00:00.000Z', amount: 49.99, currency: 'brl', status: 'paid', pdfUrl: null, hostedUrl: null },
          ],
        }),
      );

      await renderLoaded('Gratuito');

      expect(await screen.findByText('ABC-0001')).toBeInTheDocument();
    });
  });

  describe('volta do Checkout', () => {
    it('confirma o plano quando o pagamento já refletiu', async () => {
      mocks.search.current = 'checkout=success';
      mocks.getBilling.mockResolvedValue(billingOverview());

      await renderLoaded();

      expect(screen.getByText('Pagamento confirmado! Seu plano Pro já está ativo.')).toBeInTheDocument();
    });

    it('mostra "confirmando" enquanto o webhook ainda não chegou (plano ainda Gratuito)', async () => {
      mocks.search.current = 'checkout=success';
      mocks.getBilling.mockResolvedValue(billingOverview({ planId: 'free' }));
      mocks.getStorePlan.mockResolvedValue(planUsage(10, 'free'));

      await renderLoaded('Gratuito');

      expect(screen.getByText(/Estamos confirmando o seu plano/)).toBeInTheDocument();
    });
  });

  describe('estados de erro e ambiente', () => {
    it('mostra o erro ao carregar e deixa tentar de novo', async () => {
      mocks.getBilling.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'Erro no servidor. Tente novamente em instantes.'));
      mocks.getBilling.mockResolvedValue(billingOverview());
      renderWithQuery(<SubscriptionPage />);

      expect(await screen.findByText('Erro no servidor. Tente novamente em instantes.')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

      expect(await screen.findByText('Pro', { selector: 'p' })).toBeInTheDocument();
    });

    it('avisa quando a cobrança não está configurada no servidor', async () => {
      mocks.getBilling.mockResolvedValue(billingOverview({ planId: 'free', configured: false }));
      mocks.getStorePlan.mockResolvedValue(planUsage(10, 'free'));

      await renderLoaded('Gratuito');

      expect(screen.getByText('A cobrança ainda não está disponível neste ambiente.')).toBeInTheDocument();
    });
  });
});
