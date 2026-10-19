import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test/utils';
import { billingOverview, planUsage } from '@/test/billingFixtures';
import { ApiError } from '@/lib/api/errors';
import PlansPage from './page';

const mocks = vi.hoisted(() => ({
  getBilling: vi.fn(),
  startCheckout: vi.fn(),
  getStorePlan: vi.fn(),
  redirectTo: vi.fn(),
  search: { current: '' },
}));

vi.mock('@/lib/api/billing', () => ({
  getBilling: () => mocks.getBilling(),
  startCheckout: (plan: string) => mocks.startCheckout(plan),
}));
vi.mock('@/lib/api/stores', () => ({ getStorePlan: () => mocks.getStorePlan() }));
vi.mock('@/lib/utils/navigation', () => ({ redirectTo: (url: string) => mocks.redirectTo(url) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.search.current) }));

// O cartão de um plano, achado pelo título.
function card(name: string) {
  return screen.getByRole('heading', { name }).closest('section') as HTMLElement;
}

async function renderLoaded() {
  renderWithQuery(<PlansPage />);
  await screen.findByRole('heading', { name: 'Pro' });
  // Espera o estado de carregamento acabar (os botões ficam desabilitados enquanto carrega).
  await vi.waitFor(() => expect(mocks.getBilling).toHaveBeenCalled());
  await screen.findAllByRole('button', { name: /Plano atual|Assinar este plano|Trocar para este plano/ });
}

describe('Planos', () => {
  beforeEach(() => {
    mocks.search.current = '';
    mocks.getStorePlan.mockResolvedValue(planUsage(10, 'free'));
  });

  describe('primeira assinatura', () => {
    beforeEach(() => {
      mocks.getBilling.mockResolvedValue(billingOverview({ planId: 'free' }));
    });

    it('lista os 4 planos com os preços e marca o atual', async () => {
      await renderLoaded();

      for (const name of ['Gratuito', 'Inicial', 'Pro', 'Empresarial']) {
        expect(screen.getByRole('heading', { name })).toBeInTheDocument();
      }
      expect(within(card('Inicial')).getByText('R$ 29,99')).toBeInTheDocument();
      expect(within(card('Pro')).getByText('R$ 49,99')).toBeInTheDocument();
      expect(within(card('Empresarial')).getByText('R$ 129,99')).toBeInTheDocument();
      // Selo no topo e botão desabilitado no rodapé.
      expect(within(card('Gratuito')).getAllByText('Plano atual')).toHaveLength(2);
      expect(within(card('Pro')).queryByText('Plano atual')).not.toBeInTheDocument();
    });

    it('vai direto para o Checkout da Stripe, sem janela de confirmação', async () => {
      mocks.startCheckout.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/x', scheduledFor: null });
      await renderLoaded();

      await userEvent.click(within(card('Pro')).getByRole('button', { name: 'Assinar este plano' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mocks.startCheckout).toHaveBeenCalledWith('premium');
      await vi.waitFor(() => expect(mocks.redirectTo).toHaveBeenCalledWith('https://checkout.stripe.com/pay/x'));
    });

    it('mostra o erro da API quando não consegue abrir o pagamento', async () => {
      mocks.startCheckout.mockRejectedValue(new ApiError(503, 'BILLING_NOT_CONFIGURED', 'Este plano ainda não está disponível para assinatura.'));
      await renderLoaded();

      await userEvent.click(within(card('Inicial')).getByRole('button', { name: 'Assinar este plano' }));

      expect(await screen.findByText('Este plano ainda não está disponível para assinatura.')).toBeInTheDocument();
      expect(mocks.redirectTo).not.toHaveBeenCalled();
    });

    it('avisa que o pagamento foi cancelado quando volta do Checkout', async () => {
      mocks.search.current = 'checkout=cancelled';

      await renderLoaded();

      expect(screen.getByText(/Pagamento cancelado. Nada foi cobrado/)).toBeInTheDocument();
    });
  });

  describe('cobrança não configurada no servidor', () => {
    it('avisa e desabilita as assinaturas', async () => {
      mocks.getBilling.mockResolvedValue(billingOverview({ planId: 'free', configured: false }));

      await renderLoaded();

      expect(screen.getByText(/ainda não está disponível. Fale com o suporte/)).toBeInTheDocument();
      expect(within(card('Pro')).getByRole('button', { name: 'Assinar este plano' })).toBeDisabled();
    });
  });

  describe('quem já assina (Pro)', () => {
    beforeEach(() => {
      mocks.getBilling.mockResolvedValue(billingOverview({ planId: 'premium' }));
    });

    it('o plano atual fica desabilitado e o Gratuito leva para cancelar na assinatura', async () => {
      await renderLoaded();

      expect(within(card('Pro')).getByRole('button', { name: 'Plano atual' })).toBeDisabled();
      expect(within(card('Gratuito')).getByRole('link', { name: 'Cancelar na assinatura' })).toHaveAttribute(
        'href',
        '/assinatura',
      );
    });

    it('upgrade pede confirmação, avisa da cobrança proporcional e troca na hora', async () => {
      mocks.getBilling.mockResolvedValue(billingOverview({ planId: 'starter' }));
      mocks.startCheckout.mockResolvedValue({ url: null, scheduledFor: null });
      await renderLoaded();

      await userEvent.click(within(card('Pro')).getByRole('button', { name: 'Trocar para este plano' }));

      const dialog = screen.getByRole('dialog', { name: 'Fazer upgrade para o Pro?' });
      expect(dialog).toHaveTextContent('diferença proporcional');
      expect(dialog).not.toHaveTextContent('congelados');

      await userEvent.click(within(dialog).getByRole('button', { name: /Fazer upgrade/ }));

      expect(mocks.startCheckout).toHaveBeenCalledWith('premium');
      expect(await screen.findByText(/Plano alterado para Pro/)).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mocks.redirectTo).not.toHaveBeenCalled();
    });

    it('mostra o erro de cartão recusado no upgrade', async () => {
      mocks.getBilling.mockResolvedValue(billingOverview({ planId: 'starter' }));
      mocks.startCheckout.mockRejectedValue(
        new ApiError(402, 'PAYMENT_FAILED', 'Não conseguimos cobrar o seu cartão. Atualize a forma de pagamento.'),
      );
      await renderLoaded();

      await userEvent.click(within(card('Pro')).getByRole('button', { name: 'Trocar para este plano' }));
      await userEvent.click(screen.getByRole('button', { name: /Fazer upgrade/ }));

      expect(await screen.findByText(/Não conseguimos cobrar o seu cartão/)).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('downgrade avisa que só vale no fim do ciclo e agenda a troca', async () => {
      mocks.startCheckout.mockResolvedValue({ url: null, scheduledFor: '2026-11-12T12:00:00.000Z' });
      await renderLoaded();

      await userEvent.click(within(card('Inicial')).getByRole('button', { name: 'Trocar para este plano' }));

      const dialog = screen.getByRole('dialog', { name: 'Mudar para o plano Inicial?' });
      expect(dialog).toHaveTextContent('12 de novembro de 2026');
      expect(dialog).toHaveTextContent('Nada é cobrado ou estornado agora');

      await userEvent.click(within(dialog).getByRole('button', { name: 'Agendar mudança' }));

      expect(mocks.startCheckout).toHaveBeenCalledWith('starter');
      expect(await screen.findByText(/Troca agendada: você continua no plano atual até 12 de novembro de 2026/)).toBeInTheDocument();
    });

    it('downgrade com produtos acima do limite avisa do congelamento (320 → limite 200)', async () => {
      mocks.getStorePlan.mockResolvedValue(planUsage(320, 'premium'));
      await renderLoaded();
      await vi.waitFor(() => expect(mocks.getStorePlan).toHaveBeenCalled());

      await userEvent.click(within(card('Inicial')).getByRole('button', { name: 'Trocar para este plano' }));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('O plano Inicial permite 200 produtos e você tem 320');
      expect(dialog).toHaveTextContent('Os 120 mais recentes ficam congelados');
    });

    it('downgrade dentro do limite não mostra aviso de congelamento', async () => {
      mocks.getStorePlan.mockResolvedValue(planUsage(50, 'premium'));
      await renderLoaded();
      await vi.waitFor(() => expect(mocks.getStorePlan).toHaveBeenCalled());

      await userEvent.click(within(card('Inicial')).getByRole('button', { name: 'Trocar para este plano' }));

      expect(screen.getByRole('dialog')).not.toHaveTextContent('congelados');
    });

    it('voltar na janela não chama a API', async () => {
      await renderLoaded();

      await userEvent.click(within(card('Inicial')).getByRole('button', { name: 'Trocar para este plano' }));
      await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mocks.startCheckout).not.toHaveBeenCalled();
    });
  });

  describe('com troca agendada (Pro → Inicial)', () => {
    beforeEach(() => {
      mocks.getBilling.mockResolvedValue(
        billingOverview({
          planId: 'premium',
          scheduledChange: { plan: 'starter', effectiveAt: '2026-11-12T12:00:00.000Z' },
        }),
      );
    });

    it('mostra o aviso, marca o plano de destino e libera "Manter este plano"', async () => {
      await renderLoaded();

      expect(screen.getByText(/Troca agendada: no dia 12 de novembro de 2026 seu plano passa para o Inicial/)).toBeInTheDocument();
      expect(within(card('Inicial')).getByText('Agendado')).toBeInTheDocument();
      expect(within(card('Inicial')).getByRole('button', { name: 'Troca agendada' })).toBeDisabled();
      expect(within(card('Pro')).getByRole('button', { name: 'Manter este plano' })).toBeEnabled();
    });

    it('"Manter este plano" desfaz o agendamento sem pedir confirmação', async () => {
      mocks.startCheckout.mockResolvedValue({ url: null, scheduledFor: null });
      await renderLoaded();

      await userEvent.click(within(card('Pro')).getByRole('button', { name: 'Manter este plano' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mocks.startCheckout).toHaveBeenCalledWith('premium');
      expect(await screen.findByText('Tudo certo: você continua no plano Pro.')).toBeInTheDocument();
    });
  });

  describe('faixa de acima do limite', () => {
    it('aparece em Planos quando a loja passou do limite (sem repetir o botão)', async () => {
      mocks.getBilling.mockResolvedValue(billingOverview({ planId: 'starter' }));
      mocks.getStorePlan.mockResolvedValue(planUsage(320, 'starter', 120));

      await renderLoaded();

      expect(await screen.findByText(/acima do limite do plano Inicial: 320 de 200 produtos/)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Ver planos' })).not.toBeInTheDocument();
    });
  });
});
