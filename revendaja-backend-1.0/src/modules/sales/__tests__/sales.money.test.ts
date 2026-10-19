import { fromCents, roundPercent, toCents } from '../sales.money';

describe('sales.money', () => {
  it('converte reais para centavos sem o erro do ponto flutuante', () => {
    expect(toCents(0.1 + 0.2)).toBe(30); // 0.30000000000000004 em ponto flutuante
    expect(toCents(19.99)).toBe(1999);
    // Multiplicar por 100 em ponto flutuante dá 114.99999999999999 e 56.99999999999999.
    expect(toCents(1.15)).toBe(115);
    expect(toCents(0.57)).toBe(57);
    expect(toCents(0)).toBe(0);
  });

  it('converte centavos de volta para reais', () => {
    expect(fromCents(1999)).toBe(19.99);
    expect(fromCents(0)).toBe(0);
    expect(fromCents(-250)).toBe(-2.5);
  });

  it('a soma em centavos não acumula erro (10 x 0,10 = 1,00)', () => {
    let cents = 0;
    for (let i = 0; i < 10; i++) cents += toCents(0.1);
    expect(fromCents(cents)).toBe(1);
  });

  it('roundPercent mantém 2 casas', () => {
    expect(roundPercent(42.857142)).toBe(42.86);
    expect(roundPercent(50)).toBe(50);
    expect(roundPercent(-12.3456)).toBe(-12.35);
  });
});
