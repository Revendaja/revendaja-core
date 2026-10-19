import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithQuery } from '@/test/utils';
import type { StorePlanUsage } from '@/lib/api/types';
import { OverLimitBanner } from './OverLimitBanner';

const getStorePlan = vi.fn();
vi.mock('@/lib/api/stores', () => ({ getStorePlan: () => getStorePlan() }));

function usage(overrides: Partial<StorePlanUsage> & { products?: number; frozen?: number; max?: number | null }): StorePlanUsage {
  return {
    plan: overrides.plan ?? { id: 'starter', name: 'Inicial' },
    limits: {
      maxProducts: overrides.max === undefined ? 200 : overrides.max,
      manualProductsEnabled: true,
      categoriesEnabled: true,
      promotionsEnabled: true,
    },
    usage: { products: overrides.products ?? 0, frozen: overrides.frozen ?? 0 },
  };
}

describe('OverLimitBanner', () => {
  beforeEach(() => {
    getStorePlan.mockReset();
  });

  it('avisa quando a loja tem mais produtos do que o plano permite', async () => {
    getStorePlan.mockResolvedValue(usage({ products: 320, frozen: 120 }));

    renderWithQuery(<OverLimitBanner />);

    expect(await screen.findByText(/acima do limite do plano Inicial: 320 de 200 produtos/)).toBeInTheDocument();
    expect(screen.getByText(/120 produtos estão congelados/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver planos' })).toHaveAttribute('href', '/planos');
  });

  it('usa o singular com um produto congelado', async () => {
    getStorePlan.mockResolvedValue(usage({ products: 201, frozen: 1 }));

    renderWithQuery(<OverLimitBanner />);

    expect(await screen.findByText(/1 produto está congelado/)).toBeInTheDocument();
  });

  it('esconde o botão quando a página já é a de planos', async () => {
    getStorePlan.mockResolvedValue(usage({ products: 320, frozen: 120 }));

    renderWithQuery(<OverLimitBanner showAction={false} />);

    await screen.findByText(/acima do limite/);
    expect(screen.queryByRole('link', { name: 'Ver planos' })).not.toBeInTheDocument();
  });

  it('não aparece dentro do limite, nem exatamente no limite', async () => {
    getStorePlan.mockResolvedValue(usage({ products: 200 }));

    renderWithQuery(<OverLimitBanner />);

    await vi.waitFor(() => expect(getStorePlan).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('não aparece em plano sem limite de produtos', async () => {
    getStorePlan.mockResolvedValue(usage({ plan: { id: 'premium', name: 'Pro' }, max: null, products: 5000 }));

    renderWithQuery(<OverLimitBanner />);

    await vi.waitFor(() => expect(getStorePlan).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
