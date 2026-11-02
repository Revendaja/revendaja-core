import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test/utils';
import { DEFAULT_CONFIG } from '@/test/storefrontFixtures';
import { ApiError } from '@/lib/api/errors';
import type { StorefrontConfig, StorefrontCustomization, StorefrontSection } from '@/lib/api/types';
import type { StorefrontConfigChanges } from '@/lib/api/storefrontConfig';
import StorefrontAppearancePage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
  categories: vi.fn(),
}));

vi.mock('@/lib/api/storefrontConfig', () => ({
  getStorefrontCustomization: () => mocks.get(),
  updateStorefrontCustomization: (changes: unknown) => mocks.update(changes),
  uploadBannerImage: (file: File) => mocks.upload(file),
}));
vi.mock('@/lib/api/storeCategories', () => ({ listStoreCategories: () => mocks.categories() }));
vi.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ store: { id: 's1', handle: 'lealperfumaria' } }) }));

const SECTIONS: StorefrontSection[] = ['announcement', 'banners', 'hero', 'benefits', 'flash', 'collections'];
const ANNOUNCEMENT_TEXT = DEFAULT_CONFIG.announcement.text;

function customization(customized: StorefrontSection[] = [], config: StorefrontConfig = DEFAULT_CONFIG): StorefrontCustomization {
  return {
    config,
    defaults: DEFAULT_CONFIG,
    customized: Object.fromEntries(SECTIONS.map((section) => [section, customized.includes(section)])) as Record<StorefrontSection, boolean>,
  };
}

// O servidor devolve o estado novo depois de cada gravação: o mock faz o mesmo.
function serverState(initial: StorefrontCustomization) {
  let state = initial;
  mocks.get.mockImplementation(async () => state);
  mocks.update.mockImplementation(async (changes: StorefrontConfigChanges) => {
    const config = { ...state.config } as Record<string, unknown>;
    const flags = { ...state.customized };
    for (const section of SECTIONS) {
      if (!(section in changes)) continue;
      const value = changes[section];
      config[section] = value === null ? DEFAULT_CONFIG[section] : value;
      flags[section] = value !== null;
    }
    state = { ...state, config: config as StorefrontConfig, customized: flags };
    return state;
  });
}

// O cartão (seção) do editor pelo título.
function card(title: string) {
  return screen.getByRole('heading', { name: title }).closest('section') as HTMLElement;
}

async function renderLoaded() {
  renderWithQuery(<StorefrontAppearancePage />);
  await screen.findByRole('heading', { name: 'Barra de aviso' });
}

const saveButton = (title: string) => within(card(title)).getByRole('button', { name: /^Salv/ });
const resetButton = (title: string) => within(card(title)).getByRole('button', { name: /Restaurar|Restaurando/ });

describe('Aparência da vitrine (editor)', () => {
  beforeEach(() => {
    serverState(customization());
    mocks.categories.mockResolvedValue({ items: [{ id: 'cat-1', name: 'Presentes', productCount: 4 }] });
  });

  it('mostra as 5 seções, todas no padrão, e o link para ver a vitrine', async () => {
    await renderLoaded();

    for (const title of ['Barra de aviso', 'Banners do topo', 'Vantagens', 'Ofertas relâmpago', 'Coleções em destaque']) {
      expect(within(card(title)).getByText('Padrão')).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /Ver minha vitrine/ })).toHaveAttribute('href', expect.stringContaining('lealperfumaria'));
  });

  it('preenche os campos com o que vale hoje (o padrão)', async () => {
    await renderLoaded();

    expect(screen.getByLabelText('Texto da barra de aviso')).toHaveValue(ANNOUNCEMENT_TEXT);
    expect(screen.getByLabelText('Destino do banner 1')).toHaveValue('section:offers');
    expect(screen.getByLabelText('Destino do banner 3')).toHaveValue('none');
  });

  it('mostra o erro ao carregar e deixa tentar de novo', async () => {
    mocks.get.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'Erro no servidor. Tente novamente em instantes.'));
    renderWithQuery(<StorefrontAppearancePage />);

    expect(await screen.findByText('Erro no servidor. Tente novamente em instantes.')).toBeInTheDocument();
    mocks.get.mockResolvedValue(customization());
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByRole('heading', { name: 'Barra de aviso' })).toBeInTheDocument();
  });

  describe('salvar uma seção', () => {
    it('Salvar começa desabilitado e só habilita depois de uma mudança', async () => {
      await renderLoaded();
      expect(saveButton('Barra de aviso')).toBeDisabled();

      await userEvent.type(screen.getByLabelText('Texto da barra de aviso'), '!');

      expect(saveButton('Barra de aviso')).toBeEnabled();
    });

    it('grava só a seção alterada e passa a mostrá-la como "Personalizado"', async () => {
      await renderLoaded();
      const title = screen.getByLabelText('Texto da barra de aviso');

      await userEvent.clear(title);
      await userEvent.type(title, 'Black Friday');
      await userEvent.click(saveButton('Barra de aviso'));

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      expect(mocks.update).toHaveBeenCalledWith({ announcement: { ...DEFAULT_CONFIG.announcement, text: 'Black Friday' } });
      expect(await within(card('Barra de aviso')).findByText('Alterações salvas.')).toBeInTheDocument();
      expect(within(card('Barra de aviso')).getByText('Personalizado')).toBeInTheDocument();
      // As outras seções continuam no padrão.
      expect(within(card('Vantagens')).getByText('Padrão')).toBeInTheDocument();
      expect(saveButton('Barra de aviso')).toBeDisabled();
    });

    it('campo obrigatório vazio bloqueia o Salvar', async () => {
      await renderLoaded();

      await userEvent.clear(screen.getByLabelText('Texto da barra de aviso'));

      expect(saveButton('Barra de aviso')).toBeDisabled();
    });

    it('só espaços também conta como vazio', async () => {
      await renderLoaded();
      const title = screen.getByLabelText('Texto da barra de aviso');

      await userEvent.clear(title);
      await userEvent.type(title, '   ');

      expect(saveButton('Barra de aviso')).toBeDisabled();
    });

    it('respeita o limite de caracteres do campo', async () => {
      await renderLoaded();

      expect(screen.getByLabelText('Texto da barra de aviso')).toHaveAttribute('maxLength', '120');
      expect(screen.getByLabelText('Texto do canto direito')).toHaveAttribute('maxLength', '80');
    });

    it('erro do servidor aparece na própria seção e o rascunho fica', async () => {
      await renderLoaded();
      mocks.update.mockRejectedValueOnce(new ApiError(400, 'VALIDATION_ERROR', 'Dados inválidos.'));

      await userEvent.type(screen.getByLabelText('Texto da barra de aviso'), '!');
      await userEvent.click(saveButton('Barra de aviso'));

      expect(await within(card('Barra de aviso')).findByRole('alert')).toBeInTheDocument();
      expect(screen.getByLabelText('Texto da barra de aviso')).toHaveValue(`${ANNOUNCEMENT_TEXT}!`);
      expect(saveButton('Barra de aviso')).toBeEnabled();
    });
  });

  describe('restaurar o padrão', () => {
    const custom = { ...DEFAULT_CONFIG, announcement: { ...DEFAULT_CONFIG.announcement, text: 'Meu título' } };

    it('desabilitado enquanto a seção está no padrão', async () => {
      await renderLoaded();

      expect(resetButton('Barra de aviso')).toBeDisabled();
    });

    it('apaga a personalização, volta os campos ao padrão e avisa', async () => {
      serverState(customization(['announcement'], custom));
      await renderLoaded();
      expect(screen.getByLabelText('Texto da barra de aviso')).toHaveValue('Meu título');

      await userEvent.click(resetButton('Barra de aviso'));

      await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ announcement: null }));
      await waitFor(() => expect(screen.getByLabelText('Texto da barra de aviso')).toHaveValue(ANNOUNCEMENT_TEXT));
      expect(within(card('Barra de aviso')).getByText('Padrão')).toBeInTheDocument();
      expect(resetButton('Barra de aviso')).toBeDisabled();
    });

    it('restaura só a seção escolhida', async () => {
      serverState(customization(['announcement', 'flash'], custom));
      await renderLoaded();

      await userEvent.click(resetButton('Barra de aviso'));

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      expect(mocks.update).toHaveBeenCalledWith({ announcement: null });
      expect(within(card('Ofertas relâmpago')).getByText('Personalizado')).toBeInTheDocument();
    });
  });

  describe('barra de aviso', () => {
    it('desligar a barra desabilita os textos, e o canto direito vazio vira null', async () => {
      await renderLoaded();
      const bar = within(card('Barra de aviso'));

      await userEvent.type(screen.getByLabelText('Texto do canto direito'), 'Entrega grátis');
      await userEvent.click(bar.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => expect(mocks.update).toHaveBeenLastCalledWith({ announcement: { ...DEFAULT_CONFIG.announcement, rightText: 'Entrega grátis' } }));

      await userEvent.clear(screen.getByLabelText('Texto do canto direito'));
      await userEvent.click(bar.getByRole('switch', { name: 'Mostrar a barra' }));

      expect(screen.getByLabelText('Texto da barra de aviso')).toBeDisabled();
      await userEvent.click(bar.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => expect(mocks.update).toHaveBeenLastCalledWith({ announcement: { ...DEFAULT_CONFIG.announcement, enabled: false, rightText: null } }));
    });

    it('barra desligada pode ser salva mesmo com o texto vazio', async () => {
      await renderLoaded();

      await userEvent.clear(screen.getByLabelText('Texto da barra de aviso'));
      expect(saveButton('Barra de aviso')).toBeDisabled();
      await userEvent.click(within(card('Barra de aviso')).getByRole('switch', { name: 'Mostrar a barra' }));

      expect(saveButton('Barra de aviso')).toBeEnabled();
    });
  });

  describe('vantagens', () => {
    it('edita ícone, título e texto de um dos 4 itens', async () => {
      await renderLoaded();

      await userEvent.selectOptions(screen.getByLabelText('Ícone da vantagem 2'), 'gift');
      const title = screen.getByLabelText('Título da vantagem 2');
      await userEvent.clear(title);
      await userEvent.type(title, 'Embrulho grátis');
      await userEvent.click(saveButton('Vantagens'));

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      const sent = mocks.update.mock.calls[0][0].benefits;
      expect(sent).toHaveLength(4);
      expect(sent[1]).toEqual({ icon: 'gift', title: 'Embrulho grátis', text: 'Pix, cartão ou dinheiro' });
      expect(sent[0]).toEqual(DEFAULT_CONFIG.benefits[0]);
    });

    it('item com texto vazio bloqueia o Salvar', async () => {
      await renderLoaded();

      await userEvent.clear(screen.getByLabelText('Texto da vantagem 3'));

      expect(saveButton('Vantagens')).toBeDisabled();
    });
  });

  describe('ofertas relâmpago', () => {
    it('desligar o banner desabilita os campos e grava enabled = false', async () => {
      await renderLoaded();

      await userEvent.click(within(card('Ofertas relâmpago')).getByRole('switch', { name: 'Mostrar o banner' }));

      expect(screen.getByLabelText('Título das ofertas')).toBeDisabled();
      await userEvent.click(saveButton('Ofertas relâmpago'));
      await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ flash: { ...DEFAULT_CONFIG.flash, enabled: false } }));
    });
  });

  describe('coleções', () => {
    it('o destino oferece as seções da loja e as categorias dela', async () => {
      await renderLoaded();
      await screen.findAllByRole('option', { name: 'Categoria: Presentes' });

      const select = screen.getByLabelText('Destino da coleção 1');
      const labels = within(select).getAllByRole('option').map((option) => option.textContent);

      expect(labels).toEqual(['Produtos em destaque', 'Ofertas', 'Novidades', 'Todos os produtos', 'Categoria: Presentes']);
      expect(select).toHaveValue('section:featured');
    });

    it('escolher uma categoria grava o link de categoria', async () => {
      await renderLoaded();
      await screen.findAllByRole('option', { name: 'Categoria: Presentes' });

      await userEvent.selectOptions(screen.getByLabelText('Destino da coleção 2'), 'category:cat-1');
      await userEvent.click(saveButton('Coleções em destaque'));

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      const sent = mocks.update.mock.calls[0][0].collections;
      expect(sent).toHaveLength(2);
      expect(sent[1].link).toEqual({ type: 'category', id: 'cat-1' });
      expect(sent[0].link).toEqual({ type: 'section', section: 'featured' });
    });

    it('sem categorias, explica como criar', async () => {
      mocks.categories.mockResolvedValue({ items: [] });
      await renderLoaded();

      expect((await screen.findAllByText(/Crie categorias em "Meus produtos"/)).length).toBe(3);
    });

    it('link de marca (configurado por outro caminho) continua visível', async () => {
      const config = {
        ...DEFAULT_CONFIG,
        collections: [{ ...DEFAULT_CONFIG.collections[0], link: { type: 'brand' as const, id: 7 } }, DEFAULT_CONFIG.collections[1]],
      };
      serverState(customization(['collections'], config));
      await renderLoaded();

      const select = screen.getByLabelText('Destino da coleção 1');

      expect(select).toHaveValue('brand:7');
      expect(within(select).getByRole('option', { name: 'Link atual' })).toBeInTheDocument();
    });

    it('título, descrição e botão são obrigatórios', async () => {
      await renderLoaded();

      await userEvent.clear(screen.getByLabelText('Botão da coleção 1'));

      expect(saveButton('Coleções em destaque')).toBeDisabled();
    });
  });

  describe('banners do topo', () => {
    const file = (name = 'banner.png', size = 1000) => new File([new Uint8Array(size)], name, { type: 'image/png' });
    const bannersCard = () => within(card('Banners do topo'));
    const NEW_URL = 'https://cdn.test/users/u1/banners/x.png';

    it('lista os banners atuais, cada um com a imagem e o destino', async () => {
      await renderLoaded();

      expect(bannersCard().getAllByText(/^Banner \d$/)).toHaveLength(3);
      expect(bannersCard().getAllByAltText('Imagem atual')[0]).toHaveAttribute('src', DEFAULT_CONFIG.banners[0].imageUrl);
      const labels = within(screen.getByLabelText('Destino do banner 2')).getAllByRole('option').map((option) => option.textContent);
      expect(labels.slice(0, 2)).toEqual(['Nenhum (só a imagem)', 'Produtos em destaque']);
    });

    it('trocar a imagem de um banner envia o arquivo e grava a URL ao salvar', async () => {
      mocks.upload.mockResolvedValue({ url: NEW_URL });
      await renderLoaded();

      await userEvent.upload(bannersCard().getByLabelText('Imagem do banner 1') as HTMLInputElement, file());

      await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(bannersCard().getAllByAltText('Imagem atual')[0]).toHaveAttribute('src', NEW_URL));
      await userEvent.click(saveButton('Banners do topo'));
      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      const sent = mocks.update.mock.calls[0][0].banners;
      expect(sent[0]).toEqual({ imageUrl: NEW_URL, link: DEFAULT_CONFIG.banners[0].link });
      expect(sent.slice(1)).toEqual(DEFAULT_CONFIG.banners.slice(1));
    });

    it('recusa arquivo maior que 5 MB sem nem enviar', async () => {
      await renderLoaded();

      await userEvent.upload(bannersCard().getByLabelText('Imagem do banner 1') as HTMLInputElement, file('grande.png', 6 * 1024 * 1024));

      expect(await bannersCard().findByText('Imagem muito grande (máx. 5 MB).')).toBeInTheDocument();
      expect(mocks.upload).not.toHaveBeenCalled();
    });

    it('mostra o erro do servidor se o envio falhar e não muda o rascunho', async () => {
      mocks.upload.mockRejectedValue(new ApiError(400, 'UNSUPPORTED_IMAGE_TYPE', 'Formato de imagem não suportado. Envie JPEG, PNG ou WEBP.'));
      await renderLoaded();

      await userEvent.upload(bannersCard().getByLabelText('Imagem do banner 1') as HTMLInputElement, file());

      expect(await bannersCard().findByText('Formato de imagem não suportado. Envie JPEG, PNG ou WEBP.')).toBeInTheDocument();
      expect(saveButton('Banners do topo')).toBeDisabled();
    });

    it('adiciona um banner novo (sem link) ao final', async () => {
      mocks.upload.mockResolvedValue({ url: NEW_URL });
      await renderLoaded();

      await userEvent.upload(bannersCard().getByLabelText('Adicionar banner') as HTMLInputElement, file());

      await waitFor(() => expect(bannersCard().getAllByText(/^Banner \d$/)).toHaveLength(4));
      await userEvent.click(saveButton('Banners do topo'));
      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      const sent = mocks.update.mock.calls[0][0].banners;
      expect(sent).toHaveLength(4);
      expect(sent[3]).toEqual({ imageUrl: NEW_URL, link: null });
    });

    it('no limite de 5 banners o botão de adicionar fica desabilitado', async () => {
      const banners = Array.from({ length: 5 }, (_, index) => ({ imageUrl: `https://cdn.test/${index}.png`, link: null }));
      serverState(customization(['banners'], { ...DEFAULT_CONFIG, banners }));
      await renderLoaded();

      expect(bannersCard().getByRole('button', { name: 'Limite de 5 banners' })).toBeDisabled();
    });

    it('remove um banner, mas nunca o último', async () => {
      await renderLoaded();

      await userEvent.click(bannersCard().getByRole('button', { name: 'Remover o banner 2' }));
      expect(bannersCard().getAllByText(/^Banner \d$/)).toHaveLength(2);
      await userEvent.click(bannersCard().getByRole('button', { name: 'Remover o banner 2' }));

      expect(bannersCard().getAllByText(/^Banner \d$/)).toHaveLength(1);
      expect(bannersCard().getByRole('button', { name: 'Remover o banner 1' })).toBeDisabled();
    });

    it('muda a ordem e o destino (inclusive "Nenhum")', async () => {
      await renderLoaded();

      await userEvent.click(bannersCard().getByRole('button', { name: 'Descer o banner 1' }));
      await userEvent.selectOptions(screen.getByLabelText('Destino do banner 1'), 'none');
      await userEvent.click(saveButton('Banners do topo'));

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      const sent = mocks.update.mock.calls[0][0].banners;
      expect(sent[0]).toEqual({ imageUrl: DEFAULT_CONFIG.banners[1].imageUrl, link: null });
      expect(sent[1]).toEqual(DEFAULT_CONFIG.banners[0]);
    });

    it('restaurar o padrão grava null', async () => {
      const custom = { ...DEFAULT_CONFIG, banners: [{ imageUrl: NEW_URL, link: null }] };
      serverState(customization(['banners'], custom));
      await renderLoaded();

      await userEvent.click(resetButton('Banners do topo'));

      await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ banners: null }));
    });
  });
});
