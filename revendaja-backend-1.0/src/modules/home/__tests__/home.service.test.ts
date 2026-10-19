import { HomeService, LOW_STOCK_PREVIEW_LIMIT, LOW_STOCK_THRESHOLD } from '../home.service';
import type { HomeQuery } from '../home.schema';
import type { Store } from '../../store/store.types';
import type { PeriodTotals } from '../../sales/sales.types';
import { NotFoundError } from '../../../shared/errors/AppError';

const FROM = new Date('2026-09-01T03:00:00.000Z');
const TO = new Date('2026-10-01T03:00:00.000Z');
const PREVIOUS_FROM = new Date('2026-08-01T03:00:00.000Z');
const QUERY: HomeQuery = { from: FROM, to: TO, previousFrom: PREVIOUS_FROM };

function buildStore(): Store {
  return {
    id: 'store-1',
    userId: 'user-1',
    storeName: 'Leal Perfumaria',
    handle: 'lealperfumaria',
    catalogLink: 'https://lealperfumaria.revendaja.com',
    isOnline: true,
    bio: null,
    plan: 'free',
    defaultMinStock: 0,
    createdAt: new Date(),
  };
}

function build() {
  const stores = {
    findByUserId: jest.fn().mockResolvedValue(buildStore()),
    getSettings: jest.fn().mockResolvedValue({ monthlyGoal: null, plan: 'free' }),
    findLowStock: jest.fn().mockResolvedValue({ count: 0, products: [] }),
  };

  // `periodTotals` responde pelo início do período: o mês atual (from) ou o anterior (previousFrom).
  let current: PeriodTotals = { paidCents: 0, pendingCents: 0 };
  let previous: PeriodTotals = { paidCents: 0, pendingCents: 0 };
  const sales = {
    periodTotals: jest
      .fn()
      .mockImplementation((_storeId: string, from: Date) =>
        Promise.resolve(from.getTime() === FROM.getTime() ? current : previous),
      ),
    countPending: jest.fn().mockResolvedValue(0),
  };
  const service = new HomeService(stores, sales);

  return {
    stores,
    sales,
    service,
    arrangeCurrent: (data: Partial<PeriodTotals>) => {
      current = { paidCents: 0, pendingCents: 0, ...data };
    },
    arrangePrevious: (data: Partial<PeriodTotals>) => {
      previous = { paidCents: 0, pendingCents: 0, ...data };
    },
  };
}

describe('HomeService', () => {
  it('lança NotFoundError quando a usuária não tem loja (e não consulta mais nada)', async () => {
    const { stores, sales, service } = build();
    stores.findByUserId.mockResolvedValue(null);

    await expect(service.get('user-1', QUERY)).rejects.toBeInstanceOf(NotFoundError);
    expect(sales.periodTotals).not.toHaveBeenCalled();
    expect(stores.findLowStock).not.toHaveBeenCalled();
  });

  it('consulta a loja da usuária: período atual, período anterior colado no atual e alertas', async () => {
    const { stores, sales, service } = build();

    await service.get('user-1', QUERY);

    expect(stores.findByUserId).toHaveBeenCalledWith('user-1');
    expect(sales.periodTotals).toHaveBeenCalledWith('store-1', FROM, TO);
    // O período anterior é [previousFrom, from): termina onde o atual começa.
    expect(sales.periodTotals).toHaveBeenCalledWith('store-1', PREVIOUS_FROM, FROM);
    expect(stores.getSettings).toHaveBeenCalledWith('store-1');
    expect(stores.findLowStock).toHaveBeenCalledWith(
      'store-1',
      LOW_STOCK_THRESHOLD,
      LOW_STOCK_PREVIEW_LIMIT,
    );
    expect(sales.countPending).toHaveBeenCalledWith('store-1');
  });

  describe('faturamento (só vendas pagas)', () => {
    it('total conta SÓ as vendas pagas: o que está pendente fica de fora até ser recebido', async () => {
      const { arrangeCurrent, service } = build();
      arrangeCurrent({ paidCents: 300_00, pendingCents: 125_50 });

      const { revenue } = await service.get('user-1', QUERY);

      expect(revenue.total).toBe(300);
    });

    it('só vendas pendentes no período: faturamento 0', async () => {
      const { arrangeCurrent, service } = build();
      arrangeCurrent({ pendingCents: 500_00 });

      const { revenue } = await service.get('user-1', QUERY);

      expect(revenue.total).toBe(0);
    });

    it('sem vendas: faturamento zerado e sem crescimento', async () => {
      const { service } = build();

      const { revenue } = await service.get('user-1', QUERY);

      expect(revenue).toEqual({ total: 0, growthPercent: null });
    });

    it('não traz lucro, margem nem custo (a tela não mostra)', async () => {
      const { arrangeCurrent, service } = build();
      arrangeCurrent({ paidCents: 100_00 });

      const home = await service.get('user-1', QUERY);

      expect(JSON.stringify(home)).not.toMatch(/profit|margin|cost/i);
    });
  });

  describe('crescimento sobre o período anterior', () => {
    it('positivo: 4250,00 sobre 2950,00 = +44,07%', async () => {
      const { arrangeCurrent, arrangePrevious, service } = build();
      arrangeCurrent({ paidCents: 4250_00 });
      arrangePrevious({ paidCents: 2950_00 });

      const { revenue } = await service.get('user-1', QUERY);

      expect(revenue.growthPercent).toBe(44.07);
    });

    it('negativo: queda de 25%', async () => {
      const { arrangeCurrent, arrangePrevious, service } = build();
      arrangeCurrent({ paidCents: 750_00 });
      arrangePrevious({ paidCents: 1000_00 });

      const { revenue } = await service.get('user-1', QUERY);

      expect(revenue.growthPercent).toBe(-25);
    });

    it('igual ao anterior: 0', async () => {
      const { arrangeCurrent, arrangePrevious, service } = build();
      arrangeCurrent({ paidCents: 1000_00 });
      arrangePrevious({ paidCents: 1000_00 });

      const { revenue } = await service.get('user-1', QUERY);

      expect(revenue.growthPercent).toBe(0);
    });

    it('compara só vendas pagas nos dois períodos (pendentes não entram em nenhum)', async () => {
      const { arrangeCurrent, arrangePrevious, service } = build();
      arrangeCurrent({ paidCents: 1000_00, pendingCents: 9000_00 });
      arrangePrevious({ paidCents: 500_00, pendingCents: 9000_00 });

      const { revenue } = await service.get('user-1', QUERY);

      expect(revenue.growthPercent).toBe(100);
    });

    it('anterior só com fiado pendente (nada pago): null, sem base para comparar', async () => {
      const { arrangeCurrent, arrangePrevious, service } = build();
      arrangeCurrent({ paidCents: 1000_00 });
      arrangePrevious({ pendingCents: 500_00 });

      const { revenue } = await service.get('user-1', QUERY);

      expect(revenue.growthPercent).toBeNull();
    });

    it('período anterior sem faturamento: null (sem base para comparar, sem dividir por zero)', async () => {
      const { arrangeCurrent, service } = build();
      arrangeCurrent({ paidCents: 4250_00 });

      const { revenue } = await service.get('user-1', QUERY);

      expect(revenue.growthPercent).toBeNull();
    });
  });

  describe('meta de vendas', () => {
    it('sem meta definida: goal null (a API não inventa um valor)', async () => {
      const { arrangeCurrent, service } = build();
      arrangeCurrent({ paidCents: 4250_00 });

      const { goal } = await service.get('user-1', QUERY);

      expect(goal).toBeNull();
    });

    it('progresso e quanto falta: 4250,50 de 5000 = 85,01% e faltam 749,50', async () => {
      const { stores, arrangeCurrent, service } = build();
      stores.getSettings.mockResolvedValue({ monthlyGoal: 5000, plan: 'free' });
      arrangeCurrent({ paidCents: 4250_50 });

      const { goal } = await service.get('user-1', QUERY);

      expect(goal).toEqual({ target: 5000, percent: 85.01, remaining: 749.5 });
    });

    it('meta batida: progresso limitado a 100 e falta 0', async () => {
      const { stores, arrangeCurrent, service } = build();
      stores.getSettings.mockResolvedValue({ monthlyGoal: 5000, plan: 'free' });
      arrangeCurrent({ paidCents: 6200_00 });

      const { goal } = await service.get('user-1', QUERY);

      expect(goal).toEqual({ target: 5000, percent: 100, remaining: 0 });
    });

    it('sem vendas: 0% e falta a meta inteira', async () => {
      const { stores, service } = build();
      stores.getSettings.mockResolvedValue({ monthlyGoal: 5000, plan: 'free' });

      const { goal } = await service.get('user-1', QUERY);

      expect(goal).toEqual({ target: 5000, percent: 0, remaining: 5000 });
    });

    it('a meta conta o mesmo faturamento do card: só vendas pagas', async () => {
      const { stores, arrangeCurrent, service } = build();
      stores.getSettings.mockResolvedValue({ monthlyGoal: 1000, plan: 'free' });
      arrangeCurrent({ paidCents: 200_00, pendingCents: 300_00 });

      const { goal } = await service.get('user-1', QUERY);

      expect(goal?.percent).toBe(20);
      expect(goal?.remaining).toBe(800);
    });

    it('meta zerada no banco (estado que a API não grava): trata como sem meta, sem dividir por zero', async () => {
      const { stores, arrangeCurrent, service } = build();
      stores.getSettings.mockResolvedValue({ monthlyGoal: 0, plan: 'free' });
      arrangeCurrent({ paidCents: 100_00 });

      const { goal } = await service.get('user-1', QUERY);

      expect(goal).toBeNull();
    });

    it('não acumula erro de ponto flutuante (faturamento 0,30 de meta 0,30 = 100%)', async () => {
      const { stores, arrangeCurrent, service } = build();
      stores.getSettings.mockResolvedValue({ monthlyGoal: 0.3, plan: 'free' });
      arrangeCurrent({ paidCents: 30 });

      const { goal } = await service.get('user-1', QUERY);

      expect(goal).toEqual({ target: 0.3, percent: 100, remaining: 0 });
    });
  });

  describe('plano', () => {
    it.each([
      ['free', 'Gratuito'],
      ['starter', 'Inicial'],
      ['premium', 'Pro'],
      ['business', 'Empresarial'],
    ] as const)('plano %s aparece como "%s"', async (id, name) => {
      const { stores, service } = build();
      stores.getSettings.mockResolvedValue({ monthlyGoal: null, plan: id });

      const { plan } = await service.get('user-1', QUERY);

      expect(plan).toEqual({ id, name });
    });

    it('lança NotFoundError se a loja sumiu entre as consultas', async () => {
      const { stores, service } = build();
      stores.getSettings.mockResolvedValue(null);

      await expect(service.get('user-1', QUERY)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('alertas', () => {
    it('estoque baixo: devolve o limite usado, o total e os produtos mais críticos', async () => {
      const { stores, service } = build();
      const products = [
        { storeProductId: '22222222-2222-4222-8222-222222222222', name: 'Kaiak', stock: 0 },
        { storeProductId: '33333333-3333-4333-8333-333333333333', name: 'Essencial', stock: 4 },
      ];
      stores.findLowStock.mockResolvedValue({ count: 7, products });

      const { alerts } = await service.get('user-1', QUERY);

      expect(alerts.lowStock).toEqual({ threshold: LOW_STOCK_THRESHOLD, count: 7, products });
    });

    it('vendas pendentes: a contagem vem de todas as vendas a receber', async () => {
      const { sales, service } = build();
      sales.countPending.mockResolvedValue(3);

      const { alerts } = await service.get('user-1', QUERY);

      expect(alerts.pendingSales).toEqual({ count: 3 });
    });

    it('tudo em dia: contagens zeradas e lista vazia', async () => {
      const { service } = build();

      const { alerts } = await service.get('user-1', QUERY);

      expect(alerts).toEqual({
        lowStock: { threshold: LOW_STOCK_THRESHOLD, count: 0, products: [] },
        pendingSales: { count: 0 },
      });
    });
  });
});
