import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_CONFIG, homeData, onSale, product } from '@/test/storefrontFixtures';
import { BenefitsStrip } from './BenefitsStrip';
import { CategoryShelf } from './CategoryShelf';
import { CollectionBanners } from './CollectionBanners';
import { Countdown, FlashSale } from './FlashSale';
import { HeroBanner } from './HeroBanner';
import { ProductCard } from './ProductCard';
import { SafeImage } from './SafeImage';
import { StorefrontFooter } from './StorefrontFooter';
import { StorefrontHeader } from './StorefrontHeader';

describe('SafeImage', () => {
  it('mostra a foto, e se ela não carrega troca pelo substituto', () => {
    render(<SafeImage src="https://img.test/x.jpg" alt="Perfume" fallback={<span>sem foto</span>} />);
    const image = screen.getByAltText('Perfume');

    fireEvent.error(image);

    expect(screen.queryByAltText('Perfume')).not.toBeInTheDocument();
    expect(screen.getByText('sem foto')).toBeInTheDocument();
  });

  it('sem substituto, some em vez de mostrar imagem quebrada', () => {
    const { container } = render(<SafeImage src="https://img.test/x.jpg" />);

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
  });

  it('tenta de novo quando o endereço da foto muda', () => {
    const { rerender, container } = render(<SafeImage src="https://img.test/a.jpg" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();

    rerender(<SafeImage src="https://img.test/b.jpg" />);

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://img.test/b.jpg');
  });
});

describe('ProductCard', () => {
  it('mostra marca, nome, preço e adiciona ao carrinho', async () => {
    const onAdd = vi.fn();
    render(<ProductCard product={product('a', { name: 'Kaiak', brand: 'Natura', price: 55 })} inCart={0} onAdd={onAdd} />);

    expect(screen.getByText('Natura')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Kaiak' })).toBeInTheDocument();
    expect(screen.getByText(/55,00/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('promoção: selo de desconto, preço novo e o antigo riscado', () => {
    render(<ProductCard product={onSale('a', 100, 80)} inCart={0} onAdd={() => {}} />);

    expect(screen.getByText('-20%')).toBeInTheDocument();
    expect(screen.getByText(/80,00/)).toBeInTheDocument();
    expect(screen.getByText(/100,00/)).toHaveClass('line-through');
  });

  it('produto novo ganha o selo "Novo"; sem ser novo, não', () => {
    const { rerender } = render(<ProductCard product={product('a', { isNew: true })} inCart={0} onAdd={() => {}} />);
    expect(screen.getByText('Novo')).toBeInTheDocument();

    rerender(<ProductCard product={product('a', { isNew: false })} inCart={0} onAdd={() => {}} />);
    expect(screen.queryByText('Novo')).not.toBeInTheDocument();
  });

  it('esgotado: botão desabilitado', () => {
    render(<ProductCard product={product('a', { inStock: false })} inCart={0} onAdd={() => {}} />);

    expect(screen.getByRole('button', { name: 'Esgotado' })).toBeDisabled();
  });

  it('já no carrinho: mostra a quantidade no botão', () => {
    render(<ProductCard product={product('a')} inCart={3} onAdd={() => {}} />);

    expect(screen.getByRole('button', { name: 'Adicionar mais (3)' })).toBeInTheDocument();
  });

  it('sem foto, mostra um ícone no lugar', () => {
    const { container } = render(<ProductCard product={product('a', { image: null, imageSm: null })} inCart={0} onAdd={() => {}} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('StorefrontHeader', () => {
  const sections = [
    { id: 'inicio', label: 'Início' },
    { id: 'ofertas', label: 'Ofertas' },
  ];

  function setup(overrides: Partial<React.ComponentProps<typeof StorefrontHeader>> = {}) {
    const props = {
      storeName: 'Leal Perfumaria',
      announcement: DEFAULT_CONFIG.announcement,
      acceptedPaymentMethods: ['pix', 'card'] as ('pix' | 'card' | 'cash')[],
      sections,
      query: '',
      onQueryChange: vi.fn(),
      cartCount: 0,
      onOpenCart: vi.fn(),
      ...overrides,
    };
    render(<StorefrontHeader {...props} />);
    return props;
  }

  it('mostra o aviso e, sem texto próprio à direita, as formas de pagamento aceitas', () => {
    setup();

    expect(screen.getByText(/Bem-vinda à Leal Perfumaria/)).toBeInTheDocument();
    expect(screen.getByText('Aceitamos Pix · Cartão')).toBeInTheDocument();
  });

  it('usa o texto da direita quando a loja escreveu um', () => {
    setup({ announcement: { ...DEFAULT_CONFIG.announcement, rightText: 'Entrega grátis acima de R$ 150' } });

    expect(screen.getByText('Entrega grátis acima de R$ 150')).toBeInTheDocument();
    expect(screen.queryByText(/Aceitamos/)).not.toBeInTheDocument();
  });

  it('aviso desligado some', () => {
    setup({ announcement: { ...DEFAULT_CONFIG.announcement, enabled: false } });

    expect(screen.queryByText(/Bem-vinda/)).not.toBeInTheDocument();
  });

  it('o menu só lista as seções que existem', () => {
    setup();

    expect(screen.getAllByRole('button', { name: 'Ofertas' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Novidades' })).not.toBeInTheDocument();
  });

  it('busca: avisa a cada letra e limpa pelo X', async () => {
    const props = setup({ query: 'kai' });

    await userEvent.type(screen.getByLabelText('Buscar produto'), 'a');
    await userEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));

    expect(props.onQueryChange).toHaveBeenCalledWith('kaia');
    expect(props.onQueryChange).toHaveBeenLastCalledWith('');
  });

  it('carrinho: mostra a quantidade e abre ao clicar', async () => {
    const props = setup({ cartCount: 3 });

    await userEvent.click(screen.getByRole('button', { name: 'Abrir carrinho (3 itens)' }));

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(props.onOpenCart).toHaveBeenCalledTimes(1);
  });
});

describe('HeroBanner', () => {
  function setup(overrides: Partial<React.ComponentProps<typeof HeroBanner>> = {}) {
    const props = {
      hero: DEFAULT_CONFIG.hero,
      images: ['https://img.test/a.jpg', 'https://img.test/b.jpg'],
      maxDiscount: 0,
      productCount: 586,
      hasOffers: false,
      onPrimary: vi.fn(),
      onSecondary: vi.fn(),
      ...overrides,
    };
    const view = render(<HeroBanner {...props} />);
    return { props, ...view };
  }

  it('mostra os textos do banner e a quantidade de produtos', () => {
    setup();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Beleza e cuidado para o seu dia a dia');
    expect(screen.getByText('NOVIDADES DA LOJA')).toBeInTheDocument();
    expect(screen.getByText('586')).toBeInTheDocument();
  });

  it('botão de ofertas só aparece quando há promoção', () => {
    const { unmount } = setup({ hasOffers: false });
    expect(screen.queryByRole('button', { name: 'Ver ofertas' })).not.toBeInTheDocument();
    unmount();

    setup({ hasOffers: true });
    expect(screen.getByRole('button', { name: 'Ver ofertas' })).toBeInTheDocument();
  });

  it('os botões chamam as ações', async () => {
    const { props } = setup({ hasOffers: true });

    await userEvent.click(screen.getByRole('button', { name: /Ver produtos/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Ver ofertas' }));

    expect(props.onPrimary).toHaveBeenCalledTimes(1);
    expect(props.onSecondary).toHaveBeenCalledTimes(1);
  });

  it('selo "até X% off" só quando há desconto', () => {
    const { unmount } = setup({ maxDiscount: 0 });
    expect(screen.queryByLabelText(/Até .*% de desconto/)).not.toBeInTheDocument();
    unmount();

    setup({ maxDiscount: 40 });
    expect(screen.getByLabelText('Até 40% de desconto')).toBeInTheDocument();
  });

  it('com imagem da loja usa ela; sem imagem monta a arte com as fotos dos produtos', () => {
    const { container, unmount } = setup({ hero: { ...DEFAULT_CONFIG.hero, imageUrl: 'https://cdn.test/banner.jpg' } });
    expect(container.querySelector('img[src="https://cdn.test/banner.jpg"]')).not.toBeNull();
    expect(container.querySelector('img[src="https://img.test/a.jpg"]')).toBeNull();
    unmount();

    const { container: art } = setup();
    expect(art.querySelector('img[src="https://img.test/a.jpg"]')).not.toBeNull();
    expect(art.querySelector('img[src="https://img.test/b.jpg"]')).not.toBeNull();
  });

  it('sem fotos nem imagem, mostra um ícone em vez de quebrar', () => {
    const { container } = setup({ images: [] });

    expect(container.querySelectorAll('img')).toHaveLength(0);
  });
});

describe('BenefitsStrip', () => {
  it('mostra os 4 diferenciais', () => {
    render(<BenefitsStrip benefits={DEFAULT_CONFIG.benefits} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Retirada ou entrega')).toBeInTheDocument();
    expect(screen.getByText('Fale com a sua consultora')).toBeInTheDocument();
  });
});

describe('CategoryShelf', () => {
  const categories = homeData().categories;

  function setup(active: React.ComponentProps<typeof CategoryShelf>['active'] = null) {
    const onSelect = vi.fn();
    const onClear = vi.fn();
    render(<CategoryShelf categories={categories} active={active} onSelect={onSelect} onClear={onClear} />);
    return { onSelect, onClear };
  }

  it('mostra cada atalho com a contagem (singular e plural) e o "Ver tudo"', () => {
    render(
      <CategoryShelf
        categories={[...categories, { type: 'brand', id: '9', name: 'Avon', count: 1, image: null }]}
        active={null}
        onSelect={() => {}}
        onClear={() => {}}
      />,
    );

    expect(screen.getByText('12 itens')).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ver tudo/ })).toBeInTheDocument();
  });

  it('clicar num atalho entrega o filtro (tipo e id)', async () => {
    const { onSelect } = setup();

    await userEvent.click(screen.getByRole('button', { name: /Natura/ }));
    await userEvent.click(screen.getByRole('button', { name: /Presentes/ }));

    expect(onSelect).toHaveBeenNthCalledWith(1, { type: 'brand', id: '1' });
    expect(onSelect).toHaveBeenNthCalledWith(2, { type: 'category', id: 'cat-1' });
  });

  it('marca o atalho ativo', () => {
    setup({ type: 'brand', id: '1' });

    expect(screen.getByRole('button', { name: /Natura/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Presentes/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('"Ver tudo" limpa o filtro', async () => {
    const { onClear } = setup({ type: 'brand', id: '1' });

    await userEvent.click(screen.getByRole('button', { name: /Ver tudo/ }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('mostra no máximo 7 atalhos mais o "Ver tudo"', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      type: 'brand' as const,
      id: String(index),
      name: `Marca ${index}`,
      count: 1,
      image: null,
    }));
    render(<CategoryShelf categories={many} active={null} onSelect={() => {}} onClear={() => {}} />);

    // 7 atalhos + "Ver tudo" na grade (o link do título também chama onClear, mas não é da grade).
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(8);
  });
});

describe('Countdown / FlashSale', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra a contagem regressiva e atualiza a cada segundo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T12:00:00.000Z'));
    render(<Countdown endsAt="2026-10-19T15:04:10.000Z" />);

    const timer = screen.getByRole('timer');
    expect(timer).toHaveTextContent('02');
    expect(timer).toHaveTextContent('03');
    expect(timer).toHaveTextContent('04');
    expect(timer).toHaveTextContent('10');

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('timer')).toHaveTextContent('08');
  });

  it('some quando a oferta acaba, e não aparece sem data de fim', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T12:00:00.000Z'));
    const { rerender } = render(<Countdown endsAt="2026-10-17T12:00:01.000Z" />);
    expect(screen.getByRole('timer')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();

    rerender(<Countdown endsAt={null} />);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('FlashSale mostra título, desconto e leva às ofertas', async () => {
    const onShop = vi.fn();
    render(<FlashSale flash={DEFAULT_CONFIG.flash} endsAt={null} images={['https://img.test/a.jpg']} maxDiscount={30} onShop={onShop} />);

    expect(screen.getByRole('heading', { name: 'Ofertas relâmpago' })).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ver ofertas' }));

    expect(onShop).toHaveBeenCalledTimes(1);
  });
});

describe('CollectionBanners', () => {
  const collections = DEFAULT_CONFIG.collections;

  it('mostra as coleções e abre a certa ao clicar', async () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <CollectionBanners
        items={[
          { collection: collections[0], images: [], onOpen: first },
          { collection: collections[1], images: [], onOpen: second },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Ver novidades/ }));

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Mais vendidos' })).toBeInTheDocument();
  });

  it('imagem própria da loja substitui as fotos dos produtos', () => {
    const { container } = render(
      <CollectionBanners
        items={[
          { collection: { ...collections[0], imageUrl: 'https://cdn.test/c.jpg' }, images: ['https://img.test/a.jpg'], onOpen: () => {} },
          { collection: collections[1], images: ['https://img.test/b.jpg'], onOpen: () => {} },
        ]}
      />,
    );

    expect(container.querySelector('img[src="https://cdn.test/c.jpg"]')).not.toBeNull();
    expect(container.querySelector('img[src="https://img.test/a.jpg"]')).toBeNull();
    expect(container.querySelector('img[src="https://img.test/b.jpg"]')).not.toBeNull();
  });
});

describe('StorefrontFooter', () => {
  it('mostra o nome, a descrição e as formas de pagamento aceitas', () => {
    render(<StorefrontFooter storeName="Leal Perfumaria" bio="Cosméticos com entrega rápida." acceptedPaymentMethods={['pix', 'cash']} hideBranding={false} />);

    expect(screen.getByText('Cosméticos com entrega rápida.')).toBeInTheDocument();
    expect(screen.getByText('Pix')).toBeInTheDocument();
    expect(screen.getByText('Dinheiro')).toBeInTheDocument();
    expect(screen.queryByText('Cartão')).not.toBeInTheDocument();
  });

  it('mostra a marca do Revendajá, exceto nos planos que a escondem', () => {
    const { rerender } = render(<StorefrontFooter storeName="Leal" bio={null} acceptedPaymentMethods={['pix']} hideBranding={false} />);
    expect(screen.getByRole('link', { name: 'Revendajá' })).toBeInTheDocument();

    rerender(<StorefrontFooter storeName="Leal" bio={null} acceptedPaymentMethods={['pix']} hideBranding />);
    expect(screen.queryByRole('link', { name: 'Revendajá' })).not.toBeInTheDocument();
  });
});
