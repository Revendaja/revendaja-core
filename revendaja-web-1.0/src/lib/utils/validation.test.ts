import { describe, expect, it } from 'vitest';
import {
  isValidEmail,
  isValidName,
  isValidPassword,
  isValidWhatsapp,
  maskWhatsapp,
  normalizeEmail,
  toApiWhatsapp,
} from './validation';

describe('e-mail', () => {
  it('normaliza para minúsculas e sem espaços nas pontas', () => {
    expect(normalizeEmail('  Ana@Exemplo.COM ')).toBe('ana@exemplo.com');
  });

  it('aceita e recusa formatos', () => {
    expect(isValidEmail('ana@exemplo.com')).toBe(true);
    expect(isValidEmail('ana@exemplo')).toBe(false);
    expect(isValidEmail('sem-arroba.com')).toBe(false);
  });
});

describe('senha', () => {
  it('exige de 6 a 72 caracteres', () => {
    expect(isValidPassword('12345')).toBe(false);
    expect(isValidPassword('123456')).toBe(true);
    expect(isValidPassword('a'.repeat(72))).toBe(true);
    expect(isValidPassword('a'.repeat(73))).toBe(false);
  });
});

describe('nome', () => {
  it('respeita os limites e ignora espaços nas pontas', () => {
    expect(isValidName('A')).toBe(false);
    expect(isValidName('  Al  ')).toBe(true);
    expect(isValidName('a'.repeat(121))).toBe(false);
  });
});

describe('WhatsApp', () => {
  it('forma a máscara enquanto digita', () => {
    expect(maskWhatsapp('11')).toBe('(11');
    expect(maskWhatsapp('119822')).toBe('(11) 9822');
    expect(maskWhatsapp('11982214432')).toBe('(11) 98221-4432');
  });

  it('aceita número fixo (10 dígitos)', () => {
    expect(maskWhatsapp('1132214432')).toBe('(11) 3221-4432');
  });

  it('tira o DDI ao colar um número completo', () => {
    expect(maskWhatsapp('+55 (11) 98221-4432', '')).toBe('(11) 98221-4432');
  });

  it('valida DDD + 8 ou 9 dígitos', () => {
    expect(isValidWhatsapp('(11) 98221-4432')).toBe(true);
    expect(isValidWhatsapp('(11) 3221-4432')).toBe(true);
    expect(isValidWhatsapp('(01) 98221-4432')).toBe(false);
    expect(isValidWhatsapp('(11) 9822-443')).toBe(false);
  });

  it('manda para a API só dígitos com DDI', () => {
    expect(toApiWhatsapp('(11) 98221-4432')).toBe('5511982214432');
  });
});
