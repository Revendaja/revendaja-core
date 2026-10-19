import {
  applyConfigUpdate,
  buildDefaultConfig,
  customizedSections,
  parseOverrides,
  resolveConfig,
  storefrontConfigSchema,
  updateStorefrontConfigSchema,
} from '../storefront.config';

const HERO = {
  badge: 'PROMOÇÃO DE VERÃO',
  title: 'Perfumes que',
  highlight: 'marcam presença',
  subtitle: 'Frete grátis em compras acima de R$ 150.',
  primaryLabel: 'Comprar',
  secondaryLabel: 'Ofertas',
  imageUrl: null,
};

describe('buildDefaultConfig', () => {
  it('usa o nome da loja nos textos', () => {
    const config = buildDefaultConfig('Leal Perfumaria');

    expect(config.announcement.text).toContain('Leal Perfumaria');
    expect(config.hero.subtitle).toContain('Leal Perfumaria');
  });

  it('é uma configuração completa e válida (4 benefícios, 2 coleções)', () => {
    const config = buildDefaultConfig('Leal');

    expect(storefrontConfigSchema.safeParse(config).success).toBe(true);
    expect(config.benefits).toHaveLength(4);
    expect(config.collections).toHaveLength(2);
  });

  it('começa com a barra, as ofertas e a arte do topo no padrão (sem imagem própria)', () => {
    const config = buildDefaultConfig('Leal');

    expect(config.announcement.enabled).toBe(true);
    expect(config.announcement.rightText).toBeNull();
    expect(config.hero.imageUrl).toBeNull();
    expect(config.flash.enabled).toBe(true);
  });
});

describe('resolveConfig', () => {
  it('sem nada gravado devolve o padrão', () => {
    expect(resolveConfig('Leal', null)).toEqual(buildDefaultConfig('Leal'));
  });

  it('só a seção alterada muda; o resto segue no padrão', () => {
    const config = resolveConfig('Leal', { hero: HERO });

    expect(config.hero).toEqual(HERO);
    expect(config.benefits).toEqual(buildDefaultConfig('Leal').benefits);
    expect(config.flash).toEqual(buildDefaultConfig('Leal').flash);
  });

  it('o padrão acompanha o nome da loja se ela trocar de nome', () => {
    expect(resolveConfig('Nome Novo', null).hero.subtitle).toContain('Nome Novo');
  });
});

describe('parseOverrides (dado gravado pode estar velho ou inválido)', () => {
  it.each([null, undefined, 'texto', 42, []])('ignora %p', (stored) => {
    expect(parseOverrides(stored)).toEqual({});
  });

  it('descarta só a seção inválida e mantém as boas', () => {
    const overrides = parseOverrides({ hero: HERO, benefits: [{ icon: 'nao-existe' }] });

    expect(overrides.hero).toEqual(HERO);
    expect(overrides.benefits).toBeUndefined();
  });

  it('ignora chaves desconhecidas', () => {
    expect(parseOverrides({ qualquerCoisa: 1 })).toEqual({});
  });
});

describe('applyConfigUpdate', () => {
  it('grava a seção enviada sem mexer nas outras', () => {
    const current = { flash: buildDefaultConfig('Leal').flash };

    const next = applyConfigUpdate(current, { hero: HERO });

    expect(next).toEqual({ flash: current.flash, hero: HERO });
  });

  it('null restaura o padrão (apaga o override da seção)', () => {
    const next = applyConfigUpdate({ hero: HERO }, { hero: null });

    expect(next).toEqual({});
  });

  it('não altera o objeto original', () => {
    const current = { hero: HERO };

    applyConfigUpdate(current, { hero: null });

    expect(current).toEqual({ hero: HERO });
  });
});

describe('customizedSections', () => {
  it('marca só as seções com override', () => {
    expect(customizedSections({ hero: HERO })).toEqual({
      announcement: false,
      hero: true,
      benefits: false,
      flash: false,
      collections: false,
    });
  });
});

describe('updateStorefrontConfigSchema', () => {
  it('exige pelo menos uma seção', () => {
    expect(updateStorefrontConfigSchema.safeParse({}).success).toBe(false);
  });

  it('aceita uma seção, ou null para restaurar', () => {
    expect(updateStorefrontConfigSchema.safeParse({ hero: HERO }).success).toBe(true);
    expect(updateStorefrontConfigSchema.safeParse({ hero: null }).success).toBe(true);
  });

  it('recusa texto vazio e texto acima do limite', () => {
    expect(
      updateStorefrontConfigSchema.safeParse({ hero: { ...HERO, title: '   ' } }).success,
    ).toBe(false);
    expect(
      updateStorefrontConfigSchema.safeParse({ hero: { ...HERO, title: 'a'.repeat(61) } }).success,
    ).toBe(false);
  });

  it('exige exatamente 4 benefícios e 2 coleções', () => {
    const benefit = { icon: 'truck', title: 'Entrega', text: 'Rápida' };
    const collection = {
      title: 'Perfumes',
      subtitle: 'Todos',
      ctaLabel: 'Ver',
      imageUrl: null,
      link: { type: 'section', section: 'catalog' },
    };

    expect(
      updateStorefrontConfigSchema.safeParse({ benefits: [benefit, benefit, benefit] }).success,
    ).toBe(false);
    expect(
      updateStorefrontConfigSchema.safeParse({ benefits: [benefit, benefit, benefit, benefit] })
        .success,
    ).toBe(true);
    expect(updateStorefrontConfigSchema.safeParse({ collections: [collection] }).success).toBe(
      false,
    );
    expect(
      updateStorefrontConfigSchema.safeParse({ collections: [collection, collection] }).success,
    ).toBe(true);
  });

  it('recusa ícone fora da lista', () => {
    const benefit = { icon: 'foguete', title: 'Entrega', text: 'Rápida' };

    expect(
      updateStorefrontConfigSchema.safeParse({ benefits: [benefit, benefit, benefit, benefit] })
        .success,
    ).toBe(false);
  });

  it('o link da coleção pode ser seção, categoria própria ou marca', () => {
    const base = { title: 'T', subtitle: 'S', ctaLabel: 'Ver', imageUrl: null };
    const make = (link: unknown) =>
      updateStorefrontConfigSchema.safeParse({
        collections: [
          { ...base, link },
          { ...base, link },
        ],
      }).success;

    expect(make({ type: 'section', section: 'offers' })).toBe(true);
    expect(make({ type: 'category', id: '11111111-1111-4111-8111-111111111111' })).toBe(true);
    expect(make({ type: 'brand', id: 12 })).toBe(true);
    expect(make({ type: 'section', section: 'inexistente' })).toBe(false);
    expect(make({ type: 'category', id: 'nao-e-uuid' })).toBe(false);
  });

  it('imagem precisa ser um link https do nosso bucket (sem javascript:, http solto, texto ou site de fora)', () => {
    const bucket = process.env.S3_PUBLIC_BASE_URL;
    const hero = (imageUrl: string) =>
      updateStorefrontConfigSchema.safeParse({ hero: { ...HERO, imageUrl } }).success;

    expect(hero(`${bucket}/users/u1/banners/a.jpg`)).toBe(true);
    // Imagem de terceiros (rastreador, conteúdo alheio) não entra na vitrine.
    expect(hero('https://cdn.exemplo.com/banner.jpg')).toBe(false);
    expect(hero('javascript:alert(1)')).toBe(false);
    expect(hero('http://exemplo.com/banner.jpg')).toBe(false);
    expect(hero('banner.jpg')).toBe(false);
  });
});
