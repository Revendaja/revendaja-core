import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test/utils';
import { ApiError } from '@/lib/api/errors';
import type { Coupon, CreateCouponInput, UpdateCouponInput } from '@/lib/api/types';
import CouponsPage from './page';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/lib/api/coupons', () => ({
  listCoupons: () => mocks.list(),
  createCoupon: (input: unknown) => mocks.create(input),
  updateCoupon: (id: string, input: unknown) => mocks.update(id, input),
  deleteCoupon: (id: string) => mocks.remove(id),
}));

function coupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: 'c1',
    code: 'VERAO10',
    type: 'percent',
    value: 10,
    minOrder: null,
    maxUses: null,
    usedCount: 0,
    expiresAt: null,
    isActive: true,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

async function renderLoaded(items: Coupon[] = []) {
  mocks.list.mockResolvedValue({ items });
  renderWithQuery(<CouponsPage />);
  await screen.findByRole('heading', { name: 'Novo cupom' });
  if (items.length > 0) await screen.findByRole('article', { name: `Cupom ${items[0].code}` });
}

describe('Cupons de desconto (painel)', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('sem cupons: mostra o aviso de lista vazia', async () => {
    await renderLoaded([]);

    expect(await screen.findByText('Você ainda não tem cupons')).toBeInTheDocument();
  });

  it('lista cada cupom com código, desconto, situação e detalhes', async () => {
    await renderLoaded([
      coupon(),
      coupon({ id: 'c2', code: 'FRETE20', type: 'fixed', value: 20, minOrder: 100, maxUses: 5, usedCount: 5 }),
      coupon({ id: 'c3', code: 'ANTIGO', isActive: false }),
    ]);

    const first = screen.getByRole('article', { name: 'Cupom VERAO10' });
    expect(within(first).getByText('10% de desconto')).toBeInTheDocument();
    expect(within(first).getByText('Ativo')).toBeInTheDocument();
    expect(within(first).getByText('0 usos')).toBeInTheDocument();

    const second = screen.getByRole('article', { name: 'Cupom FRETE20' });
    expect(within(second).getByText(/R\$\s?20,00 de desconto/)).toBeInTheDocument();
    expect(within(second).getByText('Esgotado')).toBeInTheDocument();
    expect(within(second).getByText(/Pedido mínimo R\$\s?100,00 · 5 de 5 usos/)).toBeInTheDocument();

    expect(within(screen.getByRole('article', { name: 'Cupom ANTIGO' })).getByText('Desligado')).toBeInTheDocument();
  });

  it('erro ao carregar: mostra a mensagem e deixa tentar de novo', async () => {
    mocks.list.mockRejectedValue(new ApiError(500, 'INTERNAL', 'Algo deu errado.'));
    renderWithQuery(<CouponsPage />);

    expect(await screen.findByText('Algo deu errado.')).toBeInTheDocument();
    mocks.list.mockResolvedValue({ items: [coupon()] });
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByRole('article', { name: 'Cupom VERAO10' })).toBeInTheDocument();
  });

  describe('criar', () => {
    const fill = async (label: string, text: string) => {
      const field = screen.getByLabelText(label);
      await userEvent.clear(field);
      await userEvent.type(field, text);
    };

    it('cupom percentual simples: manda código em maiúsculas, valor e opcionais nulos', async () => {
      await renderLoaded([]);
      mocks.create.mockResolvedValue(coupon());

      await fill('Código do cupom', 'verao10');
      await fill('Desconto em porcentagem', '10');
      await userEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));

      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      expect(mocks.create).toHaveBeenCalledWith({
        code: 'VERAO10',
        type: 'percent',
        value: 10,
        minOrder: null,
        maxUses: null,
        expiresAt: null,
      } satisfies CreateCouponInput);
    });

    it('valor fixo com mínimo, limite e validade', async () => {
      await renderLoaded([]);
      mocks.create.mockResolvedValue(coupon());
      const nextYear = new Date().getFullYear() + 1;

      await fill('Código do cupom', 'frete20');
      await userEvent.click(screen.getByRole('button', { name: 'Valor fixo' }));
      await fill('Desconto (R$)', '2000');
      await fill('Pedido mínimo (opcional)', '10000');
      await fill('Limite de usos', '50');
      await fill('Data de validade', `${nextYear}-12-31`);
      await userEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));

      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      const sent = mocks.create.mock.calls[0][0] as CreateCouponInput;
      expect(sent).toMatchObject({ code: 'FRETE20', type: 'fixed', value: 20, minOrder: 100, maxUses: 50 });
      expect(new Date(sent.expiresAt as string).getFullYear()).toBe(nextYear);
    });

    it('limpa o formulário e recarrega a lista depois de criar', async () => {
      await renderLoaded([]);
      mocks.create.mockResolvedValue(coupon());
      mocks.list.mockResolvedValue({ items: [coupon()] });

      await fill('Código do cupom', 'verao10');
      await fill('Desconto em porcentagem', '10');
      await userEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));

      expect(await screen.findByRole('article', { name: 'Cupom VERAO10' })).toBeInTheDocument();
      expect(screen.getByLabelText('Código do cupom')).toHaveValue('');
    });

    it.each([
      ['código curto demais', 'AB', '10', 'Use de 3 a 20 letras'],
      ['percentual acima de 100', 'ABC', '150', 'Informe de 1% a 100%.'],
      ['percentual vazio', 'ABC', '', 'Informe de 1% a 100%.'],
    ])('validação: %s não chama a API', async (_name, code, percent, message) => {
      await renderLoaded([]);

      await fill('Código do cupom', code);
      if (percent) await fill('Desconto em porcentagem', percent);
      await userEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));

      expect(await screen.findByText(new RegExp(message))).toBeInTheDocument();
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it('validade no passado não chama a API', async () => {
      await renderLoaded([]);

      await fill('Código do cupom', 'ABC');
      await fill('Desconto em porcentagem', '10');
      await fill('Data de validade', '2020-01-01');
      await userEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));

      expect(await screen.findByText('Escolha uma data de hoje em diante.')).toBeInTheDocument();
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it('código repetido (409): mostra o erro da API e mantém o que foi digitado', async () => {
      await renderLoaded([]);
      mocks.create.mockRejectedValue(new ApiError(409, 'CONFLICT', 'Você já tem um cupom com esse código.'));

      await fill('Código do cupom', 'verao10');
      await fill('Desconto em porcentagem', '10');
      await userEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));

      expect(await screen.findByText('Você já tem um cupom com esse código.')).toBeInTheDocument();
      expect(screen.getByLabelText('Código do cupom')).toHaveValue('VERAO10');
    });
  });

  describe('gerenciar', () => {
    it('liga/desliga o cupom', async () => {
      await renderLoaded([coupon()]);
      mocks.update.mockResolvedValue(coupon({ isActive: false }));

      await userEvent.click(screen.getByRole('switch', { name: 'Cupom VERAO10 ligado' }));

      await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('c1', { isActive: false } satisfies UpdateCouponInput));
    });

    it('apagar pede confirmação; "Voltar" desiste e "Apagar" confirma', async () => {
      await renderLoaded([coupon()]);
      mocks.remove.mockResolvedValue(null);

      await userEvent.click(screen.getByRole('button', { name: 'Apagar cupom VERAO10' }));
      expect(screen.getByText('Apagar o cupom VERAO10?')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
      expect(screen.queryByText('Apagar o cupom VERAO10?')).not.toBeInTheDocument();
      expect(mocks.remove).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Apagar cupom VERAO10' }));
      mocks.list.mockResolvedValue({ items: [] });
      await userEvent.click(within(screen.getByRole('article', { name: 'Cupom VERAO10' })).getByRole('button', { name: 'Apagar' }));

      await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('c1'));
      expect(await screen.findByText('Você ainda não tem cupons')).toBeInTheDocument();
    });

    it('erro ao desligar aparece no topo da lista', async () => {
      await renderLoaded([coupon()]);
      mocks.update.mockRejectedValue(new ApiError(500, 'INTERNAL', 'Não foi possível salvar.'));

      await userEvent.click(screen.getByRole('switch', { name: 'Cupom VERAO10 ligado' }));

      expect(await screen.findByText('Não foi possível salvar.')).toBeInTheDocument();
    });
  });
});
