import { describe, expect, it } from 'vitest';
import { homeData, many, onSale, product } from '@/test/storefrontFixtures';
import {
  collectionLinkImage,
  collectionProducts,
  discountPercent,
  maxDiscount,
  pad2,
  pickImages,
  productImage,
  resolveLink,
  SECTION_IDS,
  splitCountdown,
} from './home';

describe('discountPercent', () => {
  it('calcula o percentual de uma promoção que vale', () => {
    expect(discountPercent(onSale('a', 100, 80))).toBe(20);
    expect(discountPercent(onSale('b', 49.9, 39.9))).toBe(20);
  });

  it('é 0 sem promoção, com promoção vencida ou preço inconsistente', () => {
    expect(discountPercent(product('a'))).toBe(0);
    expect(discountPercent(product('b', { price: 100, promoPrice: 70, isPromoActive: false }))).toBe(0);
    expect(discountPercent(onSale('c', 100, 120))).toBe(0);
    expect(discountPercent(onSale('d', 0, 0))).toBe(0);
  });
});

describe('maxDiscount', () => {
  it('pega o maior desconto da lista', () => {
    expect(maxDiscount([onSale('a', 100, 90), onSale('b', 100, 60), product('c')])).toBe(40);
  });

  it('é 0 numa lista sem promoção ou vazia', () => {
    expect(maxDiscount([product('a')])).toBe(0);
    expect(maxDiscount([])).toBe(0);
  });
});

describe('imagens', () => {
  it('productImage prefere a imagem grande e cai para a pequena', () => {
    expect(productImage(product('a'))).toBe('https://img.test/a.jpg');
    expect(productImage(product('a', { image: null }))).toBe('https://img.test/a-sm.jpg');
    expect(productImage(product('a', { image: null, imageSm: null }))).toBeNull();
  });

  it('pickImages não repete foto nem passa do limite, e ignora produto sem foto', () => {
    const products = [
      product('a'),
      product('b', { image: null, imageSm: null }),
      product('c', { image: 'https://img.test/a.jpg' }),
      product('d'),
      product('e'),
    ];

    expect(pickImages(products, 2)).toEqual(['https://img.test/a.jpg', 'https://img.test/d.jpg']);
    expect(pickImages(products, 10)).toEqual(['https://img.test/a.jpg', 'https://img.test/d.jpg', 'https://img.test/e.jpg']);
    expect(pickImages([], 3)).toEqual([]);
  });
});

describe('resolveLink', () => {
  it('seção vira rolagem até a âncora certa', () => {
    expect(resolveLink({ type: 'section', section: 'featured' })).toEqual({ kind: 'scroll', id: SECTION_IDS.featured });
    expect(resolveLink({ type: 'section', section: 'offers' })).toEqual({ kind: 'scroll', id: SECTION_IDS.offers });
    expect(resolveLink({ type: 'section', section: 'new' })).toEqual({ kind: 'scroll', id: SECTION_IDS.newArrivals });
    expect(resolveLink({ type: 'section', section: 'catalog' })).toEqual({ kind: 'scroll', id: SECTION_IDS.catalog });
  });

  it('categoria e marca viram filtro (o id da marca vira texto)', () => {
    expect(resolveLink({ type: 'category', id: 'cat-1' })).toEqual({ kind: 'filter', filter: { type: 'category', id: 'cat-1' } });
    expect(resolveLink({ type: 'brand', id: 7 })).toEqual({ kind: 'filter', filter: { type: 'brand', id: '7' } });
  });
});

describe('coleções', () => {
  const home = homeData();

  it('ilustra com os produtos da seção que o link aponta', () => {
    expect(collectionProducts({ type: 'section', section: 'offers' }, home)).toBe(home.offers.products);
    expect(collectionProducts({ type: 'section', section: 'new' }, home)).toBe(home.newArrivals);
    expect(collectionProducts({ type: 'section', section: 'featured' }, home)).toBe(home.featured);
    expect(collectionProducts({ type: 'section', section: 'catalog' }, home)).toBe(home.featured);
  });

  it('link de categoria ou marca não tem produtos da seção', () => {
    expect(collectionProducts({ type: 'category', id: 'cat-1' }, home)).toEqual([]);
  });

  it('usa a foto do atalho quando o link é de categoria ou marca', () => {
    expect(collectionLinkImage({ type: 'brand', id: 1 }, home.categories)).toBe('https://img.test/natura.jpg');
    expect(collectionLinkImage({ type: 'category', id: 'cat-1' }, home.categories)).toBeNull();
    expect(collectionLinkImage({ type: 'brand', id: 99 }, home.categories)).toBeNull();
    expect(collectionLinkImage({ type: 'section', section: 'new' }, home.categories)).toBeNull();
  });

  it('many() gera ids diferentes', () => {
    expect(new Set(many('x', 5).map((item) => item.id)).size).toBe(5);
  });
});

describe('splitCountdown', () => {
  it('reparte em dias, horas, minutos e segundos', () => {
    const ms = ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000;

    expect(splitCountdown(ms)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5, finished: false });
  });

  it('nunca fica negativo e avisa quando acaba', () => {
    expect(splitCountdown(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, finished: true });
    expect(splitCountdown(999).finished).toBe(true);
  });

  it('pad2 completa com zero', () => {
    expect(pad2(4)).toBe('04');
    expect(pad2(12)).toBe('12');
  });
});
