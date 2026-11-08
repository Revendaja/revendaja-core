import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test/utils';
import type { AdminOverview } from '@/lib/api/admin';
import AdminCostsPage from './page';

const mocks = vi.hoisted(() => ({ overview: vi.fn(), ai: vi.fn(), plans: vi.fn() }));

vi.mock('@/lib/api/admin', () => ({
  getAdminOverview: () => mocks.overview(),
  getAdminAi: () => mocks.ai(),
  getAdminPlans: () => mocks.plans(),
}));

function overview(): AdminOverview {
  const empty = { messages: 0, transcriptions: 0, inputTokens: 0, outputTokens: 0, storesUsing: 0 };
  return {
    generatedAt: new Date().toISOString(),
    users: { total: 10, verified: 10, new7d: 0, new30d: 0 },
    stores: {
      total: 10,
      online: 10,
      new7d: 0,
      new30d: 0,
      active30d: 0,
      paying: 4,
      byPlan: { free: 6, starter: 3, premium: 1 },
    },
    subscriptions: { byStatus: {}, cancelAtPeriodEnd: 0, renewingIn7d: 0 },
    gmv: {
      last30d: { gross: 0, paidSales: 0, onlineSales: 0, activeStores: 0 },
      previous30d: { gross: 0, paidSales: 0, onlineSales: 0, activeStores: 0 },
    },
    weekly: [],
    devices: { ios: 0, android: 0, unknown: 0 },
    catalog: { products: 0, brands: 0 },
    ai: { period: '2026-11', previousPeriod: '2026-10', current: empty, previous: empty },
  };
}

const EDITABLE_FIELDS = [
  'Inicial',
  'Pro',
  'Servidor (Fly.io)',
  'Banco de dados (Neon)',
  'Fila (Redis)',
  'Stripe (cartão, no site)',
  'Apple (App Store)',
  'Google Play',
];

beforeEach(() => {
  window.localStorage.clear();
  mocks.overview.mockReset().mockResolvedValue(overview());
  mocks.ai.mockReset().mockResolvedValue({
    period: '2026-11',
    totals: { messages: 10, transcriptions: 2, inputTokens: 100_000, outputTokens: 2_000, storesUsing: 2 },
    history: [],
    byPlan: [{ plan: 'starter', stores: 2, messages: 10, transcriptions: 2, inputTokens: 100_000, outputTokens: 2_000 }],
    byStore: [],
    model: { name: 'gpt-6-luna', reasoningEffort: 'none' },
  });
  mocks.plans.mockReset().mockResolvedValue({ plans: [] });
});

async function renderPage() {
  const view = renderWithQuery(<AdminCostsPage />);
  await screen.findByText('Quanto cada cliente rende');
  return view;
}

describe('Custos e planos', () => {
  it('só os preços dos planos e o que se paga pelos serviços são editáveis', async () => {
    await renderPage();

    expect(screen.getAllByRole('textbox')).toHaveLength(EDITABLE_FIELDS.length);
    for (const label of EDITABLE_FIELDS) expect(screen.getByLabelText(label)).toBeInTheDocument();

    // O que o sistema calcula ou já é fixo não tem campo.
    for (const label of ['Cotação do dólar', 'Lojas', 'Cota de IA', 'Taxa do cartão', 'Imposto', 'Uso da cota', 'Visitas/mês', 'Entrada']) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
  });

  it('usa as lojas de cada plano que o sistema mede (sem campo para digitar)', async () => {
    await renderPage();

    // 3 lojas no Inicial + 1 no Pro = 3 x 29,99 + 49,99.
    expect(screen.getAllByText(/139,96/).length).toBeGreaterThan(0);
    expect(screen.getByText(/4 loja\(s\) pagante\(s\) · 6 gratuita\(s\)/)).toBeInTheDocument();
    expect(screen.getByText('lojas por plano: medido')).toBeInTheDocument();
    expect(screen.getByText(/uso de IA: medido neste mês/)).toBeInTheDocument();
  });

  it('mostra os gráficos do financeiro', async () => {
    await renderPage();

    expect(screen.getByRole('img', { name: 'Barra de composição' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Paga e Custa por grupo' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Gráfico de linha do resultado' })).toBeInTheDocument();
  });

  it('mostra a comissão de cada canal e o imposto do MEI', async () => {
    await renderPage();

    expect(screen.getByText(/Comissão da Stripe \(3,99% \+ R\$\s0,39\)/)).toBeInTheDocument();
    expect(screen.getByText(/Comissão da Apple \(15%\)/)).toBeInTheDocument();
    expect(screen.getByText(/Comissão do Google Play \(15%\)/)).toBeInTheDocument();
    expect(screen.getByText('Quanto sobra por canal de venda')).toBeInTheDocument();
    expect(screen.getByText('Limite do MEI')).toBeInTheDocument();
    // O DAS aparece nos custos fixos, não como percentual da receita.
    expect(screen.getByText(/imposto MEI R\$\s86,05/)).toBeInTheDocument();
  });

  it('mudar a divisão entre os canais muda a comissão', async () => {
    const user = userEvent.setup();
    await renderPage();

    const stripe = screen.getByLabelText('Stripe (cartão, no site)');
    const apple = screen.getByLabelText('Apple (App Store)');
    const google = screen.getByLabelText('Google Play');
    await user.clear(stripe);
    await user.type(stripe, '100');
    await user.clear(apple);
    await user.type(apple, '0');
    await user.clear(google);
    await user.type(google, '0');

    // Tudo pela Stripe: sem comissão da Apple nem do Google no gráfico.
    await waitFor(() => expect(screen.queryByText(/Comissão da Apple \(15%\)/)).not.toBeInTheDocument());
    expect(screen.queryByText(/Comissão do Google Play \(15%\)/)).not.toBeInTheDocument();
    expect(screen.getByText(/Comissão da Stripe \(3,99%/)).toBeInTheDocument();
  });

  it('avisa quando a divisão entre os canais não fecha 100%', async () => {
    const user = userEvent.setup();
    await renderPage();

    const stripe = screen.getByLabelText('Stripe (cartão, no site)');
    await user.clear(stripe);
    await user.type(stripe, '90');

    expect(await screen.findByText(/Não fecha 100%/)).toBeInTheDocument();
  });

  it('mudar o preço do Neon muda o custo fixo na hora', async () => {
    const user = userEvent.setup();
    await renderPage();

    expect(screen.getByText(/R\$\s172 fixos/)).toBeInTheDocument();

    const neon = screen.getByLabelText('Banco de dados (Neon)');
    await user.clear(neon);
    await user.type(neon, '19');

    // US$ 19 x R$ 5,40 = R$ 102,60 a mais: 85,73 + 86,05 (MEI) + 102,60 = 274,38.
    await waitFor(() => expect(screen.getByText(/R\$\s274 fixos/)).toBeInTheDocument());
  });

  it('mudar a mensalidade de um plano muda o que entra por mês', async () => {
    const user = userEvent.setup();
    await renderPage();

    const starter = screen.getByLabelText('Inicial');
    await user.clear(starter);
    await user.type(starter, '39,90');

    // 3 lojas no Inicial a R$ 39,90 + 1 no Pro a R$ 49,99.
    await waitFor(() => expect(screen.getAllByText(/169,69/).length).toBeGreaterThan(0));
  });

  it('o que foi editado fica salvo no navegador', async () => {
    const user = userEvent.setup();
    const first = await renderPage();

    const neon = screen.getByLabelText('Banco de dados (Neon)');
    await user.clear(neon);
    await user.type(neon, '19');
    await waitFor(() => expect(window.localStorage.getItem('revendaja:admin:costs:v2')).toContain('"database":19'));
    first.unmount();

    await renderPage();
    await waitFor(() => expect(screen.getByText(/R\$\s274 fixos/)).toBeInTheDocument());
  });

  it('"Restaurar" volta aos valores padrão', async () => {
    const user = userEvent.setup();
    await renderPage();

    const neon = screen.getByLabelText('Banco de dados (Neon)');
    await user.clear(neon);
    await user.type(neon, '19');
    await waitFor(() => expect(screen.getByText(/R\$\s274 fixos/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Restaurar' }));
    await waitFor(() => expect(screen.getByText(/R\$\s172 fixos/)).toBeInTheDocument());
  });

  it('sem nenhuma mensagem de IA no mês, avisa que o uso é estimado', async () => {
    mocks.ai.mockResolvedValue({
      period: '2026-11',
      totals: { messages: 0, transcriptions: 0, inputTokens: 0, outputTokens: 0, storesUsing: 0 },
      history: [],
      byPlan: [],
      byStore: [],
      model: { name: 'gpt-6-luna', reasoningEffort: 'none' },
    });
    await renderPage();

    expect(screen.getByText(/uso de IA: estimado/)).toBeInTheDocument();
  });
});
