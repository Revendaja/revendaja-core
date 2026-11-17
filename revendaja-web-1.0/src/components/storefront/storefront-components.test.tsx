import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_CONFIG, homeData, onSale, product } from '@/test/storefrontFixtures';
import { BenefitsStrip } from './BenefitsStrip';
import { BrandsStrip } from './BrandsStrip';
import { CategoryShelf } from './CategoryShelf';
import { CollectionBanners } from './CollectionBanners';
import { Countdown, FlashSale } from './FlashSale';
import { BannerCarousel } from './BannerCarousel';
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
  it('mostra marca, nome e preço, sem botão de adicionar (o carrinho é na página do produto)', () => {
    render(<ProductCard product={product('a', { name: 'Kaiak', brand: 'Natura', price: 55 })} />);

    expect(screen.getByText('Natura')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Kaiak' })).toBeInTheDocument();
    expect(screen.getByText(/55,00/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adicionar/ })).not.toBeInTheDocument();
  });

  it('promoção: selo de desconto, preço novo e o antigo riscado', () => {
    render(<ProductCard product={onSale('a', 100, 80)} />);

    expect(screen.getByText('-20%')).toBeInTheDocument();
    expect(screen.getByText(/80,00/)).toBeInTheDocument();
    expect(screen.getByText(/100,00/)).toHaveClass('line-through');
  });

  it('produto novo ganha o selo "Novo"; sem ser novo, não', () => {
    const { rerender } = render(<ProductCard product={product('a', { isNew: true })} />);
    expect(screen.getByText('Novo')).toBeInTheDocument();

    rerender(<ProductCard product={product('a', { isNew: false })} />);
    expect(screen.queryByText('Novo')).not.toBeInTheDocument();
  });

  it('esgotado: mostra o aviso; com estoque, não', () => {
    const { rerender } = render(<ProductCard product={product('a', { inStock: false })} />);
    expect(screen.getByText('Esgotado')).toBeInTheDocument();

    rerender(<ProductCard product={product('a', { inStock: true })} />);
    expect(screen.queryByText('Esgotado')).not.toBeInTheDocument();
  });

  it('sem foto, mostra um ícone no lugar', () => {
    const { container } = render(<ProductCard product={product('a', { image: null, imageSm: null })} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('StorefrontHeader', () => {
  const sections = [
    { id: 'inicio', label: 'Início' },
    { id: 'ofertas', label: 'Ofertas' },
  ];

  function baseProps(): React.ComponentProps<typeof StorefrontHeader> {
    return {
      storeName: 'Leal Perfumaria',
      announcement: DEFAULT_CONFIG.announcement,
      acceptedPaymentMethods: ['pix'],
      sections: [],
      onSearch: vi.fn(),
      cartCount: 0,
      onOpenCart: vi.fn(),
    };
  }

  function setup(overrides: Partial<React.ComponentProps<typeof StorefrontHeader>> = {}) {
    const props = {
      storeName: 'Leal Perfumaria',
      announcement: DEFAULT_CONFIG.announcement,
      acceptedPaymentMethods: ['pix', 'card'] as ('pix' | 'card' | 'cash')[],
      sections,
      onSearch: vi.fn(),
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

  describe('busca', () => {
    it('digitar não busca: só o Enter confirma', async () => {
      const props = setup();

      await userEvent.type(screen.getByLabelText('Buscar produto'), 'kaiak');
      expect(props.onSearch).not.toHaveBeenCalled();

      await userEvent.keyboard('{Enter}');
      expect(props.onSearch).toHaveBeenCalledTimes(1);
      expect(props.onSearch).toHaveBeenCalledWith('kaiak');
    });

    it('a lupa também confirma a busca', async () => {
      const props = setup();

      await userEvent.type(screen.getByLabelText('Buscar produto'), '  malbec ');
      await userEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));

      expect(props.onSearch).toHaveBeenCalledWith('malbec');
    });

    it('menos de 2 letras não busca', async () => {
      const props = setup();

      await userEvent.type(screen.getByLabelText('Buscar produto'), 'k{Enter}');

      expect(props.onSearch).not.toHaveBeenCalled();
    });

    it('o X limpa o campo e, estando numa busca, volta para a home', async () => {
      const onClearSearch = vi.fn();
      setup({ searchTerm: 'kaiak', onClearSearch });
      const input = screen.getByLabelText('Buscar produto');
      expect(input).toHaveValue('kaiak');

      await userEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));

      expect(input).toHaveValue('');
      expect(onClearSearch).toHaveBeenCalledTimes(1);
    });

    it('o campo acompanha a busca em vigor quando ela muda por fora', () => {
      const { rerender } = render(<StorefrontHeader {...baseProps()} searchTerm="kaiak" />);
      expect(screen.getByLabelText('Buscar produto')).toHaveValue('kaiak');

      rerender(<StorefrontHeader {...baseProps()} searchTerm="" />);
      expect(screen.getByLabelText('Buscar produto')).toHaveValue('');
    });

    describe('buscas recentes', () => {
      const recentSearches = ['kaiak', 'malbec', 'floratta'];

      it('ao focar o campo mostra as buscas recentes; sem histórico, nada', async () => {
        const { unmount } = render(<StorefrontHeader {...baseProps()} recentSearches={recentSearches} />);

        await userEvent.click(screen.getByLabelText('Buscar produto'));

        const list = screen.getByRole('listbox', { name: 'Buscas recentes' });
        expect(within(list).getAllByRole('option').map((item) => item.textContent)).toEqual(['kaiak', 'malbec', 'floratta']);
        unmount();

        render(<StorefrontHeader {...baseProps()} recentSearches={[]} />);
        await userEvent.click(screen.getByLabelText('Buscar produto'));
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });

      it('clicar numa busca recente roda a busca', async () => {
        const onSearch = vi.fn();
        render(<StorefrontHeader {...baseProps()} recentSearches={recentSearches} onSearch={onSearch} />);

        await userEvent.click(screen.getByLabelText('Buscar produto'));
        await userEvent.click(screen.getByRole('option', { name: 'malbec' }));

        expect(onSearch).toHaveBeenCalledWith('malbec');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });

      it('digitar filtra a lista de recentes', async () => {
        render(<StorefrontHeader {...baseProps()} recentSearches={recentSearches} />);

        await userEvent.type(screen.getByLabelText('Buscar produto'), 'mal');

        expect(screen.getAllByRole('option').map((item) => item.textContent)).toEqual(['malbec']);
      });

      it('remove uma busca recente e limpa o histórico todo', async () => {
        const onRemoveRecent = vi.fn();
        const onClearRecent = vi.fn();
        render(
          <StorefrontHeader {...baseProps()} recentSearches={recentSearches} onRemoveRecent={onRemoveRecent} onClearRecent={onClearRecent} />,
        );
        await userEvent.click(screen.getByLabelText('Buscar produto'));

        await userEvent.click(screen.getByRole('button', { name: 'Remover kaiak do histórico' }));
        await userEvent.click(screen.getByRole('button', { name: 'Limpar histórico' }));

        expect(onRemoveRecent).toHaveBeenCalledWith('kaiak');
        expect(onClearRecent).toHaveBeenCalledTimes(1);
      });

      it('Esc fecha a lista', async () => {
        render(<StorefrontHeader {...baseProps()} recentSearches={recentSearches} />);
        await userEvent.click(screen.getByLabelText('Buscar produto'));

        await userEvent.keyboard('{Escape}');

        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  it('sem conta: cumprimenta "Visitante" e, depois do primeiro pedido, o primeiro nome', () => {
    const { unmount } = render(
      <StorefrontHeader {...baseProps()} />,
    );
    expect(screen.getByText('Visitante')).toBeInTheDocument();
    expect(screen.queryByText(/Entrar/)).not.toBeInTheDocument();
    unmount();

    render(<StorefrontHeader {...baseProps()} customerName="Maria da Silva" />);
    expect(screen.getByText('Maria')).toBeInTheDocument();
  });

  it('categorias do estoque: "Todos" + cada uma, e clicar filtra', async () => {
    const onSelectCategory = vi.fn();
    const onClearCategory = vi.fn();
    render(
      <StorefrontHeader
        {...baseProps()}
        categories={[
          { type: 'category', id: 'c1', name: 'Perfumaria', count: 4, image: null },
          { type: 'brand', id: '7', name: 'Natura', count: 2, image: null },
        ]}
        activeFilter={{ type: 'brand', id: '7' }}
        onSelectCategory={onSelectCategory}
        onClearCategory={onClearCategory}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Perfumaria' }));
    await userEvent.click(screen.getByRole('button', { name: 'Todos' }));

    expect(onSelectCategory).toHaveBeenCalledWith({ type: 'category', id: 'c1' });
    expect(onClearCategory).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Natura' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('CEP: consulta o endereço e devolve para a vitrine guardar', async () => {
    const onCepChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ logradouro: 'Av. Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' }),
      }),
    );
    render(<StorefrontHeader {...baseProps()} onCepChange={onCepChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Informar CEP' }));
    await userEvent.type(screen.getByLabelText('CEP'), '01310100');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(fetch).toHaveBeenCalledWith('https://viacep.com.br/ws/01310100/json/', expect.anything());
    expect(onCepChange).toHaveBeenCalledWith({
      cep: '01310100',
      street: 'Av. Paulista',
      district: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    });
    vi.unstubAllGlobals();
  });

  it('CEP inválido ou inexistente mostra o erro e não salva', async () => {
    const onCepChange = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ erro: true }) }));
    render(<StorefrontHeader {...baseProps()} onCepChange={onCepChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Informar CEP' }));
    await userEvent.type(screen.getByLabelText('CEP'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Digite os 8 números do CEP.');

    await userEvent.type(screen.getByLabelText('CEP'), '45678');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CEP não encontrado.');
    expect(onCepChange).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('carrinho: mostra a quantidade e abre ao clicar', async () => {
    const props = setup({ cartCount: 3 });

    await userEvent.click(screen.getByRole('button', { name: 'Abrir carrinho (3 itens)' }));

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(props.onOpenCart).toHaveBeenCalledTimes(1);
  });
});

describe('BannerCarousel', () => {
  const banners = [
    { imageUrl: 'https://img.test/b1.jpg', link: { type: 'section' as const, section: 'offers' as const } },
    { imageUrl: 'https://img.test/b2.jpg', link: null },
    { imageUrl: 'https://img.test/b3.jpg', link: { type: 'category' as const, id: 'c1' } },
  ];

  function setup(list = banners) {
    const onOpen = vi.fn();
    render(<BannerCarousel banners={list} storeName="Leal" onOpen={onOpen} />);
    return { onOpen };
  }

  // O slide fica fora da tela (inert + aria-hidden) até a vez dele.
  const visibleSlide = () => screen.getByRole('group', { hidden: false, name: /de 3$/ });

  afterEach(() => vi.useRealTimers());

  it('mostra as setas e os pontos quando há mais de um banner', () => {
    setup();

    expect(screen.getByRole('button', { name: 'Banner anterior' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próximo banner' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Ir para o banner/ })).toHaveLength(3);
  });

  it('com um banner só: sem setas nem pontos; sem nenhum: não renderiza', () => {
    const { onOpen } = setup([banners[0]]);
    expect(screen.queryByRole('button', { name: 'Próximo banner' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ir para o banner/ })).not.toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('não renderiza nada sem banners', () => {
    const { container } = render(<BannerCarousel banners={[]} storeName="Leal" onOpen={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('as setas passam de um lado para o outro, dando a volta', async () => {
    setup();
    expect(visibleSlide()).toHaveAttribute('aria-label', '1 de 3');

    await userEvent.click(screen.getByRole('button', { name: 'Próximo banner' }));
    expect(visibleSlide()).toHaveAttribute('aria-label', '2 de 3');

    await userEvent.click(screen.getByRole('button', { name: 'Banner anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Banner anterior' }));
    expect(visibleSlide()).toHaveAttribute('aria-label', '3 de 3');
  });

  it('os pontos levam direto ao banner', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Ir para o banner 3' }));

    expect(visibleSlide()).toHaveAttribute('aria-label', '3 de 3');
  });

  it('passa sozinho a cada 6 segundos e para quando o mouse está em cima', () => {
    vi.useFakeTimers();
    setup();

    act(() => void vi.advanceTimersByTime(6000));
    expect(visibleSlide()).toHaveAttribute('aria-label', '2 de 3');

    fireEvent.mouseEnter(screen.getByRole('region', { name: 'Destaques da loja' }));
    act(() => void vi.advanceTimersByTime(20000));
    expect(visibleSlide()).toHaveAttribute('aria-label', '2 de 3');

    fireEvent.mouseLeave(screen.getByRole('region', { name: 'Destaques da loja' }));
    act(() => void vi.advanceTimersByTime(6000));
    expect(visibleSlide()).toHaveAttribute('aria-label', '3 de 3');
  });

  it('clicar no banner com link avisa o destino; sem link a imagem não é botão', async () => {
    const { onOpen } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Ver mais: banner 1' }));
    expect(onOpen).toHaveBeenCalledWith(banners[0]);

    expect(screen.queryByRole('button', { name: 'Ver mais: banner 2' })).not.toBeInTheDocument();
  });

  it('imagem que não carrega vira um fundo neutro (sem ícone quebrado)', () => {
    setup([banners[0], banners[1]]);

    fireEvent.error(screen.getByAltText('Leal: banner 1 de 2'));

    expect(screen.queryByAltText('Leal: banner 1 de 2')).not.toBeInTheDocument();
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

describe('BrandsStrip', () => {
  const brand = (id: number, name: string) => ({ id, name, logo: `https://img.test/${id}.png` });

  it('não aparece sem marcas', () => {
    const { container } = render(<BrandsStrip brands={[]} onSelect={() => {}} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('poucas marcas ficam paradas e tocar na logo escolhe a marca', async () => {
    const onSelect = vi.fn();
    render(<BrandsStrip brands={[brand(1, 'Natura'), brand(2, 'Avon')]} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ver produtos Natura' }));

    expect(onSelect).toHaveBeenCalledWith(brand(1, 'Natura'));
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('muitas marcas viram letreiro, com cópias escondidas do leitor de tela', () => {
    const brands = Array.from({ length: 6 }, (_, i) => brand(i + 1, `Marca ${i + 1}`));
    const { container } = render(<BrandsStrip brands={brands} onSelect={() => {}} />);

    // Só a primeira cópia é acessível; as outras 3 são decoração do loop.
    expect(screen.getAllByRole('button', { name: /Ver produtos/ })).toHaveLength(6);
    expect(container.querySelectorAll('ul[aria-hidden="true"]')).toHaveLength(3);
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

  describe('rodapé completo', () => {
    function setupFooter(overrides: Partial<React.ComponentProps<typeof StorefrontFooter>> = {}) {
      const props = {
        storeName: 'Leal Perfumaria',
        bio: null,
        acceptedPaymentMethods: ['pix', 'card'] as ('pix' | 'card' | 'cash')[],
        hideBranding: false,
        onShopAll: vi.fn(),
        shopLinks: [
          { label: 'Início', onClick: vi.fn() },
          { label: 'Ofertas', onClick: vi.fn() },
        ],
        categoryLinks: [{ label: 'Presentes', onClick: vi.fn() }],
        ...overrides,
      };
      render(<StorefrontFooter {...props} />);
      return props;
    }

    it('tem as colunas Loja, Categorias, Pagamento e Revendajá, e os atalhos fazem o que dizem', async () => {
      const props = setupFooter();

      for (const title of ['Loja', 'Categorias', 'Pagamento', 'Revendajá']) {
        expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
      }
      await userEvent.click(screen.getByRole('button', { name: 'Ofertas' }));
      await userEvent.click(screen.getByRole('button', { name: 'Presentes' }));
      await userEvent.click(screen.getByRole('button', { name: /Ver todos os produtos/ }));

      expect(props.shopLinks[1].onClick).toHaveBeenCalledTimes(1);
      expect(props.categoryLinks[0].onClick).toHaveBeenCalledTimes(1);
      expect(props.onShopAll).toHaveBeenCalledTimes(1);
    });

    it('coluna do Revendajá com links para a plataforma; some nos planos que escondem a marca', () => {
      const { unmount } = render(<StorefrontFooter storeName="Leal" bio={null} acceptedPaymentMethods={['pix']} hideBranding={false} />);
      expect(screen.getByRole('link', { name: 'Conheça o Revendajá' })).toHaveAttribute('href', 'https://revendaja.com');
      expect(screen.getByRole('link', { name: 'Crie a sua loja' })).toBeInTheDocument();
      unmount();

      render(<StorefrontFooter storeName="Leal" bio={null} acceptedPaymentMethods={['pix']} hideBranding />);
      expect(screen.queryByRole('heading', { name: 'Revendajá' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Revendajá|Crie a sua loja/ })).not.toBeInTheDocument();
    });

    it('sem links nem categorias, essas colunas não aparecem', () => {
      render(<StorefrontFooter storeName="Leal" bio={null} acceptedPaymentMethods={['pix']} hideBranding />);

      expect(screen.queryByRole('heading', { name: 'Loja' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Categorias' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Ver todos os produtos/ })).not.toBeInTheDocument();
    });

    it('barra de baixo: privacidade, direitos da loja e a menção ao Revendajá', () => {
      setupFooter();

      expect(screen.getByRole('link', { name: 'Política de privacidade' })).toBeInTheDocument();
      expect(screen.getByText(/© \d{4} Leal Perfumaria/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Revendajá' })).toBeInTheDocument();
    });
  });

  it('mostra a marca do Revendajá, exceto nos planos que a escondem', () => {
    const { rerender } = render(<StorefrontFooter storeName="Leal" bio={null} acceptedPaymentMethods={['pix']} hideBranding={false} />);
    expect(screen.getByRole('link', { name: 'Revendajá' })).toBeInTheDocument();

    rerender(<StorefrontFooter storeName="Leal" bio={null} acceptedPaymentMethods={['pix']} hideBranding />);
    expect(screen.queryByRole('link', { name: 'Revendajá' })).not.toBeInTheDocument();
  });
});
