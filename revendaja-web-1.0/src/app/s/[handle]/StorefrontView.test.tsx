import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_CONFIG, homeData, listPage, many, product } from '@/test/storefrontFixtures';
import { ApiError } from '@/lib/api/errors';
import type { CouponPreview, OnlineOrderReceipt, StorefrontHome } from '@/lib/api/types';
import { StorefrontView } from './StorefrontView';

const mocks = vi.hoisted(() => ({
  getStorefront: vi.fn(),
  getStorefrontProduct: vi.fn(),
  recordStorefrontVisit: vi.fn(),
  createStorefrontOrder: vi.fn(),
  previewCoupon: vi.fn(),
  scrollIntoView: vi.fn(),
}));

vi.mock('@/lib/api/public', () => ({
  STOREFRONT_PAGE_SIZE: 24,
  getStorefront: (handle: string, options: unknown) => mocks.getStorefront(handle, options),
  getStorefrontProduct: (handle: string, id: string) => mocks.getStorefrontProduct(handle, id),
  recordStorefrontVisit: (handle: string) => mocks.recordStorefrontVisit(handle),
  createStorefrontOrder: (handle: string, input: unknown) => mocks.createStorefrontOrder(handle, input),
  previewCoupon: (handle: string, input: unknown) => mocks.previewCoupon(handle, input),
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
    mocks.getStorefrontProduct.mockImplementation(async (_handle: string, id: string) => ({ product: product(id), related: [] }));
  });

  describe('o que aparece', () => {
    it('loja completa: banner, marcas, destaques, ofertas, campanha e novidades (a lista completa não fica na home)', () => {
      setup();

      expect(screen.getByRole('region', { name: 'Destaques da loja' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Marcas' })).toBeInTheDocument();
      for (const name of ['Produtos em destaque', 'Ofertas', 'Campanha em destaque', 'Novidades']) {
        expect(region(name)).toBeInTheDocument();
      }
      expect(screen.queryByRole('region', { name: 'Todos os produtos' })).not.toBeInTheDocument();
      expect(screen.getByText('Cosméticos com entrega rápida.')).toBeInTheDocument();
    });

    it('as seções vêm do estoque: cada uma mostra os produtos que a API mandou', () => {
      setup();

      expect(within(region('Produtos em destaque')).getAllByRole('article')).toHaveLength(8);
      expect(within(region('Novidades')).getAllByRole('article')).toHaveLength(4);
      expect(within(region('Ofertas')).getAllByRole('article')).toHaveLength(2);
      expect(screen.queryByRole('region', { name: 'Todos os produtos' })).not.toBeInTheDocument();
    });

    it('sem ofertas: não aparece a faixa de ofertas, nem o menu "Ofertas"', () => {
      setup(homeData({ offers: { products: [], endsAt: null } }));

      expect(screen.queryByRole('region', { name: 'Ofertas' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Ofertas' })).not.toBeInTheDocument();
    });

    it('não mostra o banner "Ofertas relâmpago": só a lista de ofertas', () => {
      setup();

      expect(screen.queryByRole('region', { name: 'Ofertas relâmpago' })).not.toBeInTheDocument();
      expect(screen.queryByRole('timer')).not.toBeInTheDocument();
      expect(region('Ofertas')).toBeInTheDocument();
    });

    it('sem marcas e sem novidades: essas seções somem', () => {
      setup(homeData({ brands: [], newArrivals: [] }));

      expect(screen.queryByRole('region', { name: 'Marcas' })).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Novidades' })).not.toBeInTheDocument();
    });

    it('loja pequena: os destaques aparecem na home mesmo com poucos produtos', () => {
      setup(homeData({ featured: many('f', 3), newArrivals: [] }), listPage(many('p', 3), 3));

      expect(within(region('Produtos em destaque')).getAllByRole('article')).toHaveLength(3);
      expect(screen.queryByRole('region', { name: 'Todos os produtos' })).not.toBeInTheDocument();
    });

    it('"Ver todos os produtos" abre a página com a lista completa', async () => {
      setup();

      await userEvent.click(within(region('Produtos em destaque')).getByRole('button', { name: /Ver todos os produtos/ }));

      expect(screen.getByRole('heading', { name: 'Todos os produtos' })).toBeInTheDocument();
      expect(within(region('Resultados da busca')).getAllByRole('article')).toHaveLength(24);
      expect(screen.queryByRole('region', { name: 'Produtos em destaque' })).not.toBeInTheDocument();
    });

    it('clicar na logo volta para a home da loja (limpa busca, filtro e lista completa)', async () => {
      setup();
      await userEvent.click(within(region('Marcas')).getByRole('button', { name: 'Ver produtos Natura' }));
      await screen.findByRole('button', { name: 'Remover filtro Natura' });

      await userEvent.click(screen.getByRole('button', { name: /ir para o início da loja/ }));

      expect(screen.queryByRole('region', { name: 'Resultados da busca' })).not.toBeInTheDocument();
      expect(region('Produtos em destaque')).toBeInTheDocument();
      expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0 });
    });

    it('loja sem produtos: mostra o aviso e esconde as coleções', () => {
      setup(
        homeData({ featured: [], newArrivals: [], categories: [], offers: { products: [], endsAt: null } }),
        listPage([], 0),
      );

      expect(screen.getByText('Esta loja ainda não tem produtos')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Campanha em destaque' })).not.toBeInTheDocument();
    });

    it('banners e aviso personalizados: mostra os da loja no lugar dos padrões', () => {
      setup(
        homeData({
          config: {
            ...DEFAULT_CONFIG,
            banners: [{ imageUrl: 'https://img.test/black-friday.jpg', link: null }],
            announcement: { enabled: true, text: 'Frete grátis hoje!', rightText: null },
          },
        }),
      );

      expect(screen.getByAltText('Leal Perfumaria: banner 1 de 1')).toHaveAttribute('src', 'https://img.test/black-friday.jpg');
      expect(screen.getByText('Frete grátis hoje!')).toBeInTheDocument();
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

  describe('marcas e filtro', () => {
    it('clicar numa marca abre a página de resultados da marca (a home some)', async () => {
      setup();

      await userEvent.click(within(region('Marcas')).getByRole('button', { name: 'Ver produtos Natura' }));

      await waitFor(() =>
        expect(mocks.getStorefront).toHaveBeenCalledWith('lealperfumaria', expect.objectContaining({ filter: { type: 'brand', id: '1' }, page: 1 })),
      );
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
      expect(await screen.findByRole('button', { name: 'Remover filtro Natura' })).toBeInTheDocument();
      expect(within(region('Resultados da busca')).getAllByRole('article')).toHaveLength(2);
      expect(screen.getByRole('heading', { name: 'Natura' })).toBeInTheDocument();
      // Página de resultados: sem banner, marcas, destaques, ofertas nem novidades.
      for (const name of ['Marcas', 'Produtos em destaque', 'Ofertas', 'Novidades', 'Destaques da loja']) {
        expect(screen.queryByRole('region', { name })).not.toBeInTheDocument();
      }
    });

    it('remover o filtro volta a listar tudo', async () => {
      setup();
      await userEvent.click(within(region('Marcas')).getByRole('button', { name: 'Ver produtos Natura' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Remover filtro Natura' }));

      await waitFor(() => expect(mocks.getStorefront).toHaveBeenLastCalledWith('lealperfumaria', expect.objectContaining({ filter: null })));
      expect(screen.queryByRole('button', { name: 'Remover filtro Natura' })).not.toBeInTheDocument();
    });

    it('filtro sem resultado: mensagem de nada encontrado', async () => {
      mocks.getStorefront.mockResolvedValue(listPage([], 0));
      setup();

      await userEvent.click(within(region('Marcas')).getByRole('button', { name: 'Ver produtos Natura' }));

      expect(await screen.findByText('Nenhum produto encontrado')).toBeInTheDocument();
    });
  });

  describe('busca', () => {
    const searchBox = () => screen.getByLabelText('Buscar produto');
    const searchFor = async (term: string) => {
      await userEvent.clear(searchBox());
      await userEvent.type(searchBox(), `${term}{Enter}`);
    };
    const savedSearches = () => JSON.parse(window.localStorage.getItem('revendaja.searches.lealperfumaria') ?? '[]') as string[];

    it('digitar não consulta o servidor: só o Enter abre a página de resultados, no lugar da home', async () => {
      setup();

      await userEvent.type(searchBox(), 'kaiak');
      expect(mocks.getStorefront).not.toHaveBeenCalled();
      expect(screen.queryByRole('region', { name: 'Resultados da busca' })).not.toBeInTheDocument();
      expect(region('Produtos em destaque')).toBeInTheDocument();

      await userEvent.keyboard('{Enter}');

      await waitFor(() => expect(mocks.getStorefront).toHaveBeenCalledWith('lealperfumaria', expect.objectContaining({ search: 'kaiak', page: 1 })));
      expect(mocks.getStorefront).toHaveBeenCalledTimes(1);
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
      expect(await screen.findByRole('heading', { name: 'Resultados para “kaiak”' })).toBeInTheDocument();
      expect(within(region('Resultados da busca')).getAllByRole('article')).toHaveLength(2);
      expect(screen.queryByRole('region', { name: 'Produtos em destaque' })).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Destaques da loja' })).not.toBeInTheDocument();
    });

    it('busca com menos de 2 letras não faz nada', async () => {
      setup();

      await searchFor('k');

      expect(mocks.getStorefront).not.toHaveBeenCalled();
      expect(screen.queryByRole('region', { name: 'Resultados da busca' })).not.toBeInTheDocument();
      expect(savedSearches()).toEqual([]);
    });

    it('"Voltar para a loja" limpa a busca e traz a home de volta', async () => {
      setup();
      await searchFor('kaiak');
      await screen.findByRole('heading', { name: 'Resultados para “kaiak”' });

      await userEvent.click(screen.getByRole('button', { name: /Voltar para a loja/ }));

      expect(searchBox()).toHaveValue('');
      expect(region('Produtos em destaque')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Resultados da busca' })).not.toBeInTheDocument();
    });

    it('sem resultado: avisa e oferece ver todos os produtos', async () => {
      mocks.getStorefront.mockResolvedValue(listPage([], 0));
      setup();
      await searchFor('zzz');

      expect(await screen.findByText('Nenhum produto encontrado')).toBeInTheDocument();
      await userEvent.click(within(region('Resultados da busca')).getByRole('button', { name: 'Ver todos os produtos' }));

      expect(region('Produtos em destaque')).toBeInTheDocument();
    });

    it('erro na busca aparece na lista', async () => {
      mocks.getStorefront.mockRejectedValue(new Error('rede'));
      setup();

      await searchFor('xx');

      expect(await screen.findByText('Algo deu errado. Tente novamente.')).toBeInTheDocument();
    });

    it('a partir da página de resultados, "Ofertas" do menu volta para a home e rola até a seção', async () => {
      setup();
      await searchFor('kaiak');
      await screen.findByRole('heading', { name: 'Resultados para “kaiak”' });

      await userEvent.click(screen.getAllByRole('button', { name: 'Ofertas' })[0]);

      expect(region('Ofertas')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Resultados da busca' })).not.toBeInTheDocument();
      await waitFor(() => expect(lastScrolledId()).toBe('ofertas'));
    });

    it('uma busca nova não carrega o filtro de marca de antes', async () => {
      setup();
      await userEvent.click(within(region('Marcas')).getByRole('button', { name: 'Ver produtos Natura' }));
      await screen.findByRole('button', { name: 'Remover filtro Natura' });

      await searchFor('kaiak');

      await waitFor(() =>
        expect(mocks.getStorefront).toHaveBeenLastCalledWith('lealperfumaria', expect.objectContaining({ search: 'kaiak', filter: null })),
      );
      expect(screen.queryByRole('button', { name: 'Remover filtro Natura' })).not.toBeInTheDocument();
    });

    describe('histórico', () => {
      it('guarda as buscas feitas, a mais recente primeiro, sem repetir', async () => {
        setup();

        await searchFor('kaiak');
        await searchFor('malbec');
        await searchFor('KAIAK');

        await waitFor(() => expect(savedSearches()).toEqual(['KAIAK', 'malbec']));
      });

      it('guarda só as 5 últimas buscas', async () => {
        setup();

        for (const term of ['aa1', 'bb2', 'cc3', 'dd4', 'ee5', 'ff6']) {
          await searchFor(term);
        }

        await waitFor(() => expect(savedSearches()).toEqual(['ff6', 'ee5', 'dd4', 'cc3', 'bb2']));
      });

      it('ao focar a busca mostra o histórico; clicar numa busca recente roda ela', async () => {
        window.localStorage.setItem('revendaja.searches.lealperfumaria', JSON.stringify(['malbec', 'kaiak']));
        setup();

        await userEvent.click(searchBox());
        expect(screen.getAllByRole('option').map((item) => item.textContent)).toEqual(['malbec', 'kaiak']);
        await userEvent.click(screen.getByRole('option', { name: 'kaiak' }));

        await waitFor(() => expect(mocks.getStorefront).toHaveBeenCalledWith('lealperfumaria', expect.objectContaining({ search: 'kaiak' })));
        expect(await screen.findByRole('heading', { name: 'Resultados para “kaiak”' })).toBeInTheDocument();
        // a busca repetida sobe para o topo do histórico
        await waitFor(() => expect(savedSearches()).toEqual(['kaiak', 'malbec']));
      });

      it('remove uma busca do histórico e limpa tudo', async () => {
        window.localStorage.setItem('revendaja.searches.lealperfumaria', JSON.stringify(['malbec', 'kaiak']));
        setup();
        await userEvent.click(searchBox());

        await userEvent.click(screen.getByRole('button', { name: 'Remover malbec do histórico' }));
        await waitFor(() => expect(savedSearches()).toEqual(['kaiak']));

        await userEvent.click(screen.getByRole('button', { name: 'Limpar histórico' }));
        await waitFor(() => expect(savedSearches()).toEqual([]));
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });

      it('o histórico é de cada loja', async () => {
        window.localStorage.setItem('revendaja.searches.outraloja', JSON.stringify(['perfume alheio']));
        setup();

        await userEvent.click(searchBox());

        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  describe('ver mais', () => {
    it('com mais produtos do que o carregado, o botão pede a próxima página', async () => {
      mocks.getStorefront.mockResolvedValue({ ...listPage(many('q', 2), 30), products: { items: many('q', 2), page: 2, pageSize: 24, total: 30 } });
      setup(homeData(), listPage(many('p', 24), 30));

      await userEvent.click(within(region('Produtos em destaque')).getByRole('button', { name: /Ver todos os produtos/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Ver mais produtos' }));

      await waitFor(() => expect(mocks.getStorefront).toHaveBeenCalledWith('lealperfumaria', expect.objectContaining({ page: 2 })));
      expect(within(region('Resultados da busca')).getAllByRole('article')).toHaveLength(26);
    });

    it('sem mais produtos, o botão não aparece', () => {
      setup();

      expect(screen.queryByRole('button', { name: 'Ver mais produtos' })).not.toBeInTheDocument();
    });
  });

  describe('banner de campanha', () => {
    it('clicar abre a página com todos os produtos', async () => {
      setup();

      await userEvent.click(within(region('Campanha em destaque')).getByRole('button', { name: /campanha Natura Essencial/ }));

      expect(screen.getByRole('heading', { name: 'Todos os produtos' })).toBeInTheDocument();
    });

    it('link do banner do topo para uma categoria aplica o filtro', async () => {
      const config = {
        ...DEFAULT_CONFIG,
        banners: [{ ...DEFAULT_CONFIG.banners[0], link: { type: 'category' as const, id: 'cat-1' } }, ...DEFAULT_CONFIG.banners.slice(1)],
      };
      setup(homeData({ config }));

      await userEvent.click(within(region('Destaques da loja')).getByRole('button', { name: 'Ver mais: banner 1' }));

      await waitFor(() =>
        expect(mocks.getStorefront).toHaveBeenCalledWith('lealperfumaria', expect.objectContaining({ filter: { type: 'category', id: 'cat-1' } })),
      );
    });
  });

  describe('cliques nos banners', () => {
    it('banner com link leva à seção (ofertas) e o sem link não faz nada', async () => {
      setup();

      await userEvent.click(within(region('Destaques da loja')).getByRole('button', { name: 'Ver mais: banner 1' }));
      expect(lastScrolledId()).toBe('ofertas');

      // O terceiro banner do exemplo não tem link: não é botão.
      expect(within(region('Destaques da loja')).queryByRole('button', { name: 'Ver mais: banner 3' })).not.toBeInTheDocument();
    });

    it('banner que aponta para uma seção que a loja não tem abre todos os produtos', async () => {
      setup(homeData({ offers: { products: [], endsAt: null } }));

      await userEvent.click(within(region('Destaques da loja')).getByRole('button', { name: 'Ver mais: banner 1' }));

      expect(screen.getByRole('heading', { name: 'Todos os produtos' })).toBeInTheDocument();
    });
  });

  describe('carrinho', () => {
    // O cartão não tem botão de adicionar: o cliente abre o produto e adiciona pela página de detalhes.
    async function addFrom(sectionName: string, index = 0) {
      const open = within(region(sectionName)).getAllByRole('button', { name: /^Ver detalhes:/ })[index];
      await userEvent.click(open);
      await userEvent.click(await screen.findByRole('button', { name: /Adicionar ao carrinho|Adicionar mais/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    }

    it('o cartão do produto não tem botão de adicionar', () => {
      setup();

      expect(within(region('Produtos em destaque')).queryByRole('button', { name: /^Adicionar/ })).not.toBeInTheDocument();
    });

    it('adicionar pela página do produto soma no carrinho do cabeçalho e guarda no aparelho', async () => {
      setup();

      await addFrom('Produtos em destaque');
      await addFrom('Ofertas');

      expect(screen.getByRole('button', { name: 'Abrir carrinho (2 itens)' })).toBeInTheDocument();
      await waitFor(() => expect(JSON.parse(window.localStorage.getItem('revendaja.cart.lealperfumaria') ?? '[]')).toHaveLength(2));
    });

    it('o mesmo produto adicionado de novo aumenta a quantidade', async () => {
      setup();

      await addFrom('Produtos em destaque');
      await addFrom('Produtos em destaque');

      expect(screen.getByRole('button', { name: 'Abrir carrinho (2 itens)' })).toBeInTheDocument();
      expect(JSON.parse(window.localStorage.getItem('revendaja.cart.lealperfumaria') ?? '[]')).toHaveLength(1);
    });

    it('carrinho guardado volta ao reabrir a loja', async () => {
      window.localStorage.setItem('revendaja.cart.lealperfumaria', JSON.stringify([{ product: product('z'), quantity: 3 }]));

      setup();

      expect(await screen.findByRole('button', { name: 'Abrir carrinho (3 itens)' })).toBeInTheDocument();
    });

    it('produto esgotado aparece com o aviso no cartão', () => {
      setup(homeData({ featured: [...many('f', 7), product('esgotado', { inStock: false })] }));

      expect(within(region('Produtos em destaque')).getByText('Esgotado')).toBeInTheDocument();
    });

    describe('cupom de desconto', () => {
      const preview = (overrides: Partial<CouponPreview> = {}): CouponPreview => ({
        code: 'VERAO10',
        type: 'percent',
        value: 10,
        subtotal: 55,
        discount: 5.5,
        total: 49.5,
        ...overrides,
      });

      function receipt(overrides: Partial<OnlineOrderReceipt> = {}): OnlineOrderReceipt {
        return {
          number: 12,
          status: 'pending',
          total: 49.5,
          paymentMethod: 'pix',
          installments: null,
          customerName: 'Bia Lima',
          fulfillment: 'pickup',
          deliveryAddress: null,
          cashChangeFor: null,
          discount: 5.5,
          couponCode: 'VERAO10',
          createdAt: '2026-11-16T12:00:00.000Z',
          expiresAt: '2026-11-18T12:00:00.000Z',
          items: [{ productName: 'Produto', quantity: 1, unitPrice: 55, subtotal: 55 }],
          ...overrides,
        };
      }

      const cart = () => screen.getByRole('dialog', { name: 'Carrinho' });

      async function openCart() {
        setup();
        await addFrom('Produtos em destaque');
        await userEvent.click(screen.getByRole('button', { name: 'Abrir carrinho (1 itens)' }));
        return within(cart());
      }

      async function applyCode(view: ReturnType<typeof within>, code: string) {
        await userEvent.type(view.getByLabelText('Código do cupom'), code);
        await userEvent.click(view.getByRole('button', { name: 'Aplicar' }));
      }

      it('aplica o cupom: o servidor calcula, e o carrinho mostra subtotal, desconto e total', async () => {
        mocks.previewCoupon.mockResolvedValue(preview());
        const view = await openCart();

        await applyCode(view, 'verao10');

        expect(await view.findByText('Subtotal')).toBeInTheDocument();
        expect(mocks.previewCoupon).toHaveBeenCalledWith(
          'lealperfumaria',
          expect.objectContaining({ code: 'VERAO10', items: [expect.objectContaining({ quantity: 1 })] }),
        );
        expect(view.getByText('Cupom VERAO10')).toBeInTheDocument();
        expect(view.getAllByText(/R\$\s?5,50/).length).toBeGreaterThan(0);
        expect(view.getByText(/R\$\s?49,50/)).toBeInTheDocument();
        // o campo some, dando lugar ao cupom aplicado
        expect(view.queryByLabelText('Código do cupom')).not.toBeInTheDocument();
      });

      it('Enter no campo aplica o cupom (não envia o pedido)', async () => {
        mocks.previewCoupon.mockResolvedValue(preview());
        const view = await openCart();

        await userEvent.type(view.getByLabelText('Código do cupom'), 'verao10{Enter}');

        expect(await view.findByText('Subtotal')).toBeInTheDocument();
        expect(mocks.createStorefrontOrder).not.toHaveBeenCalled();
      });

      it('cupom recusado: mostra o motivo e não aplica nada', async () => {
        mocks.previewCoupon.mockRejectedValue(new ApiError(400, 'COUPON_INVALID', 'Cupom inválido ou expirado.'));
        const view = await openCart();

        await applyCode(view, 'NAOEXISTE');

        expect(await view.findByRole('alert')).toHaveTextContent('Cupom inválido ou expirado.');
        expect(view.queryByText('Subtotal')).not.toBeInTheDocument();
        expect(view.getByLabelText('Código do cupom')).toBeInTheDocument();
      });

      it('remover o cupom volta ao total sem desconto', async () => {
        mocks.previewCoupon.mockResolvedValue(preview());
        const view = await openCart();
        await applyCode(view, 'VERAO10');
        await view.findByText('Subtotal');

        await userEvent.click(view.getByRole('button', { name: 'Remover cupom VERAO10' }));

        expect(view.queryByText('Subtotal')).not.toBeInTheDocument();
        expect(view.getByLabelText('Código do cupom')).toBeInTheDocument();
      });

      it('mudou a quantidade com cupom aplicado: confere de novo com o carrinho novo', async () => {
        mocks.previewCoupon.mockResolvedValue(preview());
        const view = await openCart();
        await applyCode(view, 'VERAO10');
        await view.findByText('Subtotal');
        mocks.previewCoupon.mockClear();
        mocks.previewCoupon.mockResolvedValue(preview({ subtotal: 110, discount: 11, total: 99 }));

        await userEvent.click(view.getAllByRole('button', { name: /^Aumentar/ })[0]);

        await waitFor(() =>
          expect(mocks.previewCoupon).toHaveBeenCalledWith(
            'lealperfumaria',
            expect.objectContaining({ code: 'VERAO10', items: [expect.objectContaining({ quantity: 2 })] }),
          ),
        );
        expect(await view.findByText(/R\$\s?99,00/)).toBeInTheDocument();
      });

      it('se a nova conferência recusar o cupom (ex.: abaixo do mínimo), ele sai e o motivo aparece', async () => {
        mocks.previewCoupon.mockResolvedValue(preview());
        const view = await openCart();
        await applyCode(view, 'VERAO10');
        await view.findByText('Subtotal');
        // sobe para 2 unidades (confere de novo e segue valendo) e depois volta para 1, já abaixo do mínimo
        mocks.previewCoupon.mockResolvedValue(preview({ subtotal: 110, discount: 11, total: 99 }));
        await userEvent.click(view.getAllByRole('button', { name: /^Aumentar/ })[0]);
        await view.findByText(/R\$\s?99,00/);
        mocks.previewCoupon.mockRejectedValue(new ApiError(400, 'COUPON_INVALID', 'Este cupom vale para pedidos a partir de R$ 100,00.'));

        await userEvent.click(view.getAllByRole('button', { name: /^Diminuir/ })[0]);

        expect(await view.findByText(/a partir de R\$\s?100,00/)).toBeInTheDocument();
        expect(view.queryByText('Subtotal')).not.toBeInTheDocument();
      });

      it('finalizar com cupom manda o código no pedido e o comprovante mostra o desconto', async () => {
        mocks.previewCoupon.mockResolvedValue(preview());
        mocks.createStorefrontOrder.mockResolvedValue(receipt());
        const view = await openCart();
        await applyCode(view, 'VERAO10');
        await view.findByText('Subtotal');

        await userEvent.type(view.getByLabelText('Seu nome'), 'Bia Lima');
        await userEvent.type(view.getByLabelText(/Seu WhatsApp/), '11987654321');
        await userEvent.click(view.getByRole('button', { name: 'Finalizar pedido' }));

        await waitFor(() => expect(mocks.createStorefrontOrder).toHaveBeenCalledTimes(1));
        expect(mocks.createStorefrontOrder.mock.calls[0][1]).toMatchObject({ couponCode: 'VERAO10' });
        const dialog = await screen.findByRole('dialog', { name: 'Pedido enviado' });
        expect(within(dialog).getByText('Cupom VERAO10')).toBeInTheDocument();
        expect(within(dialog).getByText(/−R\$\s?5,50/)).toBeInTheDocument();
      });

      it('sem cupom, o pedido não manda couponCode', async () => {
        mocks.createStorefrontOrder.mockResolvedValue(receipt({ discount: 0, couponCode: null, total: 55 }));
        const view = await openCart();

        await userEvent.type(view.getByLabelText('Seu nome'), 'Bia Lima');
        await userEvent.type(view.getByLabelText(/Seu WhatsApp/), '11987654321');
        await userEvent.click(view.getByRole('button', { name: 'Finalizar pedido' }));

        await waitFor(() => expect(mocks.createStorefrontOrder).toHaveBeenCalledTimes(1));
        expect(mocks.createStorefrontOrder.mock.calls[0][1]).not.toHaveProperty('couponCode');
        const dialog = await screen.findByRole('dialog', { name: 'Pedido enviado' });
        expect(within(dialog).queryByText(/^Cupom/)).not.toBeInTheDocument();
      });

      it('o servidor recusa o cupom ao gravar (ex.: esgotou): o cupom sai e o erro aparece', async () => {
        mocks.previewCoupon.mockResolvedValue(preview());
        mocks.createStorefrontOrder.mockRejectedValue(new ApiError(400, 'COUPON_INVALID', 'Este cupom já atingiu o limite de usos.'));
        const view = await openCart();
        await applyCode(view, 'VERAO10');
        await view.findByText('Subtotal');

        await userEvent.type(view.getByLabelText('Seu nome'), 'Bia Lima');
        await userEvent.type(view.getByLabelText(/Seu WhatsApp/), '11987654321');
        await userEvent.click(view.getByRole('button', { name: 'Finalizar pedido' }));

        expect(await view.findByText('Este cupom já atingiu o limite de usos.')).toBeInTheDocument();
        expect(view.queryByText('Subtotal')).not.toBeInTheDocument();
        expect(view.getByLabelText('Código do cupom')).toBeInTheDocument();
      });
    });

    it('abre o carrinho pelo ícone do cabeçalho', async () => {
      setup();
      await addFrom('Produtos em destaque');

      await userEvent.click(screen.getByRole('button', { name: 'Abrir carrinho (1 itens)' }));

      expect(await screen.findByRole('button', { name: /Finalizar|Enviar|Fazer pedido/i })).toBeInTheDocument();
    });
  });
});
