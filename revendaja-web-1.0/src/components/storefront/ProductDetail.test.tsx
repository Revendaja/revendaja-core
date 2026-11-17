import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StorefrontProduct } from '@/lib/api/types';
import { ProductCard } from './ProductCard';
import { ProductDetail } from './ProductDetail';

const product = (overrides: Partial<StorefrontProduct> = {}): StorefrontProduct => ({
  id: 'p1',
  name: 'Malbec Eau de Parfum',
  description: 'Amadeirado intenso.\nFixação longa.',
  brand: 'O Boticário',
  image: 'https://img.test/malbec.jpg',
  imageSm: null,
  price: 200,
  promoPrice: 150,
  isPromoActive: true,
  inStock: true,
  isNew: false,
  ...overrides,
});

function setup(item = product(), extra: Partial<Parameters<typeof ProductDetail>[0]> = {}) {
  const props = {
    product: item,
    related: [product({ id: 'p2', name: 'Egeo Choc' })],
    loadingRelated: false,
    inCart: 0,
    maxQuantity: 5,
    cep: null,
    favoriteIds: new Set<string>(),
    onToggleFavorite: vi.fn(),
    onAdd: vi.fn(),
    onBuyNow: vi.fn(),
    onBack: vi.fn(),
    onOpenProduct: vi.fn(),
    ...extra,
  };
  render(<ProductDetail {...props} />);
  return props;
}

describe('página de detalhes do produto', () => {
  it('mostra nome, preço promocional, desconto, descrição e os parecidos', () => {
    setup();

    expect(screen.getByRole('heading', { level: 1, name: 'Malbec Eau de Parfum' })).toBeInTheDocument();
    expect(screen.getByText('25% OFF')).toBeInTheDocument();
    expect(screen.getByText(/Fixação longa/)).toBeInTheDocument();
    expect(screen.getByText('Egeo Choc')).toBeInTheDocument();
  });

  it('adiciona a quantidade escolhida ao carrinho e respeita o máximo', async () => {
    const props = setup();

    const more = screen.getByRole('button', { name: 'Aumentar quantidade' });
    for (let i = 0; i < 10; i += 1) await userEvent.click(more);
    expect(more).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar ao carrinho' }));
    expect(props.onAdd).toHaveBeenCalledWith(props.product, 5);
  });

  it('"Comprar agora" manda a quantidade para o carrinho', async () => {
    const props = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Aumentar quantidade' }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprar agora' }));

    expect(props.onBuyNow).toHaveBeenCalledWith(props.product, 2);
  });

  it('produto esgotado não deixa comprar nem adicionar', () => {
    setup(product({ inStock: false }));

    expect(screen.getByRole('button', { name: 'Esgotado' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Adicionar ao carrinho/ })).not.toBeInTheDocument();
  });

  it('voltar e favoritar avisam quem usa a página', async () => {
    const props = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Favoritar Malbec Eau de Parfum' }));

    expect(props.onBack).toHaveBeenCalled();
    expect(props.onToggleFavorite).toHaveBeenCalledWith(props.product);
  });
});

describe('card de produto abre os detalhes', () => {
  it('clicar na foto ou no nome abre; adicionar não abre', async () => {
    const onOpen = vi.fn();
    render(<ProductCard product={product()} onOpen={onOpen} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ver detalhes: Malbec Eau de Parfum' }));
    await userEvent.click(screen.getByRole('button', { name: 'Malbec Eau de Parfum' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
