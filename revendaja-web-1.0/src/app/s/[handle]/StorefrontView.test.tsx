import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_CONFIG, homeData, listPage, many, onSale, product } from '@/test/storefrontFixtures';
import type { StorefrontHome } from '@/lib/api/types';
import { StorefrontView } from './StorefrontView';

const mocks = vi.hoisted(() => ({
  getStorefront: vi.fn(),
  recordStorefrontVisit: vi.fn(),
  createStorefrontOrder: vi.fn(),
  scrollIntoView: vi.fn(),
}));

vi.mock('@/lib/api/public', () => ({
  STOREFRONT_PAGE_SIZE: 24,
  getStorefront: (handle: string, options: unknown) => mocks.getStorefront(handle, options),
  recordStorefrontVisit: (handle: string) => mocks.recordStorefrontVisit(handle),
  createStorefrontOrder: (handle: string, input: unknown) => mocks.createStorefrontOrder(handle, input),
}));

// Por padrão, uma loja com bastante produto (24 na primeira página, todos carregados).
function setup(home: StorefrontHome = homeData(), initial = listPage(many('p', 24), 24)) {
  return render(<StorefrontView initial={initial} home={home} />);
}

// A seção (região) pelo nome, para clicar dentro dela sem confundir produtos repetidos em outras seções.
const region = (name: string) => screen.getByRole('region', { name });

// Para onde o último scrollIntoView foi (o id da seção).
const lastScrolledId = () => (mocks.scrollIntoView.mock.contexts.at(-1) as HTMLElement | undefined)?.id;

describe('Vitrine (StorefrontView)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.HTMLElement.prototype.scrollIntoView = mocks.scrollIntoView;
    window.scrollTo = vi.fn();
    mocks.getStorefront.mockResolvedValue(listPage(many('r', 2), 2));
  });

  describe('o que aparece', () => {
    it('loja completa: banner, vantagens, categorias, destaques, ofertas, coleções, novidades e catálogo', () => {
      setup();

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Beleza e cuidado para o seu dia a dia');
      expect(screen.getByRole('region', { name: 'Vantagens' })).toBeInTheDocument();
      for (const name of ['Categorias', 'Produtos em destaque', 'Ofertas', 'Coleções em destaque', 'Novidades', 'Todos os produtos']) {
        expect(region(name)).toBeInTheDocument();
      }
      expect(screen.getByRole('timer')).toBeInTheDocument();
      expect(screen.getByText('Cosméticos com entrega rápida.')).toBeInTheDocument();
    });

    it('as seções vêm do estoque: cada uma mostra os produtos que a API mandou', () => {
      setup();

      expect(within(region('Produtos em destaque')).getAllByRole('article')).toHaveLength(8);
      expect(within(region('Novidades')).getAllByRole('article')).toHaveLength(4);
      expect(within(region('Ofertas')).getAllByRole('article')).toHaveLength(2);
      expect(within(region('Todos os produtos')).getAllByRole('article')).toHaveLength(24);
    });

    it('sem ofertas: não aparece a faixa de ofertas, nem o botão de ofertas do banner, nem o menu "Ofertas"', () => {
      setup(homeData({ offers: { products: [], endsAt: null } }));

      expect(screen.queryByRole('region', { name: 'Ofertas' })).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Ofertas relâmpago' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Ver ofertas' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Ofertas' })).not.toBeInTheDocument();
    });

    it('banner de ofertas desligado pela loja: some o banner, mas a lista de ofertas continua', () => {
      setup(homeData({ config: { ...DEFAULT_CONFIG, flash: { ...DEFAULT_CONFIG.flash, enabled: false } } }));

      expect(screen.queryByRole('region', { name: 'Ofertas relâmpago' })).not.toBeInTheDocument();
      expect(region('Ofertas')).toBeInTheDocument();
    });

    it('sem categorias e sem novidades: essas seções somem', () => {
      setup(homeData({ categories: [], newArrivals: [] }));

      expect(screen.queryByRole('region', { name: 'Categorias' })).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Novidades' })).not.toBeInTheDocument();
    });

    it('loja pequena (os destaques já são o catálogo todo): não repete a lista de destaques', () => {
      setup(homeData({ featured: many('f', 3), newArrivals: [] }), listPage(many('p', 3), 3));

      expect(screen.queryByRole('region', { name: 'Produtos em destaque' })).not.toBeInTheDocument();
      expect(within(region('Todos os produtos')).getAllByRole('article')).toHaveLength(3);
    });

    it('loja sem produtos: mostra o aviso e esconde as coleções', () => {
      setup(
        homeData({ featured: [], newArrivals: [], categories: [], offers: { products: [], endsAt: null } }),
        listPage([], 0),
      );

      expect(screen.getByText('Esta loja ainda não tem produtos')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Coleções em destaque' })).not.toBeInTheDocument();
    });

    it('banners personalizados: mostra os textos da loja no lugar dos padrões', () => {
      setup(
        homeData({
          config: {
            ...DEFAULT_CONFIG,
            hero: { ...DEFAULT_CONFIG.hero, title: 'Black Friday', highlight: 'só esta semana' },
            announcement: { enabled: true, text: 'Frete grátis hoje!', rightText: null },
          },
        }),
      );

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Black Friday só esta semana');
      expect(screen.getByText('Frete grátis hoje!')).toBeInTheDocument();
    });

    it('o selo "até X% off" usa a maior promoção da loja', () => {
      setup(homeData({ offers: { products: [onSale('a', 100, 90), onSale('b', 100, 55)], endsAt: null } }));

      expect(screen.getAllByText('45%').length).toBeGreaterThan(0);
    });
  });

  describe('visita', () => {
    it('conta uma visita ao abrir, e não repete na mesma sessão', () => {
      const { unmount } = setup();
      expect(mocks.recordStorefrontVisit).toHaveBeenCalledWith('lealperfumaria');
      unmount();

      setup();

      expect(mocks.recordStorefrontVisit).toHaveBeenCalledTimes(1);
    });
  });

  describe('atalhos de categoria e filtro', () => {
    it('clicar numa marca filtra a lista de produtos e leva até ela', async () => {
      setup();

      await userEvent.click(within(region('Categorias')).getByRole('button', { name: /Natura/ }));

      await waitFor(() =>
        expect(mocks.getStorefront).toHaveBeenCalledWith('lealperfumaria', expect.objectContaining({ filter: { type: 'brand', id: '1' }, page: 1 })),
      );
      expect(lastScrolledId()).toBe('produtos');
      expect(await screen.findByRole('button', { name: 'Remover filtro Natura' })).toBeInTheDocument();
      expect(within(region('Todos os produtos')).getAllByRole('article')).toHaveLength(2);
    });

    it('clicar numa categoria própria filtra por ela', async () => {
      setup();

      await userEvent.click(within(region('Categorias')).getByRole('button', { name: /Presentes/ }));

      await waitFor(() =>
        expect(mocks.getStorefront).toHaveBeenCalledWith('lealperfumaria', expect.objectContaining({ filter: { type: 'category', id: 'cat-1' } })),
      );
    });

    it('remover o filtro volta a listar tudo', async () => {
      setup();
      await userEvent.click(within(region('Categorias')).getByRole('button', { name: /Natura/ }));
      await userEvent.click(await screen.findByRole('button', { name: 'Remover filtro Natura' }));

      await waitFor(() => expect(mocks.getStorefront).toHaveBeenLastCalledWith('lealperfumaria', expect.objectContaining({ filter: null })));
      expect(screen.queryByRole('button', { name: 'Remover filtro Natura' })).not.toBeInTheDocument();
    });

    it('filtro sem resultado: mensagem de nada encontrado', async () => {
      mocks.getStorefront.mockResolvedValue(listPage([], 0));
      setup();

      await userEvent.click(within(region('Categorias')).getByRole('button', { name: /Natura/ }));

      expect(await screen.findByText('Nenhum produto encontrado')).toBeInTheDocument();
    });
  });

  describe('busca', () => {
    it('digitar no cabeçalho busca na lista (depois de uma pausa) e leva até ela', async () => {
      setup();

      await userEvent.type(screen.getByLabelText('Buscar produto'), 'kaiak');

      await waitFor(() => expect(mocks.getStorefront).toHaveBeenCalledWith('lealperfumaria', expect.objectContaining({ search: 'kaiak', page: 1 })));
      expect(lastScrolledId()).toBe('produtos');
      expect(await screen.findByText('Resultados para “kaiak”')).toBeInTheDocument();
    });

    it('erro na busca aparece na lista', async () => {
      mocks.getStorefront.mockRejectedValue(new Error('rede'));
      setup();

      await userEvent.type(screen.getByLabelText('Buscar produto'), 'x');

      expect(await screen.findByText('Algo deu errado. Tente novamente.')).toBeInTheDocument();
    });
  });

  describe('ver mais', () => {
    it('com mais produtos do que o carregado, o botão pede a próxima página', async () => {
      mocks.getStorefront.mockResolvedValue({ ...listPage(many('q', 2), 30), products: { items: many('q', 2), page: 2, pageSize: 24, total: 30 } });
      setup(homeData(), listPage(many('p', 24), 30));

      await userEvent.click(screen.getByRole('button', { name: 'Ver mais produtos' }));

      await waitFor(() => expect(mocks.getStorefront).toHaveBeenCalledWith('lealperfumaria', expect.objectContaining({ page: 2 })));
      expect(within(region('Todos os produtos')).getAllByRole('article')).toHaveLength(26);
    });

    it('sem mais produtos, o botão não aparece', () => {
      setup();

      expect(screen.queryByRole('button', { name: 'Ver mais produtos' })).not.toBeInTheDocument();
    });
  });

  describe('coleções', () => {
    it('link para uma seção que existe rola até ela', async () => {
      setup();

      await userEvent.click(screen.getByRole('button', { name: /Ver novidades/ }));

      expect(lastScrolledId()).toBe('novidades');
    });

    it('link para uma seção que não existe nesta loja leva ao catálogo (em vez de não fazer nada)', async () => {
      setup(homeData({ newArrivals: [] }));

      await userEvent.click(screen.getByRole('button', { name: /Ver novidades/ }));

      expect(lastScrolledId()).toBe('produtos');
    });

    it('link para categoria aplica o filtro', async () => {
      const config = {
        ...DEFAULT_CONFIG,
        collections: [
          { ...DEFAULT_CONFIG.collections[0], title: 'Presentes lindos', ctaLabel: 'Ver presentes', link: { type: 'category' as const, id: 'cat-1' } },
          DEFAULT_CONFIG.collections[1],
        ],
      };
      setup(homeData({ config }));

      await userEvent.click(screen.getByRole('button', { name: /Ver presentes/ }));

      await waitFor(() =>
        expect(mocks.getStorefront).toHaveBeenCalledWith('lealperfumaria', expect.objectContaining({ filter: { type: 'category', id: 'cat-1' } })),
      );
    });
  });

  describe('botões do banner', () => {
    it('"Ver produtos" vai ao catálogo e "Ver ofertas" às ofertas', async () => {
      setup();

      await userEvent.click(within(region('Destaque da loja')).getByRole('button', { name: /Ver produtos/ }));
      expect(lastScrolledId()).toBe('produtos');

      await userEvent.click(within(region('Destaque da loja')).getByRole('button', { name: 'Ver ofertas' }));
      expect(lastScrolledId()).toBe('ofertas');
    });
  });

  describe('carrinho', () => {
    it('adicionar de qualquer seção soma no carrinho do cabeçalho e guarda no aparelho', async () => {
      setup();

      await userEvent.click(within(region('Produtos em destaque')).getAllByRole('button', { name: 'Adicionar' })[0]);
      await userEvent.click(within(region('Ofertas')).getAllByRole('button', { name: 'Adicionar' })[0]);

      expect(screen.getByRole('button', { name: 'Abrir carrinho (2 itens)' })).toBeInTheDocument();
      await waitFor(() => expect(JSON.parse(window.localStorage.getItem('revendaja.cart.lealperfumaria') ?? '[]')).toHaveLength(2));
    });

    it('o mesmo produto adicionado de novo aumenta a quantidade', async () => {
      setup();
      const add = () => within(region('Produtos em destaque')).getAllByRole('button', { name: /Adicionar/ })[0];

      await userEvent.click(add());
      await userEvent.click(add());

      expect(screen.getByRole('button', { name: 'Abrir carrinho (2 itens)' })).toBeInTheDocument();
      expect(JSON.parse(window.localStorage.getItem('revendaja.cart.lealperfumaria') ?? '[]')).toHaveLength(1);
    });

    it('carrinho guardado volta ao reabrir a loja', async () => {
      window.localStorage.setItem('revendaja.cart.lealperfumaria', JSON.stringify([{ product: product('z'), quantity: 3 }]));

      setup();

      expect(await screen.findByRole('button', { name: 'Abrir carrinho (3 itens)' })).toBeInTheDocument();
    });

    it('produto esgotado não pode ser adicionado', () => {
      setup(homeData({ featured: [...many('f', 7), product('esgotado', { inStock: false })] }));

      expect(within(region('Produtos em destaque')).getByRole('button', { name: 'Esgotado' })).toBeDisabled();
    });

    it('abre o carrinho pelo ícone do cabeçalho', async () => {
      setup();
      await userEvent.click(within(region('Produtos em destaque')).getAllByRole('button', { name: 'Adicionar' })[0]);

      await userEvent.click(screen.getByRole('button', { name: 'Abrir carrinho (1 itens)' }));

      expect(await screen.findByRole('button', { name: /Finalizar|Enviar|Fazer pedido/i })).toBeInTheDocument();
    });
  });
});
